"""
Caphlon — Kovan Paylaşımlı Çözüm Önbelleği (Shared Solution Cache)
=================================================================

Kovan Zekası'nın "neredeyse bedava güç" katmanı: bir düğüm bir problemi
çözünce, kabul edilen (soru → cevap) çifti ortak önbelleğe yazılır. Sonraki
herhangi bir düğüm aynı/benzer soruyu sorduğunda cevabı *model çağırmadan*
retrieval ile alır.

N kullanıcı = N kat büyük ortak hafıza. Düğüm başına maliyet ~sıfır.

Saf stdlib (sqlite3). 2GB RAM / i5 3. nesil hedefine uygun. Embedding yok;
benzerlik token-Jaccard ile (CPU-ucuz, deterministik, dış bağımlılık yok).
"""

from __future__ import annotations

import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


_WORD = re.compile(r"[a-z0-9çğıöşü]+", re.IGNORECASE)


def _tokens(text: str) -> set[str]:
    return set(_WORD.findall(text.lower()))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


@dataclass
class CacheHit:
    instruction: str
    output: str
    similarity: float
    score: float          # birikmiş güven (kaç düğüm onayladı, itibar ağırlıklı)
    hits: int             # kaç kez retrieve edildi


class SharedSolutionCache:
    """Kovanın ortak (soru→cevap) hafızası. Retrieval-first cevaplama sağlar."""

    def __init__(self, db_path: str = "./data/hive_cache.db", sim_threshold: float = 0.72):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.sim_threshold = sim_threshold
        # check_same_thread=False: HTTP koordinatörü tek-thread serve eder ama
        # bağlantı başka thread'de yaratılabilir (örn. test). Eşzamanlı erişim yok.
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS solutions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                instruction  TEXT NOT NULL,
                output       TEXT NOT NULL,
                tokens       TEXT NOT NULL,      -- boşlukla ayrılmış normalize token seti
                score        REAL DEFAULT 1.0,   -- itibar-ağırlıklı birikmiş onay
                contributors INTEGER DEFAULT 1,
                hits         INTEGER DEFAULT 0,
                created_at   REAL DEFAULT (strftime('%s','now')),
                updated_at   REAL DEFAULT (strftime('%s','now'))
            )"""
        )
        # Aynı normalize-girdi + çıktı çiftini tekilleştirmek için.
        self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_solutions_instr ON solutions(instruction)"
        )
        self._db.commit()

    # ---- yazma -----------------------------------------------------------

    def record(self, instruction: str, output: str, weight: float = 1.0) -> int:
        """Kabul edilmiş bir çözümü önbelleğe ekle ya da mevcutsa güçlendir.

        `weight`: katkıyı veren konsensüsün itibar-ağırlıklı gücü.
        Aynı (girdi, çıktı) tekrar gelirse skoru ve katkıcı sayısı artar —
        yani "ne kadar çok düğüm aynı çözümde anlaştıysa o kadar güvenilir".
        """
        instr = instruction.strip()
        out = output.strip()
        if not instr or not out:
            return -1
        now = time.time()
        row = self._db.execute(
            "SELECT id, score, contributors FROM solutions WHERE instruction=? AND output=?",
            (instr, out),
        ).fetchone()
        if row:
            self._db.execute(
                "UPDATE solutions SET score=score+?, contributors=contributors+1, updated_at=? WHERE id=?",
                (max(0.0, weight), now, row["id"]),
            )
            self._db.commit()
            return row["id"]
        tokens = " ".join(sorted(_tokens(instr)))
        cur = self._db.execute(
            "INSERT INTO solutions(instruction, output, tokens, score, contributors, created_at, updated_at)"
            " VALUES(?,?,?,?,1,?,?)",
            (instr, out, tokens, max(0.0, weight), now, now),
        )
        self._db.commit()
        return cur.lastrowid

    # ---- okuma -----------------------------------------------------------

    def lookup(self, instruction: str) -> Optional[CacheHit]:
        """En iyi eşleşen çözümü döndür (eşik üstündeyse), yoksa None.

        Model çağırmadan önce buraya bakılır: isabet varsa çıkarım atlanır.
        """
        q_tokens = _tokens(instruction)
        if not q_tokens:
            return None
        best: Optional[CacheHit] = None
        # Küçük/orta önbelleklerde tam tarama yeterli (CPU-ucuz). Büyürse
        # token-tabanlı ön-filtre (FTS5) eklenebilir — arayüz aynı kalır.
        for row in self._db.execute(
            "SELECT id, instruction, output, tokens, score, hits FROM solutions"
        ):
            sim = _jaccard(q_tokens, set(row["tokens"].split()))
            if sim < self.sim_threshold:
                continue
            # Aynı benzerlikte daha çok onaylanmış (yüksek score) çözümü yeğle.
            rank = (sim, row["score"])
            if best is None or rank > (best.similarity, best.score):
                best = CacheHit(
                    instruction=row["instruction"],
                    output=row["output"],
                    similarity=sim,
                    score=row["score"],
                    hits=row["hits"],
                )
                best._id = row["id"]  # type: ignore[attr-defined]
        if best is not None:
            self._db.execute(
                "UPDATE solutions SET hits=hits+1 WHERE id=?", (best._id,)  # type: ignore[attr-defined]
            )
            self._db.commit()
        return best

    def stats(self) -> dict:
        row = self._db.execute(
            "SELECT COUNT(*) n, COALESCE(SUM(hits),0) total_hits,"
            " COALESCE(SUM(contributors),0) total_contrib FROM solutions"
        ).fetchone()
        return {
            "solutions": row["n"],
            "total_hits": row["total_hits"],
            "total_contributions": row["total_contrib"],
        }

    def close(self):
        self._db.close()
