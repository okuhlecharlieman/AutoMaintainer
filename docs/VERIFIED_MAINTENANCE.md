# Verified maintenance workflow

## Behaviour changes

- QA model output is a set of test suggestions, never evidence of execution.
  Only the configured repository command can record an executed pass.
- Failed or unexecuted checks, unsafe security reviews, and rejected/ambiguous
  code reviews prevent approval and PR publication.
- The repository's default branch and exact source commit are pinned before
  analysis. If the branch moves before publication, rerun the pipeline.
- Complete affected files are provided to the developer. Missing or excessive
  context fails explicitly; modifications require complete original content.
- PR creation is recorded as pr_created, not merged. This change does not
  implement merge/deployment tracking or automatic merging.
- Pipeline data/actions belong to the creating user. Administrators can inspect
  legacy runs; ownership is never guessed. Repository memories are user-scoped.
- An additive database migration adds owner/base fields. Historical merged
  records become pr_created; historical AI test reports remain unverified.
- Repository deletions remove files instead of committing empty files.

## Configure actual verification

Execution is disabled by default and has **no host-subprocess fallback**.
Use a dedicated worker host with Git and Docker installed, and an operator-built
image containing the target repository's runtime and dependencies. Do not expose
a shared production Docker socket to an internet-facing deployment.

The current runner is invoked by the backend, so the Docker daemon and backend
must see the same temporary directory paths. Run the backend on the dedicated
worker host. A separate authenticated worker service/queue is future work.

For example, to test this repository, build a trusted image from the repository
root using a Dockerfile containing:

    FROM python:3.12-slim
    COPY backend/requirements.txt /tmp/requirements.txt
    RUN pip install --no-cache-dir -r /tmp/requirements.txt

Then configure the backend:

    SANDBOX_ENABLED=true
    SANDBOX_IMAGE=automaintainer-checks:local
    SANDBOX_WORKDIR=backend
    SANDBOX_TEST_COMMAND=["python","-m","pytest","-q"]

Build/tag that image on the worker before starting a run. Automatic image pulls
are disabled. For another repository, supply its dependencies and command; a
missing dependency is a failed check, never a simulated pass. The command is
operator configuration, not model output. Select a command that runs meaningful
tests (and build/type checks where appropriate). Per-repository command/image
configuration is not implemented yet.

Checks use a disposable clone of the pinned commit with proposed changes
applied. The Git token is supplied only to Git via temporary environment
configuration, never to the test container. The container has no network,
no host credentials, no capabilities, a non-root UID, a read-only root filesystem,
and CPU/memory/process limits. Only its disposable checkout and bounded /tmp
are writable. Symlink repositories are rejected. Timeout/cancellation kills the
process group and requests container removal.

The checked-out repository's existing tests run. Model-proposed test snippets
are displayed as suggestions, not silently executed or included in the PR.
A passing command is evidence for that command only, not proof of correctness.
Security analysis remains an AI review, not a comprehensive vulnerability scan.

## Deployment limitations

Docker is not available in every hosting environment. If unavailable, the UI
shows **Not run**, and approval remains blocked until a worker is configured.
Existing frontend/backend deployments must be updated together for the new
status and executed field. Back up the database before updating.

This patch does not add durable job recovery, automatic repair loops, encrypted
credential storage, or webhook-based merge tracking. GitHub OAuth credentials
remain in the existing database columns; protect database access accordingly.

## Verification

    cd backend
    python -m pytest -q
    cd ../frontend
    npm ci
    npm run build

The regression suite mocks Docker/GitHub and checks ownership, approval gates,
source pinning, deletions, migrations and honest test reporting. Validate the
configured worker with a known passing and known failing repository command
before enabling it for users.
