"""Data export - synthetic data packaging in JSONL, JSON, and Parquet formats."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from project_underdog.config import get_settings

logger = logging.getLogger(__name__)

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
    HAS_PARQUET = True
except ImportError:
    HAS_PARQUET = False


class DataExporter:
    def __init__(self, output_dir: str | Path | None = None):
        settings = get_settings()
        self.output_dir = Path(output_dir) if output_dir else settings.export_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _generate_filename(self, prefix: str, ext: str) -> Path:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        return self.output_dir / f"{prefix}_{timestamp}.{ext}"

    def export_jsonl(self, data: list[dict[str, Any]], prefix: str = "qa_dataset") -> Path:
        path = self._generate_filename(prefix, "jsonl")
        with open(path, "w", encoding="utf-8") as f:
            for record in data:
                f.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
        logger.info("Exported %d records to %s", len(data), path)
        return path

    def export_json(self, data: list[dict[str, Any]], prefix: str = "qa_dataset") -> Path:
        path = self._generate_filename(prefix, "json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        logger.info("Exported %d records to %s", len(data), path)
        return path

    def export_parquet(self, data: list[dict[str, Any]], prefix: str = "qa_dataset") -> Path | None:
        if not HAS_PARQUET:
            logger.warning("PyArrow not installed, skipping Parquet export")
            return None
        path = self._generate_filename(prefix, "parquet")
        table = pa.Table.from_pylist(data)
        pq.write_table(table, path)
        logger.info("Exported %d records to %s", len(data), path)
        return path

    def package_for_training(
        self,
        qa_pairs: list[dict[str, Any]],
        format: str = "all",
    ) -> list[Path]:
        paths = []
        if format in ("all", "jsonl"):
            paths.append(self.export_jsonl(qa_pairs, "training"))
        if format in ("all", "json"):
            paths.append(self.export_json(qa_pairs, "training"))
        if format in ("all", "parquet") and HAS_PARQUET:
            paths.append(self.export_parquet(qa_pairs, "training"))
        return paths

    @staticmethod
    def normalize_qa_pairs(raw_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert raw result data into standardized training pairs."""
        normalized = []
        for i, row in enumerate(raw_results):
            normalized.append({
                "id": f"und_{i:06d}",
                "instruction": row.get("question", ""),
                "output": row.get("answer", ""),
                "source": "project-underdog",
                "method": row.get("method", "unknown"),
                "tokens_used": row.get("tokens_used", 0),
                "worker_id": row.get("worker_id", ""),
            })
        return normalized
