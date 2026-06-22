import httpx
from typing import Dict, Any, Optional, List
from core.config import get_settings
import base64
import logging

logger = logging.getLogger(__name__)
settings = get_settings()


class GitHubClient:
    BASE_URL = "https://api.github.com"
    DEFAULT_TIMEOUT = 30.0

    def __init__(self):
        self.headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "AutoMaintainer/1.0",
        }
        if settings.github_token:
            self.headers["Authorization"] = f"token {settings.github_token}"

    def _headers(self, token: Optional[str] = None) -> Dict[str, str]:
        """Return request headers, optionally overriding the Authorization token."""
        if token:
            headers = {k: v for k, v in self.headers.items() if k != "Authorization"}
            headers["Authorization"] = f"token {token}"
            return headers
        return self.headers

    async def get_issue(self, owner: str, repo: str, issue_number: int, token: Optional[str] = None) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.DEFAULT_TIMEOUT) as client:
            response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/issues/{issue_number}",
                headers=self._headers(token),
            )
            response.raise_for_status()
            return response.json()

    async def get_repo_info(self, owner: str, repo: str, token: Optional[str] = None) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.DEFAULT_TIMEOUT) as client:
            response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}",
                headers=self._headers(token),
            )
            response.raise_for_status()
            return response.json()

    async def get_file_tree(self, owner: str, repo: str, token: Optional[str] = None) -> List[Dict[str, Any]]:
        headers = self._headers(token)
        async with httpx.AsyncClient(timeout=self.DEFAULT_TIMEOUT) as client:
            response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees/main?recursive=1",
                headers=headers,
            )
            if response.status_code == 404:
                response = await client.get(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees/master?recursive=1",
                    headers=headers,
                )
            response.raise_for_status()
            return response.json().get("tree", [])

    async def get_file_content(self, owner: str, repo: str, path: str, ref: str = "main", token: Optional[str] = None) -> Optional[str]:
        async with httpx.AsyncClient(timeout=self.DEFAULT_TIMEOUT) as client:
            response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/contents/{path}",
                headers=self._headers(token),
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
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.DEFAULT_TIMEOUT) as client:
            response = await client.post(
                f"{self.BASE_URL}/repos/{owner}/{repo}/pulls",
                headers=self._headers(token),
                json={
                    "title": title,
                    "body": body,
                    "head": head,
                    "base": base,
                },
            )
            response.raise_for_status()
            return response.json()

    async def create_branch(self, owner: str, repo: str, branch_name: str, from_ref: str = "main", token: Optional[str] = None) -> Dict[str, Any]:
        headers = self._headers(token)
        async with httpx.AsyncClient(timeout=self.DEFAULT_TIMEOUT) as client:
            # Check if branch already exists — reuse it instead of creating (avoids 422)
            existing = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/ref/heads/{branch_name}",
                headers=headers,
            )
            if existing.status_code == 200:
                return existing.json()

            # Get the SHA of the base branch
            ref_response = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/ref/heads/{from_ref}",
                headers=headers,
            )
            if ref_response.status_code == 404:
                ref_response = await client.get(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/git/ref/heads/master",
                    headers=headers,
                )
            ref_response.raise_for_status()
            sha = ref_response.json()["object"]["sha"]

            response = await client.post(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/refs",
                headers=headers,
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
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Commit multiple files atomically using the Git Trees API (single commit)."""
        headers = self._headers(token)
        async with httpx.AsyncClient(timeout=60.0) as client:
            # 1. Get the current commit SHA for this branch
            ref_resp = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/ref/heads/{branch}",
                headers=headers,
            )
            ref_resp.raise_for_status()
            base_commit_sha = ref_resp.json()["object"]["sha"]

            # 2. Get the tree SHA of the base commit
            commit_resp = await client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/commits/{base_commit_sha}",
                headers=headers,
            )
            commit_resp.raise_for_status()
            base_tree_sha = commit_resp.json()["tree"]["sha"]

            # 3. Create blobs for each file
            tree_items = []
            for path, content in files.items():
                blob_resp = await client.post(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/git/blobs",
                    headers=headers,
                    json={"content": content, "encoding": "utf-8"},
                )
                blob_resp.raise_for_status()
                blob_sha = blob_resp.json()["sha"]
                tree_items.append({
                    "path": path,
                    "mode": "100644",
                    "type": "blob",
                    "sha": blob_sha,
                })

            # 4. Create a new tree with the file changes
            tree_resp = await client.post(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees",
                headers=headers,
                json={"base_tree": base_tree_sha, "tree": tree_items},
            )
            tree_resp.raise_for_status()
            new_tree_sha = tree_resp.json()["sha"]

            # 5. Create the commit
            new_commit_resp = await client.post(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/commits",
                headers=headers,
                json={
                    "message": message,
                    "tree": new_tree_sha,
                    "parents": [base_commit_sha],
                },
            )
            new_commit_resp.raise_for_status()
            new_commit_sha = new_commit_resp.json()["sha"]

            # 6. Update the branch ref to point to the new commit
            update_resp = await client.patch(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/refs/heads/{branch}",
                headers=headers,
                json={"sha": new_commit_sha},
            )
            update_resp.raise_for_status()

            return {
                "commit_sha": new_commit_sha,
                "files_committed": len(files),
                "tree_sha": new_tree_sha,
            }

    async def list_user_repos(self, token: str) -> List[Dict[str, Any]]:
        """List repos the authenticated user has access to."""
        async with httpx.AsyncClient(timeout=self.DEFAULT_TIMEOUT) as client:
            response = await client.get(
                f"{self.BASE_URL}/user/repos",
                headers=self._headers(token),
                params={"sort": "updated", "per_page": 100, "type": "owner"},
            )
            response.raise_for_status()
            return response.json()

    def parse_repo_url(self, url: str) -> tuple[str, str]:
        parts = url.rstrip("/").split("/")
        if len(parts) >= 2:
            return parts[-2], parts[-1]
        raise ValueError(f"Invalid repo URL: {url}")


github_client = GitHubClient()
