"""Database engine and session management."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from project_underdog.config import get_settings
from project_underdog.database.models import Base

logger = logging.getLogger(__name__)


class DatabaseManager:
    def __init__(self, url: str | None = None):
        settings = get_settings()
        self._url = url or settings.db_url

        if "sqlite" in self._url and "aiosqlite" in self._url:
            self._engine = create_async_engine(
                self._url,
                echo=settings.debug,
                connect_args={"check_same_thread": False},
                poolclass=StaticPool,
            )
        else:
            self._engine = create_async_engine(
                self._url,
                echo=settings.debug,
                pool_size=5,
                max_overflow=10,
            )

        self._session_factory = async_sessionmaker(
            self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    async def create_all(self) -> None:
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created successfully")

    async def drop_all(self) -> None:
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        logger.warning("All database tables dropped")

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self._session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    async def close(self) -> None:
        await self._engine.dispose()
        logger.info("Database connections closed")


_db_manager: DatabaseManager | None = None


def get_db_manager() -> DatabaseManager:
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager


async def shutdown_db() -> None:
    global _db_manager
    if _db_manager:
        await _db_manager.close()
        _db_manager = None
