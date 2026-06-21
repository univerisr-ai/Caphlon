"""Test conftest - shared fixtures for all tests."""

import asyncio
import os
import tempfile

import pytest
import pytest_asyncio

os.environ["UNDERDOG_DB_URL"] = "sqlite+aiosqlite://"
os.environ["UNDERDOG_LLM_PROVIDER"] = "none"

from project_underdog.config import reset_settings
from project_underdog.database.engine import get_db_manager, DatabaseManager
from project_underdog.database.repository import (
    TaskRepository,
    WorkerRepository,
    ResultRepository,
)


@pytest.fixture(autouse=True)
def reset_config():
    reset_settings()
    from project_underdog.llm.factory import reset_llm_provider
    reset_llm_provider()
    yield


@pytest_asyncio.fixture
async def db():
    """Create fresh in-memory database for each test."""
    mgr = DatabaseManager("sqlite+aiosqlite://")
    await mgr.create_all()
    yield mgr
    await mgr.drop_all()
    await mgr.close()


@pytest_asyncio.fixture
async def registered_worker(db):
    await WorkerRepository.register("vbs-test-1", "test-worker", ["qa_generation"])
    yield "vbs-test-1"


@pytest_asyncio.fixture
async def sample_task(db):
    await TaskRepository.create_or_update(
        task_id="task-test-1",
        task_type="qa_generation",
        description="Test task",
        payload={"question": "2+2 kactir?"},
        min_workers=3,
    )
    yield "task-test-1"


@pytest_asyncio.fixture
async def sample_result(db, sample_task):
    await ResultRepository.create(
        worker_id="vbs-test-1",
        task_id=sample_task,
        success=True,
        data={"answer": "4", "method": "simulation"},
        tokens_used=10,
        latency_ms=100.0,
    )
