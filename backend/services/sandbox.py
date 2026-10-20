"""Execute repository checks only in an explicitly configured Docker worker.

The API process never executes repository scripts. Images must contain the
project's dependencies; network access is disabled while checks run.
"""
import asyncio
import base64
import json
import os
from pathlib import Path
import shutil
import signal
import tempfile
import time
import uuid

from core.config import get_settings
from services.change_validation import safe_path


async def run_process(command, *, cwd=None, env=None, timeout=30):
    proc = await asyncio.create_subprocess_exec(
        *command, cwd=cwd, env=env, start_new_session=True,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )

    async def collect():
        chunks = bytearray()
        while chunk := await proc.stdout.read(4096):
            if len(chunks) < 12000:
                chunks.extend(chunk[:12000 - len(chunks)])
        await proc.wait()
        return proc.returncode, chunks.decode("utf-8", errors="replace")

    try:
        return await asyncio.wait_for(collect(), timeout)
    finally:
        if proc.returncode is None:
            os.killpg(proc.pid, signal.SIGKILL)
            await proc.wait()


class SandboxExecutor:
    @staticmethod
    def unavailable(reason):
        return {"success": False, "executed": False, "output": reason, "skipped": True}

    async def _run_directory(self, directory: Path, command: list[str], workdir="."):
        settings = get_settings()
        if not settings.sandbox_enabled or not settings.sandbox_image:
            return self.unavailable("Tests not run: configure SANDBOX_ENABLED and SANDBOX_IMAGE")
        if not shutil.which("docker"):
            return self.unavailable("Tests not run: Docker is unavailable")
        if not isinstance(command, list) or not command or not all(isinstance(x, str) and x for x in command):
            raise ValueError("Sandbox test command must be a non-empty JSON string array")
        if workdir != ".":
            safe_path(workdir)
        # Reject symlinks so generated changes and test cwd cannot escape the checkout.
        for path in directory.rglob("*"):
            if path.is_symlink():
                raise ValueError("Sandbox checkouts must not contain symlinks")
            path.chmod(0o777 if path.is_dir() or path.stat().st_mode & 0o111 else 0o666)
        directory.chmod(0o777)
        name = "automaint-" + uuid.uuid4().hex
        args = [
            "docker", "run", "--rm", "--pull=never", "--name", name,
            "--network=none", "--read-only", "--cap-drop=ALL",
            "--security-opt=no-new-privileges", "--pids-limit=128",
            "--memory=512m", "--cpus=1", "--user=65534:65534",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=128m",
            "--mount", f"type=bind,src={directory.resolve()},dst=/workspace",
            "--workdir", "/workspace" + ("/" + workdir if workdir != "." else ""),
            "--env", "HOME=/tmp", "--env", "CI=true",
            "--entrypoint", command[0], settings.sandbox_image, *command[1:],
        ]
        started = time.perf_counter()
        try:
            code, output = await run_process(args, timeout=settings.sandbox_timeout)
            return {"success": code == 0, "executed": code not in (125, 126, 127),
                    "output": output, "return_code": code,
                    "duration_ms": round((time.perf_counter() - started) * 1000)}
        except asyncio.TimeoutError:
            return {"success": False, "executed": True, "output": "Test execution timed out"}
        finally:
            # Removing the CLI process alone does not stop the container.
            cleanup = asyncio.create_task(run_process(["docker", "rm", "-f", name], timeout=10))
            try:
                await asyncio.shield(cleanup)
            except (Exception, asyncio.CancelledError):
                pass

    async def run_repository_tests(self, pipeline):
        settings = get_settings()
        if not settings.sandbox_enabled or not settings.sandbox_image:
            return self.unavailable("Tests not run: configure an isolated worker image and test command")
        if not shutil.which("docker") or not shutil.which("git"):
            return self.unavailable("Tests not run: Git and Docker are required")
        from integrations.github import github_client
        owner, repo = github_client.parse_repo_url(pipeline.repo_url)
        if not pipeline.base_sha:
            return self.unavailable("Tests not run: source commit was not pinned")
        with tempfile.TemporaryDirectory(prefix="automaint-tests-") as tmp:
            workspace = Path(tmp) / "repo"
            # Git gets credentials only for fetching. Docker never receives these variables.
            env = {"PATH": os.environ.get("PATH", ""), "HOME": tmp,
                   "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0"}
            token = pipeline.github_token or settings.github_token
            if token:
                auth = base64.b64encode(f"x-access-token:{token}".encode()).decode()
                env.update(GIT_CONFIG_COUNT="1",
                           GIT_CONFIG_KEY_0="http.https://github.com/.extraheader",
                           GIT_CONFIG_VALUE_0=f"Authorization: Basic {auth}")
            try:
                code, _ = await run_process(
                    ["git", "clone", "--no-checkout", "--", f"https://github.com/{owner}/{repo}.git", str(workspace)],
                    env=env, timeout=60)
                if code:
                    return self.unavailable("Repository checkout failed; check GitHub access")
                code, _ = await run_process(["git", "checkout", "--detach", pipeline.base_sha],
                                            cwd=workspace, env=env, timeout=30)
                if code:
                    return self.unavailable("Pinned source commit could not be checked out")
            except asyncio.TimeoutError:
                return self.unavailable("Repository checkout timed out")
            shutil.rmtree(workspace / ".git")
            if any(p.is_symlink() for p in workspace.rglob("*")):
                return self.unavailable("Repository contains unsupported symlinks")
            for change in pipeline.code_changes:
                target = workspace / safe_path(change.file_path)
                if change.change_type == "delete":
                    target.unlink()
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(change.new_content)
            command = json.loads(settings.sandbox_test_command)
            return await self._run_directory(workspace, command, settings.sandbox_workdir)

    async def execute_code(self, code, language="python", filename="test_script"):
        commands = {"python": ("script.py", ["python", "script.py"]),
                    "javascript": ("script.js", ["node", "script.js"]),
                    "bash": ("script.sh", ["bash", "script.sh"])}
        if language not in commands:
            return self.unavailable(f"Unsupported sandbox language: {language}")
        path, command = commands[language]
        with tempfile.TemporaryDirectory(prefix="automaint-code-") as tmp:
            directory = Path(tmp)
            (directory / path).write_text(code)
            return await self._run_directory(directory, command)

    async def run_tests(self, test_code, source_code="", language="python"):
        if language != "python":
            return self.unavailable("Standalone test execution supports Python only")
        with tempfile.TemporaryDirectory(prefix="automaint-unit-") as tmp:
            directory = Path(tmp)
            (directory / "source.py").write_text(source_code)
            (directory / "test_file.py").write_text(test_code)
            return await self._run_directory(directory, ["python", "-m", "pytest", "-q", "test_file.py"])


sandbox_executor = SandboxExecutor()
