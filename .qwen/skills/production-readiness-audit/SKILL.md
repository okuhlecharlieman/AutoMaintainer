---
name: production-readiness-audit
description: Audit a Python FastAPI backend for production readiness with a systematic checklist covering security, reliability, persistence, validation, and infrastructure.
source: auto-skill
extracted_at: '2026-06-11T15:10:55.721Z'
---

# Production Readiness Audit for FastAPI Backends

Use this checklist when a user asks you to "make the app production-ready" or to audit a Python/FastAPI backend for deployment. Follow this system in order — each layer depends on the one before it.

## Phase 1: Review all files thoroughly

Read all source files before making any changes. Understand the full dependency chain:

1. **Core layer** (config, database, auth) — lowest dependencies
2. **Models layer** (Pydantic models, ORM) — defines data shapes
3. **Services layer** (orchestrator, memory, LLM, integrations) — business logic
4. **API layer** (routes) — endpoints that consume everything above
5. **Entry point** (main.py, app factory) — wires everything together
6. **Deployment configs** (Dockerfile, nginx, docker-compose, env files, render.yaml)

## Phase 2: Identify gaps across these categories

### Security
- **Auth**: Is auth enforced by default? Are tokens validated with constant-time comparison? Are there stale module-level `settings` calls instead of `get_settings()`?
- **Rate limiting**: Is there any? At minimum, an in-memory sliding-window per IP.
- **CORS**: Are origins locked down? Methods/headers explicit?
- **Request size limits**: Middleware to reject oversized payloads early.
- **Nginx**: Add security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-Permitted-Cross-Domain-Policies).

### Reliability
- **Concurrency limits**: Can an unbounded number of async tasks be spawned? Add a semaphore.
- **Startup recovery**: Are pipelines/tasks left in a "running" state from a previous shutdown auto-recovered as FAILED?
- **Graceful shutdown**: Does the app cancel running tasks on shutdown?
- **Timezone hygiene**: Is `datetime.utcnow()` being used? Replace with `datetime.now(timezone.utc)`.
- **Exception handling**: Are CancelledError, general exceptions, and finally blocks handled in long-running tasks?

### Persistence
- **In-memory-only stores**: Are there any? Move them to database-backed persistence (SQLAlchemy ORM async).
- **DB connection**: Is pool configured? `pool_pre_ping`, `pool_recycle` for production stability.

### Input Validation
- **Field bounds**: Add `min_length`/`max_length` on all string fields, `ge`/`le` on numeric fields.
- **Enums/magic values**: Validate categories/statuses against known sets.
- **Pagination**: List endpoints need `limit`/`offset` defaults.

### Deployment Configs
- **Dockerfile**: HEALTHCHECK configured? `reload` set to `False`?
- **Environment files**: Do `.env.render`/`.env.example` include ALL new settings?
- **docker-compose**: All required env vars passed? Volumes mounted correctly?

## Phase 3: Fix in dependency order

Fix files in this exact order (each may be imported by the next):

1. `config.py` — Security defaults, validators, new settings fields
2. `database.py` — Pool config, health check, connect_args
3. `auth.py` — Rate limiting, constant-time compare, get_settings()
4. Routes — Input validation, pagination, async await corrections
5. Services (orchestrator, memory, etc.) — Concurrency, persistence, timezone
6. `main.py` — Lifespan, middleware, shutdown, remove reload
7. Deployment configs — Nginx, docker-compose, env files

## Phase 4: Verify

1. **Import check**: Run `python -c "from main import app"` — catches syntax/import errors early.
2. **Start server**: Launch with `AUTH_ENABLED=false` for testing.
3. **Test endpoints**: Health, root, list (empty), create (demo pipeline), memory CRUD.
4. **Test auth**: Verify 401 when `AUTH_ENABLED=true` without token.
5. **Clean up**: Kill test server, remove test database, check `git status` for stray files.