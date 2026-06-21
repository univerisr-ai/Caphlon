"""SQLAlchemy ORM models for Project Underdog."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    Index,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class TaskModel(Base):
    __tablename__ = "tasks"

    task_id = Column(String(64), primary_key=True)
    task_type = Column(String(32), nullable=False, index=True)
    description = Column(Text, default="")
    payload_json = Column(Text, default="{}")
    status = Column(String(32), nullable=False, default="pending", index=True)
    assigned_workers_json = Column(Text, default="[]")
    min_workers = Column(Integer, default=3)
    results_json = Column(Text, default="{}")
    consensus_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_tasks_status_created", "status", "created_at"),
    )

    def get_payload(self) -> dict[str, Any]:
        return json.loads(self.payload_json or "{}")

    def set_payload(self, value: dict[str, Any]) -> None:
        self.payload_json = json.dumps(value, ensure_ascii=False, default=str)

    def get_assigned_workers(self) -> list[str]:
        return json.loads(self.assigned_workers_json or "[]")

    def set_assigned_workers(self, value: list[str]) -> None:
        self.assigned_workers_json = json.dumps(value)

    def get_results(self) -> dict[str, Any]:
        return json.loads(self.results_json or "{}")

    def set_results(self, value: dict[str, Any]) -> None:
        self.results_json = json.dumps(value, ensure_ascii=False, default=str)

    def get_consensus(self) -> dict[str, Any] | None:
        if not self.consensus_json:
            return None
        return json.loads(self.consensus_json)

    def set_consensus(self, value: dict[str, Any] | None) -> None:
        if value is None:
            self.consensus_json = None
        else:
            self.consensus_json = json.dumps(value, ensure_ascii=False, default=str)


class WorkerModel(Base):
    __tablename__ = "workers"

    worker_id = Column(String(64), primary_key=True)
    name = Column(String(128), default="unnamed")
    status = Column(String(32), default="idle", index=True)
    capabilities_json = Column(Text, default="[]")
    reputation_score = Column(Float, default=1.0)
    tasks_completed = Column(Integer, default=0)
    tasks_failed = Column(Integer, default=0)
    connected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_heartbeat = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def get_capabilities(self) -> list[str]:
        return json.loads(self.capabilities_json or "[]")

    def set_capabilities(self, value: list[str]) -> None:
        self.capabilities_json = json.dumps(value)


class ResultModel(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker_id = Column(String(64), nullable=False, index=True)
    task_id = Column(String(64), nullable=False, index=True)
    success = Column(Integer, default=0)
    data_json = Column(Text, default="{}")
    error = Column(Text, nullable=True)
    tokens_used = Column(Integer, default=0)
    latency_ms = Column(Float, default=0.0)
    submitted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_results_worker_task", "worker_id", "task_id"),
    )

    def get_data(self) -> dict[str, Any]:
        return json.loads(self.data_json or "{}")

    def set_data(self, value: dict[str, Any]) -> None:
        self.data_json = json.dumps(value, ensure_ascii=False, default=str)


class HoneypotCheckModel(Base):
    __tablename__ = "honeypot_checks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worker_id = Column(String(64), nullable=False, index=True)
    question = Column(Text, nullable=False)
    expected = Column(Text, nullable=False)
    actual = Column(Text, nullable=False)
    passed = Column(Integer, default=0)
    checked_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class ConversationModel(Base):
    __tablename__ = "conversations"

    conversation_id = Column(String(64), primary_key=True)
    title = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    message_count = Column(Integer, default=0)


class MessageModel(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String(64), nullable=False, index=True)
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False)
    model = Column(String(128), nullable=True)
    tokens_used = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    __table_args__ = (
        Index("ix_messages_conv_time", "conversation_id", "created_at"),
    )


class KnowledgeModel(Base):
    __tablename__ = "knowledge_store"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content_hash = Column(String(64), nullable=False, unique=True, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    topic = Column(String(128), default="")
    source = Column(String(64), default="conversation")
    source_id = Column(String(64), nullable=True)
    quality_score = Column(Float, default=0.5)
    learned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
