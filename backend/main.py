from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router, LoginRequest
from core.auth import public_endpoint, create_access_token
from core.config import get_settings
from core.database import init_db, async_session
from services.memory import memory_service
from services.orchestrator import orchestration_engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AutoMaintainer API starting up...")
    await init_db()
    logger.info("Database initialized")

    async with async_session() as session:
        await orchestration_engine.initialize(session)
        logger.info("Loaded persisted pipelines")

    await memory_service.initialize()
    logger.info("Loaded persisted memories")

    yield

    logger.info("AutoMaintainer API shutting down...")
    await orchestration_engine.shutdown()
    logger.info("All pipelines stopped")


app = FastAPI(
    title="AutoMaintainer API",
    description="Autonomous Open-Source Developer — AI Engineering Agent",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Middleware (order matters: last-added runs first) ──────────────────────

# Request size limit — reject oversized payloads early
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        content_length = request.headers.get("content-length")
        if content_length:
            max_bytes = settings.max_request_size_mb * 1024 * 1024
            if int(content_length) > max_bytes:
                return Response(
                    content='{"detail":"Request body too large"}',
                    status_code=413,
                    media_type="application/json",
                )
    return await call_next(request)


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)


# ── Public health endpoints (no auth) ──────────────────────────────────────

@app.get("/health", dependencies=[Depends(public_endpoint)])
async def root_health_check():
    return {"status": "healthy", "service": "automaintainer-backend"}


@app.head("/health", dependencies=[Depends(public_endpoint)])
async def root_health_check_head():
    return Response(status_code=200)


@app.get("/", dependencies=[Depends(public_endpoint)])
async def root_status():
    return {"status": "healthy", "service": "automaintainer-backend"}


# ── Login endpoint (public — no auth, registered on app to bypass router-level require_api_key) ──

import secrets as _secrets

@app.post("/api/auth/login", dependencies=[Depends(public_endpoint)])
async def login(request: LoginRequest):
    """Authenticate and receive a JWT access token."""
    if not settings.auth_enabled:
        token = create_access_token("anonymous")
        return {"access_token": token, "token_type": "bearer"}

    if not settings.admin_password:
        raise HTTPException(status_code=401, detail="Login disabled — no admin password configured")

    if not _secrets.compare_digest(request.username, settings.admin_username) or \
       not _secrets.compare_digest(request.password, settings.admin_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(settings.admin_username)
    return {"access_token": token, "token_type": "bearer"}


# ── API router ─────────────────────────────────────────────────────────────

app.include_router(router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=False,     # NEVER use reload=True in production
        access_log=True,
    )