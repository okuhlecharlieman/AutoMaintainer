from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import async_session
from models import MemoryEntry
from models.orm import MemoryORM, memory_to_orm, orm_to_memory
from services.llm import llm_registry

logger = logging.getLogger(__name__)


class MemoryService:
    def __init__(self):
        self._store: Dict[str, List[MemoryEntry]] = {}
        self._loaded: bool = False

    @property
    def llm(self):
        return llm_registry.get_client_for_agent("memory")

    async def initialize(self, db: Optional[AsyncSession] = None):
        """Load all persisted memories from the database."""
        if self._loaded:
            return
        async with async_session() as session:
            result = await session.execute(select(MemoryORM))
            rows = result.scalars().all()
            for row in rows:
                entry = orm_to_memory(row)
                self._add_entry(entry.repo_url, entry)
            self._loaded = True
            logger.info("Loaded %d memories from database", len(rows))

    @staticmethod
    def _repo_key(repo_url: str) -> str:
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
                await self._add_entry(repo_url, entry)

            return entries
        except Exception as e:
            logger.error("Failed to learn from pipeline: %s", e)
            return []

    async def _add_entry(self, repo_url: str, entry: MemoryEntry):
        key = self._repo_key(repo_url)
        if key not in self._store:
            self._store[key] = []

        # Deduplicate by content
        existing_contents = {e.content for e in self._store[key]}
        if entry.content in existing_contents:
            return

        self._store[key].append(entry)
        self._store[key] = sorted(
            self._store[key],
            key=lambda e: e.relevance_score,
            reverse=True,
        )[:100]

        # Persist to database
        try:
            async with async_session() as session:
                session.add(memory_to_orm(entry))
                await session.commit()
        except Exception as e:
            logger.error("Failed to persist memory to database: %s", e)

    def recall(self, repo_url: str, category: Optional[str] = None, limit: int = 10) -> List[MemoryEntry]:
        key = self._repo_key(repo_url)
        entries = self._store.get(key, [])
        if category:
            entries = [e for e in entries if e.category == category]
        return entries[:limit]

    async def add_manual(self, repo_url: str, category: str, content: str) -> MemoryEntry:
        entry = MemoryEntry(
            repo_url=repo_url,
            category=category,
            content=content,
            relevance_score=0.8,
        )
        await self._add_entry(repo_url, entry)
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