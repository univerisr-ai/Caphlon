"""Task queue - persistent task queue with database backend."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from project_underdog.models import Task, TaskStatus, TaskType, TaskResult
from project_underdog.config import MIN_WORKERS_PER_TASK, TASK_TIMEOUT_SEC
from project_underdog.database.repository import TaskRepository

logger = logging.getLogger(__name__)


class TaskQueue:
    def __init__(self, use_db: bool = True):
        self.use_db = use_db
        self.tasks: dict[str, Task] = {}
        self._lock = asyncio.Lock()

    async def create_task(self, task_type: TaskType, description: str,
                          payload: dict[str, Any] | None = None,
                          min_workers: int = MIN_WORKERS_PER_TASK) -> Task:
        task = Task(
            task_type=task_type,
            description=description,
            payload=payload or {},
            min_workers=min_workers,
        )
        async with self._lock:
            self.tasks[task.task_id] = task

        if self.use_db:
            try:
                await TaskRepository.create_or_update(
                    task_id=task.task_id,
                    task_type=task_type.value,
                    description=description,
                    payload=payload or {},
                    min_workers=min_workers,
                    status="pending",
                )
            except Exception as e:
                logger.warning("DB persistence failed for task creation: %s", e)

        logger.info("Gorev olusturuldu: %s (%s)", task.task_id, task_type.value)
        return task

    async def get_task(self, task_id: str) -> Optional[Task]:
        return self.tasks.get(task_id)

    async def get_available_task(self) -> Optional[Task]:
        async with self._lock:
            for task in self.tasks.values():
                if task.status in (TaskStatus.PENDING, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS):
                    if len(task.assigned_workers) < task.min_workers:
                        return task
        return None

    async def assign_task(self, task_id: str, worker_id: str) -> bool:
        async with self._lock:
            task = self.tasks.get(task_id)
            if not task:
                return False
            if worker_id in task.assigned_workers:
                return False
            if task.status == TaskStatus.PENDING:
                task.status = TaskStatus.ASSIGNED
            task.assigned_workers.append(worker_id)
            task.status = TaskStatus.IN_PROGRESS

        if self.use_db:
            try:
                await TaskRepository.assign_worker(task_id, worker_id)
            except Exception as e:
                logger.warning("DB persistence failed for task assign: %s", e)

        return True

    async def submit_result(self, task_id: str, result: TaskResult) -> bool:
        async with self._lock:
            task = self.tasks.get(task_id)
            if not task:
                return False
            task.results[result.worker_id] = result.model_dump()
            if len(task.results) >= task.min_workers:
                task.status = TaskStatus.COMPLETED

        if self.use_db:
            try:
                await TaskRepository.add_result(task_id, result.worker_id, result.model_dump())
            except Exception as e:
                logger.warning("DB persistence failed for result: %s", e)

        return True

    async def finalize_task(self, task_id: str, status: TaskStatus,
                            consensus_result: dict[str, Any] | None = None):
        async with self._lock:
            task = self.tasks.get(task_id)
            if task:
                task.status = status
                if consensus_result:
                    task.consensus_result = consensus_result

        if self.use_db:
            try:
                await TaskRepository.finalize(task_id, status.value, consensus_result)
            except Exception as e:
                logger.warning("DB persistence failed for finalize: %s", e)

    async def cleanup_stale_tasks(self):
        async with self._lock:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            stale = []
            for tid, task in self.tasks.items():
                elapsed = (now - task.created_at).total_seconds()
                if task.status != TaskStatus.VERIFIED and elapsed > TASK_TIMEOUT_SEC:
                    stale.append(tid)
            for tid in stale:
                self.tasks.pop(tid, None)
                logger.warning("Zaman asimina ugrayan gorev iptal: %s", tid)

    @property
    def pending_count(self) -> int:
        return sum(1 for t in self.tasks.values() if t.status == TaskStatus.PENDING)

    @property
    def active_count(self) -> int:
        return sum(1 for t in self.tasks.values()
                   if t.status in (TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS))
