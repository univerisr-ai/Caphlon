"""Structured logging configuration using structlog."""

from __future__ import annotations

import logging
import sys
from typing import Literal

import structlog

from project_underdog.config import get_settings


def setup_logging(
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] | None = None,
    fmt: Literal["text", "json"] | None = None,
) -> None:
    settings = get_settings()
    level = level or settings.log_level
    fmt = fmt or settings.log_format

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False),
        structlog.dev.ConsoleRenderer()
        if fmt == "text"
        else structlog.processors.JSONRenderer(),
    ]

    structlog.configure(
        processors=shared_processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(sys.stderr),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        level=getattr(logging, level),
        format="%(message)s",
        stream=sys.stderr,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
