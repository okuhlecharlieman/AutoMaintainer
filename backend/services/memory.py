from typing import List, Dict, Any, Optional
from models import MemoryEntry
from services.llm import qwen_client
import json
import logging

logger = logging.getLogger(__name__)


class MemoryService:
    def __init__(self):
        self._store: Dict[str, List[MemoryEntry]] = {}
        self.llm = qwen_client

    def _repo_key(self, repo_url: str) -> str:
        return repo_url.rstrip("/").lower()

    async def learn(self, repo_url: str, context: str, pipeline_result: Dict[str, Any]) -> List[MemoryEntry]:
        learn_prompt = f"""Based on this engineering task, extract learnings to remember for future tasks.

## Context
{context[:2000]}

## Result
- Status: {pipeline_result.get('status', 'unknown')}
- Changes: {len(pipeline_result.get('code_changes', []))} files modified
- Review score: {pipeline_result.get('review_score', {}).get('overall', 'N/A')}
- Issues: {pipeline_result.get('issues', [])}

Extract learnings as JSON:
{{
    "learnings": [
        {{
            "category": "pattern|convention|decision|lesson",
            "content": "what was learned",
            "importance": 0.0-1.0
        }}
    ]
}}"""

        try:
            result = await self.llm.structured_chat(
                system_prompt="You extract engineering learnings from code changes. Be concise and actionable. Respond in JSON.",
                user_prompt=learn_prompt,
            )

            entries = []
            for learning in result.get("learnings", []):
                entry = MemoryEntry(
                    repo_url=repo_url,
                    category=learning.get("category", "lesson"),
                    content=learning.get("content", ""),
                    relevance_score=learning.get("importance", 0.5),
                )
                entries.append(entry)
                self._add_entry(repo_url, entry)

            return entries
        except Exception as e:
            logger.error(f"Failed to learn from pipeline: {e}")
            return []

    def _add_entry(self, repo_url: str, entry: MemoryEntry):
        key = self._repo_key(repo_url)
        if key not in self._store:
            self._store[key] = []
        self._store[key].append(entry)
        self._store[key] = sorted(
            self._store[key],
            key=lambda e: e.relevance_score,
            reverse=True,
        )[:100]

    def recall(self, repo_url: str, category: Optional[str] = None, limit: int = 10) -> List[MemoryEntry]:
        key = self._repo_key(repo_url)
        entries = self._store.get(key, [])
        if category:
            entries = [e for e in entries if e.category == category]
        return entries[:limit]

    def add_manual(self, repo_url: str, category: str, content: str) -> MemoryEntry:
        entry = MemoryEntry(
            repo_url=repo_url,
            category=category,
            content=content,
            relevance_score=0.8,
        )
        self._add_entry(repo_url, entry)
        return entry

    def get_repo_memory(self, repo_url: str) -> Dict[str, List[MemoryEntry]]:
        key = self._repo_key(repo_url)
        entries = self._store.get(key, [])
        grouped: Dict[str, List[MemoryEntry]] = {}
        for entry in entries:
            if entry.category not in grouped:
                grouped[entry.category] = []
            grouped[entry.category].append(entry)
        return grouped


memory_service = MemoryService()
