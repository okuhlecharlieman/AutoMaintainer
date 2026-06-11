from __future__ import annotations

import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, APIKeyHeader

from core.config import get_settings

http_bearer = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# ── Simple in-memory rate limiter (sliding window) ─────────────────────────
# Keyed by client IP; stores list of request timestamps.
# In production behind a reverse proxy, use X-Forwarded-For or a Redis-backed limiter.
_RATE_LIMIT_WINDOW = 60  # seconds
_RATE_LIMIT_MAX = 120    # requests per window
_request_log: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    cutoff = now - _RATE_LIMIT_WINDOW
    # Prune old entries
    _request_log[client_ip] = [t for t in _request_log[client_ip] if t > cutoff]
    if len(_request_log[client_ip]) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please try again later.",
        )
    _request_log[client_ip].append(now)


def _get_client_ip(request: Request) -> str:
    # Behind a proxy (nginx/Render) use the forwarded header
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def require_api_key(
    request: Request,
    bearer_credentials: HTTPAuthorizationCredentials = Security(http_bearer),
    api_key: str = Depends(api_key_header),
):
    settings = get_settings()

    # Rate limiting applies regardless of auth state
    _check_rate_limit(_get_client_ip(request))

    if not settings.auth_enabled:
        return {"user": "anonymous"}

    token = None
    if bearer_credentials and bearer_credentials.scheme.lower() == "bearer":
        token = bearer_credentials.credentials
    elif api_key:
        token = api_key

    if not token or not settings.auth_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not secrets.compare_digest(token, settings.auth_token):
        raise HTTPException(status_code=401, detail="Unauthorized")

    return {"user": "api_client"}


# Health / public endpoints that do NOT require auth
async def public_endpoint(request: Request):
    """Dependency for public endpoints — applies rate limiting only."""
    _check_rate_limit(_get_client_ip(request))
    return {"user": "public"}
