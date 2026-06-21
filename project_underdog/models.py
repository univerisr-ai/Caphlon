"""Core data models for Project Underdog."""

from enum import Enum
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4
from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    VERIFIED = "verified"
    REJECTED = "rejected"


class WorkerStatus(str, Enum):
    IDLE = "idle"
    BUSY = "busy"
    OFFLINE = "offline"


class TaskType(str, Enum):
    PING = "ping"
    QA_GENERATION = "qa_generation"
    RESEARCH = "research"
    VALIDATION = "validation"
    HONEYPOT = "honeypot"


class WorkerInfo(BaseModel):
    worker_id: str = Field(default_factory=lambda: f"vbs-{uuid4().hex[:8]}")
    name: str = "unnamed"
    status: WorkerStatus = WorkerStatus.IDLE
    capabilities: list[str] = Field(default_factory=list)
    reputation_score: float = 1.0
    tasks_completed: int = 0
    tasks_failed: int = 0
    last_heartbeat: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    connected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Task(BaseModel):
    task_id: str = Field(default_factory=lambda: f"task-{uuid4().hex[:8]}")
    task_type: TaskType
    description: str
    payload: dict = Field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    assigned_workers: list[str] = Field(default_factory=list)
    min_workers: int = 3
    results: dict[str, dict] = Field(default_factory=dict)
    consensus_result: Optional[dict] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deadline: Optional[datetime] = None


class TaskResult(BaseModel):
    worker_id: str
    task_id: str
    success: bool
    data: dict = Field(default_factory=dict)
    error: Optional[str] = None
    tokens_used: int = 0
    latency_ms: float = 0.0
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
