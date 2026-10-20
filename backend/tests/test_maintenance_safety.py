import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from models import AgentMessage, AgentRole, CodeChange, PipelineRun, PipelineStatus, TestResult as CheckResult
from services.change_validation import safe_path, validate_changes
from services.orchestrator import OrchestrationEngine
from services.sandbox import SandboxExecutor, run_process


def pipeline(**kwargs):
    return PipelineRun(repo_url="https://github.com/example/app", issue_url="", issue_number=1,
                       issue_title="Fix bug", owner="alice", **kwargs)


def verified():
    return pipeline(
        status=PipelineStatus.AWAITING_APPROVAL, base_branch="develop", base_sha="a" * 40,
        code_changes=[CodeChange(file_path="app.py", new_content="print('fixed')")],
        test_results=[CheckResult(test_name="pytest", executed=True, passed=True, output="1 passed")],
        agent_messages=[
            AgentMessage(agent_role=AgentRole.SECURITY, content="", metadata={"safe": True}),
            AgentMessage(agent_role=AgentRole.REVIEWER, content="",
                         metadata={"approved": True, "verdict": "approved", "critical_issues": []}),
        ],
    )


@pytest.mark.parametrize("path", ["../secret", "/secret", "a/../secret", ".git/config", "a\\b", "a//b", ""])
def test_reject_unsafe_paths(path):
    with pytest.raises(ValueError):
        safe_path(path)


def test_unknown_original_and_create_overwrite_blocked():
    with pytest.raises(ValueError, match="original"):
        validate_changes([CodeChange(file_path="app.py", new_content="x")], {}, {"app.py"})
    with pytest.raises(ValueError, match="existing"):
        validate_changes([CodeChange(file_path="app.py", new_content="x", change_type="create")], {}, {"app.py"})


def test_full_content_and_deletion_validation():
    change = CodeChange(file_path="app.py", new_content="", change_type="delete")
    validate_changes([change], {"app.py": "original"}, {"app.py"})
    assert change.original_content == "original"


@pytest.mark.parametrize("failure", ["not_run", "failed", "missing", "unsafe", "missing_security",
                                    "rejected", "contradictory", "critical"])
def test_quality_gates(failure):
    p = verified()
    if failure == "not_run":
        p.test_results[0].executed = False
    elif failure == "failed":
        p.test_results[0].passed = False
    elif failure == "missing":
        p.test_results = []
    elif failure == "unsafe":
        p.agent_messages[0].metadata["safe"] = False
    elif failure == "missing_security":
        p.agent_messages.pop(0)
    elif failure == "rejected":
        p.agent_messages[-1].metadata["approved"] = False
    elif failure == "contradictory":
        p.agent_messages[-1].metadata["verdict"] = "changes_requested"
    else:
        p.agent_messages[-1].metadata["critical_issues"] = ["blocking"]
    with pytest.raises(ValueError, match="Approval blocked"):
        OrchestrationEngine._validate_quality(p)


@pytest.mark.asyncio
async def test_approval_creates_pr_on_tested_commit_not_merged():
    engine = OrchestrationEngine()
    p = verified()
    p.code_changes.append(CodeChange(file_path="old.py", new_content="", change_type="delete"))
    engine._pipelines[p.id] = p
    gh = SimpleNamespace(
        parse_repo_url=lambda url: ("example", "app"),
        get_branch_sha=AsyncMock(return_value=p.base_sha), create_branch=AsyncMock(),
        commit_files=AsyncMock(), create_pull_request=AsyncMock(return_value={"html_url": "https://github.com/example/app/pull/2"}),
    )
    with patch.object(engine, "_persist_pipeline", AsyncMock()), patch("services.orchestrator.github_client", gh):
        await engine.approve_pipeline(p.id, github_token="test-token")
    assert p.status == PipelineStatus.PR_CREATED
    assert gh.create_branch.call_args.kwargs["sha"] == "a" * 40
    assert gh.create_pull_request.call_args.kwargs["base"] == "develop"
    assert gh.commit_files.call_args.args[4]["old.py"] is None


@pytest.mark.asyncio
async def test_stale_branch_blocks_publication():
    engine = OrchestrationEngine()
    p = verified()
    engine._pipelines[p.id] = p
    with patch.object(engine, "_persist_pipeline", AsyncMock()), \
         patch("services.orchestrator.github_client.get_branch_sha", AsyncMock(return_value="b" * 40)), \
         patch("services.orchestrator.github_client.create_branch", AsyncMock()) as create:
        await engine.approve_pipeline(p.id)
        create.assert_not_called()
    assert p.status == PipelineStatus.FAILED
    assert "changed" in p.error_message


@pytest.mark.asyncio
async def test_disabled_sandbox_never_passes():
    settings = SimpleNamespace(sandbox_enabled=False, sandbox_image="")
    with patch("services.sandbox.get_settings", return_value=settings):
        result = await SandboxExecutor().run_tests("assert True")
    assert result["success"] is False
    assert result["executed"] is False


@pytest.mark.asyncio
async def test_container_is_restricted_and_removed(tmp_path):
    settings = SimpleNamespace(sandbox_enabled=True, sandbox_image="test-image", sandbox_timeout=5)
    process = AsyncMock(return_value=(0, "1 passed"))
    with patch("services.sandbox.get_settings", return_value=settings), \
         patch("services.sandbox.shutil.which", return_value="/bin/docker"), \
         patch("services.sandbox.run_process", process):
        result = await SandboxExecutor()._run_directory(tmp_path, ["python", "-m", "pytest"])
    command = process.call_args_list[0].args[0]
    for restriction in ["--network=none", "--read-only", "--cap-drop=ALL", "--user=65534:65534", "--pull=never"]:
        assert restriction in command
    assert process.call_args_list[-1].args[0][:3] == ["docker", "rm", "-f"]
    assert result["executed"] and result["success"]


@pytest.mark.asyncio
async def test_qa_ignores_model_invented_passes():
    from agents.core_agents.qa_tester import QATesterAgent
    agent = QATesterAgent()
    with patch.object(agent, "analyze", AsyncMock(return_value={
        "test_results": [{"test_name": "imaginary", "passed": True}], "tests": []
    })), patch("services.sandbox.sandbox_executor.run_repository_tests", AsyncMock(return_value={
        "success": False, "executed": False, "output": "Worker unavailable"
    })):
        result = await agent.execute(pipeline(), {})
    assert len(result["test_results"]) == 1
    assert not result["test_results"][0].passed
    assert not result["test_results"][0].executed


@pytest.fixture
def api_client():
    from api.routes import router, orchestration_engine
    from core.auth import require_api_key
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.dependency_overrides[require_api_key] = lambda: {"user": "bob"}
    alice = pipeline()
    bob = pipeline()
    bob.owner = "bob"
    legacy = pipeline()
    legacy.owner = None
    with patch.object(orchestration_engine, "_pipelines", {p.id: p for p in [alice, bob, legacy]}):
        with TestClient(app) as client:
            yield client, alice, bob, legacy


@pytest.mark.parametrize("method,suffix", [
    ("get", ""), ("get", "/messages"), ("get", "/events"),
    ("post", "/approve"), ("post", "/reject"), ("post", "/stop"),
    ("post", "/retry"), ("delete", ""),
])
def test_other_users_cannot_access_or_mutate_pipeline(api_client, method, suffix):
    client, alice, _, legacy = api_client
    for p in (alice, legacy):
        assert getattr(client, method)(f"/api/pipelines/{p.id}{suffix}").status_code == 404


def test_pipeline_listing_scoped_before_pagination(api_client):
    client, _, bob, _ = api_client
    data = client.get("/api/pipelines?limit=1").json()
    assert [p["id"] for p in data["pipelines"]] == [bob.id]
    assert client.get(f"/api/pipelines/{bob.id}").status_code == 200


def test_user_cannot_change_global_settings(api_client):
    client, *_ = api_client
    result = client.put("/api/system/agent-models", json={"agent_models": {}})
    assert result.status_code == 403


@pytest.mark.asyncio
async def test_migration_preserves_legacy_runs_without_assigning_owner(tmp_path):
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text
    from core.database import init_db
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/legacy.db")
    async with engine.begin() as conn:
        await conn.execute(text("CREATE TABLE pipelines (id VARCHAR PRIMARY KEY, status VARCHAR)"))
        await conn.execute(text("INSERT INTO pipelines VALUES ('old', 'merged')"))
    with patch("core.database.engine", engine):
        await init_db()
        await init_db()  # Idempotent.
    async with engine.connect() as conn:
        row = (await conn.execute(text("SELECT owner, status, base_sha FROM pipelines"))).one()
    assert tuple(row) == (None, "pr_created", None)
    await engine.dispose()


@pytest.mark.parametrize("url", ["https://evil.example/a/b", "http://github.com/a/b",
                                 "https://github.com/a/b?x=1", "https://github.com/a/../b"])
def test_github_url_validation(url):
    from integrations.github import github_client
    with pytest.raises(ValueError):
        github_client.parse_repo_url(url)


def test_legacy_results_are_unverified():
    result = CheckResult(test_name="old", passed=True, output="AI prediction")
    assert result.executed is False


@pytest.mark.asyncio
async def test_developer_reads_all_complete_affected_files():
    from agents.core_agents.developer import DeveloperAgent
    contents = {f"file{i}.py": "x" * 3100 + f"UNIQUE_TAIL_{i}" for i in range(7)}
    agent = DeveloperAgent()
    response = {"changes": [{"file_path": "file6.py", "change_type": "modify", "new_content": contents["file6.py"] + "\n# fix"}]}
    with patch.object(agent, "analyze", AsyncMock(return_value=response)) as analyze:
        result = await agent.execute(pipeline(), {"file_contents": contents, "file_paths": set(contents)})
    prompt = analyze.call_args.args[0]
    assert all(f"UNIQUE_TAIL_{i}" in prompt for i in range(7))
    assert result["code_changes"][0].original_content == contents["file6.py"]


@pytest.mark.asyncio
async def test_timeout_reaps_process():
    import sys
    with pytest.raises(asyncio.TimeoutError):
        await run_process([sys.executable, "-c", "import time; time.sleep(60)"], timeout=0.05)


@pytest.mark.asyncio
async def test_docker_cleanup_on_cancellation(tmp_path):
    settings = SimpleNamespace(sandbox_enabled=True, sandbox_image="test-image", sandbox_timeout=5)
    calls = []
    async def process(command, **kwargs):
        calls.append(command)
        if command[1] == "run":
            raise asyncio.CancelledError
        return 0, ""
    with patch("services.sandbox.get_settings", return_value=settings), \
         patch("services.sandbox.shutil.which", return_value="/bin/docker"), \
         patch("services.sandbox.run_process", process):
        with pytest.raises(asyncio.CancelledError):
            await SandboxExecutor()._run_directory(tmp_path, ["python", "-m", "pytest"])
    assert calls[-1][:3] == ["docker", "rm", "-f"]


@pytest.mark.asyncio
async def test_github_deletes_file_and_preserves_executable_mode():
    import httpx
    from integrations.github import GitHubClient
    real_client = httpx.AsyncClient
    recorded = []
    def handler(request):
        import json
        payload = json.loads(request.content) if request.content else {}
        recorded.append((request.method, request.url.path, payload))
        if "/git/ref/heads/" in request.url.path:
            result = {"object": {"sha": "base"}}
        elif request.url.path.endswith("/git/commits/base"):
            result = {"tree": {"sha": "tree-base"}}
        elif request.method == "GET" and "/git/trees/" in request.url.path:
            result = {"tree": [{"path": "script.sh", "mode": "100755", "type": "blob"}]}
        else:
            result = {"sha": "new"}
        return httpx.Response(200, json=result)
    transport = httpx.MockTransport(handler)
    def client_factory(**kwargs):
        return real_client(transport=transport, **kwargs)
    with patch("integrations.github.httpx.AsyncClient", client_factory):
        await GitHubClient().commit_files("example", "app", "fix", "fix", {"old.py": None, "script.sh": "echo ok"})
    tree = next(body["tree"] for method, path, body in recorded if method == "POST" and path.endswith("/git/trees"))
    assert tree == [{"path": "old.py", "mode": "100644", "type": "blob", "sha": None},
                    {"path": "script.sh", "mode": "100755", "type": "blob", "sha": "new"}]
