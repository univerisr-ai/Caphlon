"""Repository pattern - async CRUD operations for all entities."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Sequence

from sqlalchemy import select, update, delete
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from project_underdog.database.engine import get_db_manager
from project_underdog.database.models import (
    TaskModel,
    WorkerModel,
    ResultModel,
    HoneypotCheckModel,
    ConversationModel,
    MessageModel,
    KnowledgeModel,
)

logger = logging.getLogger(__name__)


class TaskRepository:
    @staticmethod
    async def create_or_update(
        task_id: str,
        task_type: str,
        description: str = "",
        payload: dict[str, Any] | None = None,
        min_workers: int = 3,
        status: str = "pending",
    ) -> TaskModel:
        db = get_db_manager()
        async with db.session() as session:
            stmt = sqlite_insert(TaskModel).values(
                task_id=task_id,
                task_type=task_type,
                description=description,
                payload_json=json_dumps(payload or {}),
                min_workers=min_workers,
                status=status,
            ).on_conflict_do_update(
                index_elements=["task_id"],
                set_={
                    "status": status,
                    "updated_at": datetime.now(timezone.utc),
                },
            )
            await session.execute(stmt)
            result = await session.execute(
                select(TaskModel).where(TaskModel.task_id == task_id)
            )
            return result.scalar_one()

    @staticmethod
    async def get(task_id: str) -> TaskModel | None:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(TaskModel).where(TaskModel.task_id == task_id)
            )
            return result.scalar_one_or_none()

    @staticmethod
    async def get_pending(min_workers: int = 3) -> Sequence[TaskModel]:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(TaskModel)
                .where(TaskModel.status.in_(["pending", "assigned", "in_progress"]))
                .order_by(TaskModel.created_at.asc())
                .limit(50)
            )
            tasks = result.scalars().all()
            return [t for t in tasks if len(t.get_assigned_workers()) < t.min_workers]

    @staticmethod
    async def update_status(task_id: str, status: str) -> None:
        db = get_db_manager()
        async with db.session() as session:
            await session.execute(
                update(TaskModel)
                .where(TaskModel.task_id == task_id)
                .values(status=status, updated_at=datetime.now(timezone.utc))
            )

    @staticmethod
    async def assign_worker(task_id: str, worker_id: str) -> bool:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(TaskModel).where(TaskModel.task_id == task_id)
            )
            task = result.scalar_one_or_none()
            if not task:
                return False
            workers = task.get_assigned_workers()
            if worker_id in workers:
                return False
            workers.append(worker_id)
            task.set_assigned_workers(workers)
            task.status = "in_progress"
            task.updated_at = datetime.now(timezone.utc)
            return True

    @staticmethod
    async def add_result(task_id: str, worker_id: str, result_data: dict[str, Any]) -> bool:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(TaskModel).where(TaskModel.task_id == task_id)
            )
            task = result.scalar_one_or_none()
            if not task:
                return False
            results = task.get_results()
            results[worker_id] = result_data
            task.set_results(results)
            if len(results) >= task.min_workers:
                task.status = "completed"
            task.updated_at = datetime.now(timezone.utc)
            return True

    @staticmethod
    async def finalize(task_id: str, status: str, consensus: dict | None = None) -> None:
        db = get_db_manager()
        async with db.session() as session:
            task = (await session.execute(
                select(TaskModel).where(TaskModel.task_id == task_id)
            )).scalar_one_or_none()
            if task:
                task.status = status
                if consensus is not None:
                    task.set_consensus(consensus)
                task.updated_at = datetime.now(timezone.utc)

    @staticmethod
    async def cleanup_stale(timeout_seconds: int) -> int:
        db = get_db_manager()
        cutoff = datetime.now(timezone.utc)
        async with db.session() as session:
            result = await session.execute(
                select(TaskModel.task_id).where(TaskModel.status != "verified")
            )
            stale_ids = [
                tid for tid in result.scalars()
                if (await TaskRepository.get(tid)).created_at != cutoff
            ]
            count = 0
            for tid in stale_ids:
                task = await TaskRepository.get(tid)
                if task and (cutoff - task.created_at).total_seconds() > timeout_seconds:
                    task.status = "rejected"
                    task.updated_at = cutoff
                    count += 1
            return count

    @staticmethod
    async def count_by_status() -> dict[str, int]:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(select(TaskModel))
            counts: dict[str, int] = {}
            for task in result.scalars():
                counts[task.status] = counts.get(task.status, 0) + 1
            return counts


class WorkerRepository:
    @staticmethod
    async def register(worker_id: str, name: str = "unnamed",
                       capabilities: list[str] | None = None) -> WorkerModel:
        db = get_db_manager()
        async with db.session() as session:
            stmt = sqlite_insert(WorkerModel).values(
                worker_id=worker_id,
                name=name,
                capabilities_json=json_dumps(capabilities or []),
                reputation_score=1.0,
            ).on_conflict_do_update(
                index_elements=["worker_id"],
                set_={
                    "name": name,
                    "last_heartbeat": datetime.now(timezone.utc),
                },
            )
            await session.execute(stmt)
            result = await session.execute(
                select(WorkerModel).where(WorkerModel.worker_id == worker_id)
            )
            return result.scalar_one()

    @staticmethod
    async def get(worker_id: str) -> WorkerModel | None:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(WorkerModel).where(WorkerModel.worker_id == worker_id)
            )
            return result.scalar_one_or_none()

    @staticmethod
    async def update_heartbeat(worker_id: str) -> None:
        db = get_db_manager()
        async with db.session() as session:
            await session.execute(
                update(WorkerModel)
                .where(WorkerModel.worker_id == worker_id)
                .values(last_heartbeat=datetime.now(timezone.utc))
            )

    @staticmethod
    async def update_status(worker_id: str, status: str) -> None:
        db = get_db_manager()
        async with db.session() as session:
            await session.execute(
                update(WorkerModel)
                .where(WorkerModel.worker_id == worker_id)
                .values(status=status)
            )

    @staticmethod
    async def update_reputation(worker_id: str, score: float) -> None:
        db = get_db_manager()
        async with db.session() as session:
            await session.execute(
                update(WorkerModel)
                .where(WorkerModel.worker_id == worker_id)
                .values(
                    reputation_score=score,
                    tasks_completed=WorkerModel.tasks_completed + 1,
                )
            )

    @staticmethod
    async def remove(worker_id: str) -> None:
        db = get_db_manager()
        async with db.session() as session:
            await session.execute(
                delete(WorkerModel).where(WorkerModel.worker_id == worker_id)
            )

    @staticmethod
    async def find_stale(heartbeat_timeout: int) -> list[WorkerModel]:
        db = get_db_manager()
        cutoff = datetime.now(timezone.utc)
        async with db.session() as session:
            result = await session.execute(select(WorkerModel))
            stale = []
            for w in result.scalars():
                if w.last_heartbeat:
                    elapsed = (cutoff - w.last_heartbeat).total_seconds()
                    if elapsed > heartbeat_timeout:
                        stale.append(w)
            return stale


class ResultRepository:
    @staticmethod
    async def create(
        worker_id: str,
        task_id: str,
        success: bool = True,
        data: dict[str, Any] | None = None,
        error: str | None = None,
        tokens_used: int = 0,
        latency_ms: float = 0.0,
    ) -> ResultModel:
        db = get_db_manager()
        async with db.session() as session:
            result = ResultModel(
                worker_id=worker_id,
                task_id=task_id,
                success=1 if success else 0,
                error=error,
                tokens_used=tokens_used,
                latency_ms=latency_ms,
            )
            result.set_data(data or {})
            session.add(result)
            await session.flush()
            return result

    @staticmethod
    async def get_by_task(task_id: str) -> Sequence[ResultModel]:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(ResultModel)
                .where(ResultModel.task_id == task_id)
                .order_by(ResultModel.submitted_at.asc())
            )
            return result.scalars().all()

    @staticmethod
    async def get_export_data(limit: int = 1000) -> list[dict[str, Any]]:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(ResultModel, TaskModel)
                .join(TaskModel, ResultModel.task_id == TaskModel.task_id)
                .where(ResultModel.success == 1)
                .limit(limit)
            )
            rows = []
            for res, task in result.fetchall():
                rows.append({
                    "question": task.get_payload().get("question", ""),
                    "answer": res.get_data().get("answer", ""),
                    "method": res.get_data().get("method", "unknown"),
                    "tokens_used": res.tokens_used,
                    "worker_id": res.worker_id,
                    "task_id": res.task_id,
                    "submitted_at": res.submitted_at.isoformat() if res.submitted_at else None,
                })
            return rows


class HoneypotRepository:
    @staticmethod
    async def record_check(
        worker_id: str,
        question: str,
        expected: str,
        actual: str,
        passed: bool,
    ) -> HoneypotCheckModel:
        db = get_db_manager()
        async with db.session() as session:
            check = HoneypotCheckModel(
                worker_id=worker_id,
                question=question,
                expected=expected,
                actual=actual,
                passed=1 if passed else 0,
            )
            session.add(check)
            await session.flush()
            return check


class ConversationRepository:
    @staticmethod
    async def create(conversation_id: str, title: str = "") -> ConversationModel:
        db = get_db_manager()
        async with db.session() as session:
            conv = ConversationModel(
                conversation_id=conversation_id,
                title=title,
            )
            session.add(conv)
            await session.flush()
            return conv

    @staticmethod
    async def add_message(
        conversation_id: str,
        role: str,
        content: str,
        model: str = "",
        tokens_used: int = 0,
    ) -> MessageModel:
        db = get_db_manager()
        async with db.session() as session:
            msg = MessageModel(
                conversation_id=conversation_id,
                role=role,
                content=content,
                model=model,
                tokens_used=tokens_used,
            )
            session.add(msg)
            conv = (await session.execute(
                select(ConversationModel).where(
                    ConversationModel.conversation_id == conversation_id
                )
            )).scalar_one_or_none()
            if conv:
                conv.message_count = conv.message_count + 1
                conv.updated_at = datetime.now(timezone.utc)
            await session.flush()
            return msg

    @staticmethod
    async def get_messages(conversation_id: str, limit: int = 50) -> list[MessageModel]:
        from sqlalchemy import desc
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(MessageModel)
                .where(MessageModel.conversation_id == conversation_id)
                .order_by(desc(MessageModel.created_at))
                .limit(limit)
            )
            return list(result.scalars().all())

    @staticmethod
    async def list_conversations(limit: int = 20) -> list[ConversationModel]:
        from sqlalchemy import desc
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(ConversationModel)
                .order_by(desc(ConversationModel.updated_at))
                .limit(limit)
            )
            return list(result.scalars().all())


class KnowledgeRepository:
    @staticmethod
    async def store(
        content_hash: str,
        question: str,
        answer: str,
        topic: str = "",
        source: str = "conversation",
        source_id: str = "",
        quality_score: float = 0.5,
    ) -> KnowledgeModel:
        db = get_db_manager()
        async with db.session() as session:
            existing = (await session.execute(
                select(KnowledgeModel)
                .where(KnowledgeModel.content_hash == content_hash)
            )).scalar_one_or_none()
            if existing:
                return existing
            entry = KnowledgeModel(
                content_hash=content_hash,
                question=question,
                answer=answer,
                topic=topic,
                source=source,
                source_id=source_id,
                quality_score=quality_score,
            )
            session.add(entry)
            await session.flush()
            return entry

    @staticmethod
    async def count(self) -> int:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(select(KnowledgeModel))
            return len(result.scalars().all())

    @staticmethod
    async def get_export_data(limit: int = 5000) -> list[dict[str, Any]]:
        db = get_db_manager()
        async with db.session() as session:
            result = await session.execute(
                select(KnowledgeModel)
                .where(KnowledgeModel.quality_score >= 0.3)
                .limit(limit)
            )
            rows = []
            for entry in result.scalars():
                rows.append({
                    "question": entry.question,
                    "answer": entry.answer,
                    "topic": entry.topic,
                    "source": entry.source,
                    "quality_score": entry.quality_score,
                    "learned_at": entry.learned_at.isoformat() if entry.learned_at else None,
                })
            return rows


def json_dumps(obj: Any) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False, default=str)
