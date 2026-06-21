"""Tests for models."""

import pytest
from project_underdog.models import (
    TaskType, TaskStatus, WorkerStatus, Task, WorkerInfo, TaskResult,
)


class TestModels:
    def test_task_creation(self):
        task = Task(
            task_type=TaskType.QA_GENERATION,
            description="Test",
            payload={"q": "test"},
        )
        assert task.task_id.startswith("task-")
        assert task.status == TaskStatus.PENDING
        assert task.min_workers == 3

    def test_worker_info_defaults(self):
        w = WorkerInfo(name="test")
        assert w.worker_id.startswith("vbs-")
        assert w.status == WorkerStatus.IDLE
        assert w.reputation_score == 1.0

    def test_task_result(self):
        r = TaskResult(
            worker_id="vbs-1",
            task_id="task-1",
            success=True,
            data={"answer": "4"},
            tokens_used=10,
        )
        assert r.success
        assert r.data["answer"] == "4"

    def test_task_type_enum(self):
        assert TaskType.PING.value == "ping"
        assert TaskType.QA_GENERATION.value == "qa_generation"
        assert TaskType.RESEARCH.value == "research"
        assert TaskType.VALIDATION.value == "validation"
        assert TaskType.HONEYPOT.value == "honeypot"

    def test_task_status_flow(self):
        task = Task(task_type=TaskType.PING, description="ping test")
        assert task.status == TaskStatus.PENDING
        task.status = TaskStatus.ASSIGNED
        task.assigned_workers.append("vbs-1")
        task.status = TaskStatus.IN_PROGRESS
        assert task.status == TaskStatus.IN_PROGRESS

    def test_worker_status_transitions(self):
        w = WorkerInfo(name="test")
        w.status = WorkerStatus.BUSY
        assert w.status == WorkerStatus.BUSY
        w.status = WorkerStatus.OFFLINE
        assert w.status == WorkerStatus.OFFLINE
