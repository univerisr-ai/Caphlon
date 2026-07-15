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

# Soru/işlev kelimeleri benzerliği sulandırır ("nasıl çözülür" ≈ "çözümü
# nedir"). Caphlon DualCache (TS istemci) ile AYNI liste — iki katman aynı
# soruda aynı kararı versin.
_STOPWORDS = frozenset({
    # tr
    "nasıl", "nasil", "nedir", "neden", "niçin", "nicin", "hangi", "için", "icin",
    "gibi", "ile", "ve", "veya", "bir", "bu", "şu", "su", "da", "de", "ki", "en",
    "ne", "mi", "mı", "mu", "mü", "ben", "sen",
    # en
    "how", "what", "why", "which", "the", "a", "an", "is", "are", "to", "of",
    "and", "or", "for", "with", "in", "on", "do", "does", "can", "i",
})


def _tokens(text: str) -> set[str]:
    all_toks = _WORD.findall(text.lower())
    content = [t for t in all_toks if t not in _STOPWORDS]
    # Tamamı stopword ise eleme yapma — boş küme hiçbir şeyle eşleşmez.
    return set(content if content else all_toks)


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _similarity(a: set[str], b: set[str]) -> float:
    """max(Jaccard, containment). Containment (kesişim/küçük küme) kısa parafraz
    sorguların uzun kayıtların alt kümesi olduğu durumu yakalar; ≥4 içerik
    kelimesi freni aşırı eşleşmeyi önler. DualCache (TS) ile birebir aynı kural.
    """
    j = _jaccard(a, b)
    if len(a) < 4 or len(b) < 4:
        return j
    inter = len(a & b)
    return max(j, inter / min(len(a), len(b)))


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
            sim = _similarity(q_tokens, set(row["tokens"].split()))
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

    # ---- rapor (borrow→report döngüsünün Merkez ayağı) ---------------------

    def report(self, solution_id: int, worked: bool,
               correction: str | None = None, weight: float = 1.0) -> dict:
        """Ödünç alınan çözümün sonucunu işle — güven ekonomisi.

        worked=True: skor + itibar-ağırlığı (onaylayan ne kadar güvenilirse o
        kadar güçlenir). worked=False: skor yarı ağırlık kadar erir (taban 0);
        correction verilmişse AYNI soruya yeni bir çözüm satırı açılır —
        lookup zaten (benzerlik, skor) sıralaması yaptığı için düzeltme onay
        topladıkça kanonik cevabı doğal olarak devralır (quorum'suz, ölçülebilir
        terfi; egos'un correction akışının Kovan karşılığı).
        """
        row = self._db.execute(
            "SELECT id, instruction, score FROM solutions WHERE id=?",
            (solution_id,),
        ).fetchone()
        if not row:
            return {"ok": False, "error": f"kayıt yok: {solution_id}"}
        now = time.time()
        w = max(0.0, weight)
        if worked:
            self._db.execute(
                "UPDATE solutions SET score=score+?, updated_at=? WHERE id=?",
                (w, now, solution_id),
            )
            self._db.commit()
            return {"ok": True, "action": "confirmed", "id": solution_id}
        self._db.execute(
            "UPDATE solutions SET score=MAX(0.0, score-?), updated_at=? WHERE id=?",
            (w * 0.5, now, solution_id),
        )
        self._db.commit()
        if correction and correction.strip():
            new_id = self.record(row["instruction"], correction, weight=w)
            return {"ok": True, "action": "corrected", "id": solution_id, "corrected_id": new_id}
        return {"ok": True, "action": "penalized", "id": solution_id}

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
