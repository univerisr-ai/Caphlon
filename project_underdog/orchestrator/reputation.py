"""Reputation system - persistent worker trust score management."""

from __future__ import annotations

import asyncio
import logging

from project_underdog.config import (
    REPUTATION_BASE, REPUTATION_SUCCESS_GAIN,
    REPUTATION_FAILURE_LOSS, REPUTATION_HONEYPOT_LOSS,
    REPUTATION_MIN_THRESHOLD,
)
from project_underdog.database.repository import WorkerRepository

logger = logging.getLogger(__name__)


class ReputationManager:
    def __init__(self, use_db: bool = True):
        self.use_db = use_db
        self.scores: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def get_score(self, worker_id: str) -> float:
        return self.scores.get(worker_id, REPUTATION_BASE)

    async def register_worker(self, worker_id: str):
        async with self._lock:
            if worker_id not in self.scores:
                self.scores[worker_id] = REPUTATION_BASE
                logger.info("Isci kaydedildi: %s (puan: %.2f)", worker_id, REPUTATION_BASE)

        if self.use_db:
            try:
                await WorkerRepository.register(worker_id)
            except Exception as e:
                logger.warning("DB persistence failed for worker register: %s", e)

    async def reward_success(self, worker_id: str):
        async with self._lock:
            old = self.scores.get(worker_id, REPUTATION_BASE)
            self.scores[worker_id] = min(old + REPUTATION_SUCCESS_GAIN, 2.0)
            logger.info("Isci odullendirildi: %s (%.2f -> %.2f)", worker_id, old, self.scores[worker_id])

        if self.use_db:
            try:
                await WorkerRepository.update_reputation(worker_id, self.scores[worker_id])
            except Exception:
                pass

    async def penalize_failure(self, worker_id: str):
        async with self._lock:
            old = self.scores.get(worker_id, REPUTATION_BASE)
            self.scores[worker_id] = max(old - REPUTATION_FAILURE_LOSS, REPUTATION_MIN_THRESHOLD)
            logger.info("Isci cezalandirildi: %s (%.2f -> %.2f)", worker_id, old, self.scores[worker_id])

    async def penalize_honeypot(self, worker_id: str):
        async with self._lock:
            old = self.scores.get(worker_id, REPUTATION_BASE)
            self.scores[worker_id] = max(old - REPUTATION_HONEYPOT_LOSS, REPUTATION_MIN_THRESHOLD)
            logger.warning("TUZAK! Isci agir cezalandirildi: %s (%.2f -> %.2f)", worker_id, old, self.scores[worker_id])

    async def is_trusted(self, worker_id: str) -> bool:
        score = await self.get_score(worker_id)
        return score > REPUTATION_MIN_THRESHOLD

    async def remove_worker(self, worker_id: str):
        async with self._lock:
            self.scores.pop(worker_id, None)
            logger.info("Isci sistemden cikarildi: %s", worker_id)
