import httpx
from typing import Dict, Any, Optional, List
from core.config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()


class GitHubClient:
    BASE_URL = "https://api.github.com"

    def __init__(self):
        self.headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "AutoMaintainer/1.0",
        }
        if settings.github_token:
            self.headers["Authorization"] = f"token {settings.github_token}"

    async def get_issue(self, owner: str, repo: str, issue_number: int) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/issues/{issue_number}",
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    async def get_repo_info(self, owner: str, repo: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}",
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    async def get_file_tree(self, owner: str, repo: str) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees/main?recursive=1",
                headers=self.headers,
            )
            if response.status_code == 404:
                response = await client.get(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees/master?recursive=1",
                    headers=self.headers,
                )
            response.raise_for_status()
            return response.json().get("tree", [])

    async def get_file_content(self, owner: str, repo: str, path: str, ref: str = "main") -> Optional[str]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/contents/{path}",
                headers=self.headers,
                params={"ref": ref},
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("encoding") == "base64":
                    import base64
                    return base64.b64decode(data["content"]).decode("utf-8", errors="replace")
                return data.get("content", "")
            return None

    async def create_pull_request(
        self,
        owner: str,
        repo: str,
        title: str,
        body: str,
        head: str,
        base: str = "main",
    ) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/repos/{owner}/{repo}/pulls",
                headers=self.headers,
                json={
                    "title": title,
                    "body": body,
                    "head": head,
                    "base": base,
                },
            )
            response.raise_for_status()
            return response.json()

    async def create_branch(self, owner: str, repo: str, branch_name: str, from_ref: str = "main") -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            ref_response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/ref/heads/{from_ref}",
                headers=self.headers,
            )
            if ref_response.status_code == 404:
                ref_response = await client.get(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/git/ref/heads/master",
                    headers=self.headers,
                )
            ref_response.raise_for_status()
            sha = ref_response.json()["object"]["sha"]

            response = await client.post(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/refs",
                headers=self.headers,
                json={"ref": f"refs/heads/{branch_name}", "sha": sha},
            )
            response.raise_for_status()
            return response.json()

    async def commit_files(
        self,
        owner: str,
        repo: str,
        branch: str,
        message: str,
        files: Dict[str, str],
    ) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            contents = []
            for path, content in files.items():
                existing = await client.get(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/contents/{path}",
                    headers=self.headers,
                    params={"ref": branch},
                )
                file_data: Dict[str, Any] = {
                    "path": path,
                    "content": content,
                    "message": message,
                    "branch": branch,
                }
                if existing.status_code == 200:
                    file_data["sha"] = existing.json()["sha"]

                response = await client.put(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/contents/{path}",
                    headers=self.headers,
                    json=file_data,
                )
                response.raise_for_status()
                contents.append(response.json())

            return {"commits": contents}

    def parse_repo_url(self, url: str) -> tuple[str, str]:
        parts = url.rstrip("/").split("/")
        if len(parts) >= 2:
            return parts[-2], parts[-1]
        raise ValueError(f"Invalid repo URL: {url}")


github_client = GitHubClient()
