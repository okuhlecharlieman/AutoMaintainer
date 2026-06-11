from __future__ import annotations

import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, APIKeyHeader

from core.config import get_settings

http_bearer = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# ── Simple in-memory rate limiter (sliding window) ─────────────────────────
_RATE_LIMIT_WINDOW = 60  # seconds
_RATE_LIMIT_MAX = 120    # requests per window
_request_log: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    cutoff = now - _RATE_LIMIT_WINDOW
    _request_log[client_ip] = [t for t in _request_log[client_ip] if t > cutoff]
    if len(_request_log[client_ip]) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please try again later.",
        )
    _request_log[client_ip].append(now)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── JWT helpers ────────────────────────────────────────────────────────────

def _get_jwt_secret(settings) -> str:
    if settings.jwt_secret:
        return settings.jwt_secret
    # Fallback: derive from auth_token or admin_password so deployment only needs one secret
    if settings.auth_token:
        return settings.auth_token
    if settings.admin_password:
        return settings.admin_password
    raise HTTPException(status_code=500, detail="No secret available for JWT signing")


def create_access_token(username: str) -> str:
    settings = get_settings()
    secret = _get_jwt_secret(settings)
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiration_hours)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_access_token(token: str) -> dict:
    settings = get_settings()
    secret = _get_jwt_secret(settings)
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Auth dependencies ──────────────────────────────────────────────────────

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

    # Try JWT first (Bearer token with JWT format)
    if bearer_credentials and bearer_credentials.scheme.lower() == "bearer":
        token = bearer_credentials.credentials
        # If auth_token is set and token matches it, accept as static API key
        if settings.auth_token and secrets.compare_digest(token, settings.auth_token):
            return {"user": "api_client"}
        # Otherwise treat as JWT
        payload = verify_access_token(token)
        return {"user": payload.get("sub", "unknown")}

    # Try X-API-Key header (static API key only)
    if api_key:
        if settings.auth_token and secrets.compare_digest(api_key, settings.auth_token):
            return {"user": "api_client"}
        # X-API-Key is not used for JWT
        raise HTTPException(status_code=401, detail="Unauthorized")

    raise HTTPException(status_code=401, detail="Unauthorized")


# Health / public endpoints that do NOT require auth
async def public_endpoint(request: Request):
    """Dependency for public endpoints — applies rate limiting only."""
    _check_rate_limit(_get_client_ip(request))
    return {"user": "public"}