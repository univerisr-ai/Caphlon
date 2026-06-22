"""
Project Underdog — Mimo Code'dan alınan özellikler
1. Compose mode: tasarım→plan→kod→test→inceleme deterministik döngü
2. /dream: eski konuşmaları otomatik özetleme (bellek yönetimi)
3. Deterministik workflow motoru: LLM routing yerine kod tabanlı
"""

import sqlite3, time, json, re, hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional
from collections import defaultdict


@dataclass(frozen=True, slots=True)
class ComposeStage:
    name: str
    description: str
    handler: Callable[[str, dict], dict]


class ComposeMode:
    """
    Mimo Code Compose modu — belirgin geliştirme döngüsü.
    5 aşama: design → plan → code → test → review
    Her aşama deterministik, LLM sadece içerik üretir.
    """

    def __init__(self, llm_callback: Callable[[str], str]):
        self._llm = llm_callback
        self._stages: list[ComposeStage] = [
            ComposeStage("design", "Tasarım: gereksinimleri analiz et", self._stage_design),
            ComposeStage("plan", "Plan: adımları belirle", self._stage_plan),
            ComposeStage("code", "Kod: implementasyon üret", self._stage_code),
            ComposeStage("test", "Test: doğrulama senaryoları", self._stage_test),
            ComposeStage("review", "İnceleme: kalite kontrolü", self._stage_review),
        ]
        self._state: dict = {}

    def run(self, goal: str) -> dict:
        """Tam döngüyü çalıştır, her aşamanın çıktısını döndür."""
        self._state = {"goal": goal, "started_at": time.time(), "stages": {}}
        for stage in self._stages:
            result = stage.handler(goal, self._state)
            self._state["stages"][stage.name] = result
        self._state["completed_at"] = time.time()
        return self._state

    def _stage_design(self, goal: str, state: dict) -> dict:
        prompt = f"Aşağıdaki görev için teknik tasarım önerisi üret (Türkçe, kısa):\n\nGörev: {goal}\n\nTasarım:"
        return {"prompt": prompt, "output": self._llm(prompt), "stage": "design"}

    def _stage_plan(self, goal: str, state: dict) -> dict:
        design = state["stages"].get("design", {}).get("output", "")
        prompt = f"Tasarım:\n{design}\n\nBu tasarım için 3-5 adımlık implementasyon planı üret:\n\nPlan:"
        return {"prompt": prompt, "output": self._llm(prompt), "stage": "plan"}

    def _stage_code(self, goal: str, state: dict) -> dict:
        plan = state["stages"].get("plan", {}).get("output", "")
        prompt = f"Plan:\n{plan}\n\nBu plana göre Python kod iskeleti üret:\n\nKod:"
        return {"prompt": prompt, "output": self._llm(prompt), "stage": "code"}

    def _stage_test(self, goal: str, state: dict) -> dict:
        code = state["stages"].get("code", {}).get("output", "")
        prompt = f"Kod:\n{code}\n\nBu kod için 3 test senaryosu üret (Given/When/Then):\n\nTestler:"
        return {"prompt": prompt, "output": self._llm(prompt), "stage": "test"}

    def _stage_review(self, goal: str, state: dict) -> dict:
        tests = state["stages"].get("test", {}).get("output", "")
        prompt = f"Testler:\n{tests}\n\nKalite değerlendirmesi yap (GEÇTİ/BAŞARISIZ + gerekçe):\n\nİnceleme:"
        return {"prompt": prompt, "output": self._llm(prompt), "stage": "review"}

    @property
    def stage_names(self) -> list[str]:
        return [s.name for s in self._stages]


class DreamSummary:
    """
    Mimo Code /dream komutu — eski konuşmaları otomatik özetler.
    SQLite FTS5 tabanlı, cross-session state compression.
    """

    def __init__(self, db_path: str = "./data/dream.db"):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.executescript("""
        CREATE TABLE IF NOT EXISTS sessions(
            id TEXT PRIMARY KEY, created_at REAL, last_active REAL,
            message_count INTEGER DEFAULT 0, summary TEXT, raw TEXT
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
            id, content, content='', tokenize='unicode61'
        );
        CREATE TABLE IF NOT EXISTS dream_runs(
            id TEXT PRIMARY KEY, ran_at REAL, sessions_merged INTEGER,
            tokens_before INTEGER, tokens_after INTEGER
        );
        """)
        self._db.commit()

    def record_message(self, session_id: str, content: str):
        """Konuşmaya mesaj ekle, FTS index güncelle."""
        now = time.time()
        row = self._db.execute("SELECT id, message_count, raw FROM sessions WHERE id=?", (session_id,)).fetchone()
        if row:
            raw = json.loads(row["raw"] or "[]")
            raw.append({"ts": now, "content": content})
            self._db.execute(
                "UPDATE sessions SET last_active=?, message_count=?, raw=? WHERE id=?",
                (now, row["message_count"] + 1, json.dumps(raw), session_id),
            )
        else:
            self._db.execute(
                "INSERT INTO sessions(id, created_at, last_active, message_count, raw) VALUES(?,?,?,?,?)",
                (session_id, now, now, 1, json.dumps([{"ts": now, "content": content}])),
            )
        self._db.execute("INSERT INTO sessions_fts(id, content) VALUES(?,?)", (session_id, content))
        self._db.commit()

    def search(self, query: str, limit: int = 5) -> list[dict]:
        """FTS5 ile konuşma arama."""
        rows = self._db.execute(
            "SELECT id FROM sessions_fts WHERE content MATCH ? LIMIT ?",
            (query, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def dream(self, summarizer: Callable[[str], str], max_age_days: int = 7) -> dict:
        """/dream: eski (>= max_age_days) konuşmaları özetle, compress."""
        cutoff = time.time() - (max_age_days * 86400)
        old = self._db.execute(
            "SELECT id, raw, message_count FROM sessions WHERE last_active < ? AND summary IS NULL",
            (cutoff,),
        ).fetchall()
        total_before = 0
        total_after = 0
        for row in old:
            raw = json.loads(row["raw"] or "[]")
            content = "\n".join(m["content"] for m in raw)
            total_before += len(content)
            summary = summarizer(content)
            total_after += len(summary)
            self._db.execute(
                "UPDATE sessions SET summary=? WHERE id=?",
                (summary, row["id"]),
            )
        run_id = hashlib.md5(str(time.time()).encode()).hexdigest()[:8]
        self._db.execute(
            "INSERT INTO dream_runs(id, ran_at, sessions_merged, tokens_before, tokens_after) VALUES(?,?,?,?,?)",
            (run_id, time.time(), len(old), total_before, total_after),
        )
        self._db.commit()
        return {
            "run_id": run_id,
            "sessions_merged": len(old),
            "tokens_before": total_before,
            "tokens_after": total_after,
            "compression_ratio": (total_after / total_before) if total_before else 0,
        }


class WorkflowEngine:
    """
    Mimo Code deterministik workflow motoru.
    LLM tabanlı routing yerine kod tabanlı — token tasarrufu.
    Adımlar JSON DAG olarak tanımlanır, JavaScript-benzeri syntax ile.
    """

    def __init__(self):
        self._workflows: dict[str, dict] = {}

    def register(self, name: str, steps: list[dict]):
        """Workflow kaydet. Her step: {id, action, next, parallel: bool}"""
        self._workflows[name] = {"steps": {s["id"]: s for s in steps}, "entry": steps[0]["id"]}

    def execute(self, name: str, context: dict, action_handler: Callable[[str, dict], dict]) -> dict:
        """Workflow'u deterministik olarak çalıştır."""
        wf = self._workflows.get(name)
        if not wf:
            raise ValueError(f"Workflow '{name}' bulunamadı")
        current = wf["entry"]
        visited = set()
        while current and current not in visited:
            visited.add(current)
            step = wf["steps"][current]
            result = action_handler(step["action"], context)
            context.update(result)
            next_step = step.get("next")
            if callable(next_step):
                current = next_step(context)
            else:
                current = next_step
        return context

    @property
    def workflows(self) -> list[str]:
        return list(self._workflows.keys())
