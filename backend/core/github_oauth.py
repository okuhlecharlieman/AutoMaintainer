from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from core.auth import create_access_token, public_endpoint
from core.config import get_settings
from core.database import async_session
from models.orm import UserORM

logger = logging.getLogger(__name__)


async def github_oauth_redirect(request: Request):
    """Redirect user to GitHub's OAuth authorize page."""
    settings = get_settings()

    if not settings.github_oauth_client_id:
        raise HTTPException(status_code=400, detail="GitHub OAuth is not configured")

    github_auth_url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_oauth_client_id}"
        f"&redirect_uri={settings.github_oauth_redirect_uri}"
        "&scope=repo read:org user:email"
    )
    return RedirectResponse(url=github_auth_url)


async def github_oauth_callback(request: Request):
    """Exchange GitHub OAuth code for access token, create/find user, issue JWT."""
    settings = get_settings()

    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing OAuth code parameter")

    error = request.query_params.get("error")
    if error:
        raise HTTPException(status_code=400, detail=f"GitHub OAuth error: {error}")

    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": settings.github_oauth_client_id,
                "client_secret": settings.github_oauth_client_secret,
                "code": code,
                "redirect_uri": settings.github_oauth_redirect_uri,
            },
            headers={"Accept": "application/json"},
        )

    if token_resp.status_code != 200:
        logger.error("GitHub token exchange failed: %s", token_resp.text)
        raise HTTPException(status_code=400, detail="Failed to exchange GitHub OAuth code")

    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        logger.error("No access_token in GitHub response: %s", token_data)
        raise HTTPException(status_code=400, detail="GitHub OAuth did not return an access token")

    # Fetch user profile from GitHub API
    async with httpx.AsyncClient() as client:
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            },
        )

    if user_resp.status_code != 200:
        logger.error("GitHub user profile fetch failed: %s", user_resp.text)
        raise HTTPException(status_code=400, detail="Failed to fetch GitHub user profile")

    github_user = user_resp.json()
    github_id = github_user.get("id")
    github_username = github_user.get("login")
    avatar_url = github_user.get("avatar_url")

    if not github_id or not github_username:
        raise HTTPException(status_code=400, detail="Incomplete GitHub user profile")

    # Create or update user in database
    async with async_session() as session:
        result = await session.execute(
            select(UserORM).where(UserORM.github_id == github_id)
        )
        user = result.scalar_one_or_none()

        if user:
            # Update existing user's token and profile
            user.github_access_token = access_token
            user.github_username = github_username
            user.avatar_url = avatar_url
            user.updated_at = datetime.now(timezone.utc)
        else:
            # Create new user
            user = UserORM(
                id=str(uuid.uuid4()),
                github_id=github_id,
                github_username=github_username,
                github_access_token=access_token,
                avatar_url=avatar_url,
            )
            session.add(user)

        await session.commit()

    # Issue JWT for the user
    jwt_token = create_access_token(github_username)

    # Redirect to frontend callback page
    frontend_url = settings.frontend_url.rstrip("/")
    return RedirectResponse(url=f"{frontend_url}/auth/callback?token={jwt_token}")
