"""Knowledge Store - hash-based dedup + vector similarity dedup.

Ensures the same information is not learned twice across the swarm.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

from project_underdog.config import get_settings
from project_underdog.database.repository import json_dumps

logger = logging.getLogger(__name__)


class KnowledgeStore:
    def __init__(self, persist_dir: str | None = None):
        settings = get_settings()
        self._persist_dir = persist_dir or str(settings.data_dir / "chroma")
        os.makedirs(self._persist_dir, exist_ok=True)

        self._chroma = chromadb.PersistentClient(
            path=self._persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self._collection = self._chroma.get_or_create_collection(
            name="underdog_knowledge",
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("KnowledgeStore baslatildi: %s (%d kayit)",
                     self._persist_dir, self._collection.count())

    @staticmethod
    def compute_hash(question: str, answer: str) -> str:
        content = f"{question.strip().lower()}|{answer.strip().lower()}"
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    @staticmethod
    def compute_hash_question(question: str) -> str:
        return hashlib.sha256(question.strip().lower().encode("utf-8")).hexdigest()

    async def is_duplicate(self, question: str, answer: str = "",
                           similarity_threshold: float = 0.85) -> tuple[bool, str]:
        content_hash = self.compute_hash(question, answer or question)

        try:
            results = self._collection.get(ids=[content_hash])
            if results and results["ids"]:
                return True, "exact_hash_match"
        except Exception:
            pass

        try:
            results = self._collection.query(
                query_texts=[question.strip()],
                n_results=1,
            )
            if results and results["distances"] and results["distances"][0]:
                closest_dist = results["distances"][0][0]
                similarity = 1.0 - closest_dist if closest_dist else 0.0
                if similarity >= similarity_threshold:
                    existing_id = results["ids"][0][0] if results["ids"][0] else "unknown"
                    return True, f"similar_{existing_id[:12]}"
        except Exception as e:
            pass

        return False, ""

    def store(self, question: str, answer: str, topic: str = "",
              source: str = "conversation", source_id: str = "",
              metadata: dict[str, Any] | None = None) -> str:
        content_hash = self.compute_hash(question, answer)

        try:
            self._collection.add(
                ids=[content_hash],
                documents=[question.strip()],
                metadatas=[{
                    "answer": answer.strip()[:1000],
                    "topic": topic,
                    "source": source,
                    "source_id": source_id,
                    "stored_at": datetime.now(timezone.utc).isoformat(),
                    **(metadata or {}),
                }],
            )
        except Exception as e:
            logger.warning("ChromaDB store warning: %s", e)

        return content_hash

    def count(self) -> int:
        try:
            return self._collection.count()
        except Exception:
            return 0

    def retrieve_similar(self, query: str, n: int = 5) -> list[dict[str, Any]]:
        try:
            results = self._collection.query(query_texts=[query], n_results=n)
            items = []
            if results and results["ids"] and results["ids"][0]:
                for i, doc_id in enumerate(results["ids"][0]):
                    meta = (results.get("metadatas") or [[{}]])[0]
                    dist = (results.get("distances") or [[1.0]])[0]
                    item_meta = meta[i] if i < len(meta) else {}
                    item_dist = dist[i] if i < len(dist) else 1.0
                    items.append({
                        "id": doc_id,
                        "question": (results.get("documents") or [[""]])[0][i] if results.get("documents") else "",
                        "answer": item_meta.get("answer", ""),
                        "topic": item_meta.get("topic", ""),
                        "similarity": round(1.0 - min(item_dist, 1.0), 3),
                    })
            return items
        except Exception:
            return []


_knowledge_store: KnowledgeStore | None = None


def get_knowledge_store() -> KnowledgeStore:
    global _knowledge_store
    if _knowledge_store is None:
        _knowledge_store = KnowledgeStore()
    return _knowledge_store
