import asyncio
import tempfile
import os
import subprocess
from typing import Dict, Any, Optional
from core.config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()


class SandboxExecutor:
    def __init__(self):
        self.timeout = settings.sandbox_timeout
        self.enabled = settings.sandbox_enabled

    async def execute_code(self, code: str, language: str = "python", filename: str = "test_script") -> Dict[str, Any]:
        if not self.enabled:
            return {"success": False, "output": "Sandbox execution disabled", "skipped": True}

        with tempfile.TemporaryDirectory(prefix="automaint_sandbox_") as tmpdir:
            ext_map = {"python": ".py", "javascript": ".js", "typescript": ".ts", "bash": ".sh"}
            ext = ext_map.get(language, ".txt")
            filepath = os.path.join(tmpdir, f"{filename}{ext}")

            with open(filepath, "w") as f:
                f.write(code)

            cmd_map = {
                "python": ["python3", filepath],
                "javascript": ["node", filepath],
                "bash": ["bash", filepath],
            }
            cmd = cmd_map.get(language, ["python3", filepath])

            try:
                result = await asyncio.wait_for(
                    asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=tmpdir,
                    ),
                    timeout=5,
                )

                proc: asyncio.subprocess.Process = result
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=self.timeout,
                )

                return {
                    "success": proc.returncode == 0,
                    "output": stdout.decode("utf-8", errors="replace")[:5000],
                    "errors": stderr.decode("utf-8", errors="replace")[:2000],
                    "return_code": proc.returncode,
                }
            except asyncio.TimeoutError:
                return {"success": False, "output": "", "errors": f"Execution timed out ({self.timeout}s)", "return_code": -1}
            except Exception as e:
                return {"success": False, "output": "", "errors": str(e), "return_code": -1}

    async def run_tests(self, test_code: str, source_code: str = "", language: str = "python") -> Dict[str, Any]:
        if not self.enabled:
            return {"success": True, "output": "Tests simulated (sandbox disabled)", "simulated": True}

        with tempfile.TemporaryDirectory(prefix="automaint_test_") as tmpdir:
            if source_code:
                source_path = os.path.join(tmpdir, "source.py")
                with open(source_path, "w") as f:
                    f.write(source_code)

            test_path = os.path.join(tmpdir, "test_file.py")
            with open(test_path, "w") as f:
                f.write(test_code)

            try:
                proc = await asyncio.create_subprocess_exec(
                    "python3", "-m", "pytest", test_path, "-v", "--tb=short",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=tmpdir,
                )
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=self.timeout,
                )

                output = stdout.decode("utf-8", errors="replace")
                return {
                    "success": proc.returncode == 0,
                    "output": output[:5000],
                    "errors": stderr.decode("utf-8", errors="replace")[:2000],
                    "return_code": proc.returncode,
                }
            except asyncio.TimeoutError:
                return {"success": False, "output": "", "errors": "Test execution timed out", "return_code": -1}
            except Exception as e:
                return {"success": False, "output": "", "errors": str(e), "return_code": -1}


sandbox_executor = SandboxExecutor()
