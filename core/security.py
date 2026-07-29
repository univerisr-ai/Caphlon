"""
Project Underdog — Güvenlik Katmanı (Aşama 5)
Validator + İtibar Sistemi + Tuzak Soru (Honeypot)
Qualixar OS Judge pipeline ile entegre çalışır.
"""

import json, hashlib, re, sqlite3, time
from dataclasses import dataclass, field
from collections import defaultdict
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Sır kapısı — paylaşım havuzuna anahtar/token sızmasın (sunucu tarafı katman).
# İstemci (Caphlon DualCache) aynı desen ailesiyle zaten tarar; Merkez yine de
# 422 ile reddeder — egos'un çift-katman garantisinin Kovan karşılığı.
# ---------------------------------------------------------------------------

SECRET_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("anthropic key", re.compile(r"sk-ant-[A-Za-z0-9-]{8,}")),
    ("openrouter key", re.compile(r"sk-or-v1-[A-Za-z0-9]{8,}")),
    ("openai-tarzı key", re.compile(r"sk-[A-Za-z0-9]{20,}")),
    ("groq key", re.compile(r"gsk_[A-Za-z0-9]{16,}")),
    ("xai key", re.compile(r"xai-[A-Za-z0-9]{16,}")),
    ("aws key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("github token", re.compile(r"(ghp_|github_pat_)[A-Za-z0-9_]{16,}")),
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("bearer", re.compile(r"Bearer\s+[A-Za-z0-9._-]{20,}")),
]


def scan_secrets(text: str) -> list[str]:
    """Metindeki gizli-anahtar desenlerinin adlarını döndürür (boş = temiz)."""
    return [name for name, pat in SECRET_PATTERNS if pat.search(text)]


# ---------------------------------------------------------------------------
# Güvenlik kapısı — kötü amaçlı içerik + yıkıcı komut (TS safety.ts aynası).
# Merkez'e gelen katkı/düzeltme sunucuda da taranır: istemci atlarsa/eskiyse
# havuz yine korunur (çift katman, egos deseni).
# ---------------------------------------------------------------------------

HARMFUL_RULES: list[tuple[str, re.Pattern]] = [
    ("kötü amaçlı içerik", re.compile(
        r"\b(how|tutorial|guide|nas[ıi]l)\b.*\b(hack|exploit|malware|ransomware|phish|keylogger)\b", re.I)),
    ("zararlı içerik", re.compile(
        r"\b(make|create|build|recipe|yap|üret)\b.*\b(bomb|weapon|poison|bomba|silah|zehir)\b", re.I)),
    ("yıkıcı komut (fork bomb)", re.compile(r":\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:")),
    ("disk biçimlendirme/üzerine yazma", re.compile(
        r"\bmkfs(\.\w+)?\b|\bdd\s+[^|\n]*of=/dev/r?(sd|nvme|disk|hd|vd)|>\s*/dev/r?(sd|nvme|disk|hd|vd)\w*\b"
        r"|\bdiskutil\s+(erase(Disk|Volume)|partitionDisk)\b", re.I)),
    ("kök dizinde 777 izni", re.compile(r"\bchmod\s+(-[a-zA-Z]+\s+)*0?777\s+/")),
    ("curl|sh (doğrulanmamış uzak script)", re.compile(
        r"\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+(-\S+\s+)*)?((ba|z|k|da)?sh|fish|python[23]?|perl|ruby|node)\b"
        r"|(\$\(|<\()\s*(curl|wget)\b", re.I)),
    ("gizlenmiş komut çalıştırma", re.compile(
        r"\bbase64\b[^|\n]*(-d|--decode)[^|\n]*\|\s*(sudo\s+)?\w*sh\b|\beval\s*[(\"']*\s*\$\(", re.I)),
]

_RM_FLAGS = re.compile(r"\brm\b((?:\s+(?:-{1,2}[\w-]+))+)", re.I)


def scan_harmful(text: str) -> list[str]:
    """Zararlı/yıkıcı içerik bulgularının adlarını döndürür (boş = temiz).

    `rm` için bayraklar AYRIK verilmiş olabilir (rm -r -f, --recursive --force):
    tek regex yerine bayrak dizisinde recursive VE force aranır.
    """
    found = [name for name, pat in HARMFUL_RULES if pat.search(text)]
    for m in _RM_FLAGS.finditer(text):
        flags = m.group(1)
        recursive = re.search(r"(^|\s)-{1,2}(recursive\b|[a-zA-Z]*[rR][a-zA-Z]*(\s|$))", flags)
        force = re.search(r"(^|\s)-{1,2}(force\b|[a-zA-Z]*f[a-zA-Z]*(\s|$))", flags)
        if recursive and force:
            found.append("yıkıcı komut (rm -rf)")
            break
    return found


@dataclass
class ValidationResult:
    passed: bool
    score: float  # 0.0 - 1.0
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class Validator:
    """Veri formatı, mantıksal tutarlılık ve zararlı içerik kontrolü yapar."""

    HARMFUL_PATTERNS = [
        r"(?i)\b(how|tutorial|guide)\b.*\b(hack|exploit|malware|ransomware|phish)\b",
        r"(?i)\b(make|create|build|recipe)\b.*\b(bomb|weapon|poison)\b",
        r"(?i)\b(ssn|credit.?card|password)\b.*\b\d{3,4}[-\s]?\d{4,6}\b",
    ]

    @staticmethod
    def validate_format(data: dict) -> ValidationResult:
        """Veri formatı kontrolü: instruction + output alanları zorunlu."""
        issues = []
        if not isinstance(data, dict):
            return ValidationResult(False, 0.0, ["Veri dict değil."])
        if not data.get("instruction", "").strip():
            issues.append("instruction boş.")
        if not data.get("output", "").strip():
            issues.append("output boş.")
        if len(str(data.get("output", ""))) < 1:
            issues.append("output çok kısa (<2 karakter).")
        return ValidationResult(
            passed=len(issues) == 0,
            score=1.0 - len(issues) * 0.25,
            issues=issues,
        )

    @staticmethod
    def validate_logic(instruction: str, output: str) -> ValidationResult:
        """Temel mantıksal tutarlılık kontrolü."""
        issues = []
        # Boş cevap
        if not output.strip():
            issues.append("Çıktı tamamen boş.")
        # Kendi kendini tekrarlama
        if output.strip() == instruction.strip():
            issues.append("Çıktı girdiyle aynı (tekrar).")
        # Aşırı kısa instruction'a aşırı uzun cevap (olası spam)
        if len(instruction) < 10 and len(output) > 500:
            issues.append("Kısa soruya aşırı uzun cevap (olası spam).")
        return ValidationResult(
            passed=len(issues) == 0,
            score=1.0 - len(issues) * 0.3,
            issues=issues,
        )

    @staticmethod
    def validate_safety(text: str) -> ValidationResult:
        """Zararlı içerik taraması."""
        issues = []
        for pattern in Validator.HARMFUL_PATTERNS:
            if re.search(pattern, text):
                issues.append(f"Zararlı içerik tespit edildi: {pattern}")
        return ValidationResult(
            passed=len(issues) == 0,
            score=0.0 if issues else 1.0,
            issues=issues,
        )

    @classmethod
    def full_validation(cls, data: dict) -> ValidationResult:
        """Tüm validasyonları çalıştır, ağırlıklı puan hesapla."""
        fmt = cls.validate_format(data)
        if not fmt.passed:
            return fmt
        instruction = str(data.get("instruction", ""))
        output = str(data.get("output", ""))
        logic = cls.validate_logic(instruction, output)
        safety = cls.validate_safety(f"{instruction}\n{output}")
        all_issues = fmt.issues + logic.issues + safety.issues
        weighted = fmt.score * 0.4 + logic.score * 0.3 + safety.score * 0.3
        return ValidationResult(
            passed=all([fmt.passed, logic.passed, safety.passed]),
            score=weighted,
            issues=all_issues,
            warnings=logic.warnings + safety.warnings,
        )


class ReputationSystem:
    """Her VBS için güven puanı takibi. SQLite tabanlı."""

    def __init__(self, db_path: str = "./data/reputation.db"):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS reputation (
                vbs_id TEXT PRIMARY KEY,
                score REAL DEFAULT 0.5,
                total_tasks INTEGER DEFAULT 0,
                passed_tasks INTEGER DEFAULT 0,
                last_active REAL DEFAULT 0,
                created_at REAL DEFAULT (strftime('%s','now'))
            )"""
        )
        self._db.commit()

    def register(self, vbs_id: str):
        self._db.execute(
            "INSERT OR IGNORE INTO reputation(vbs_id) VALUES(?)", (vbs_id,)
        )
        self._db.commit()

    def get_score(self, vbs_id: str) -> float:
        row = self._db.execute(
            "SELECT score FROM reputation WHERE vbs_id=?", (vbs_id,)
        ).fetchone()
        return row["score"] if row else 0.5

    def record_task(self, vbs_id: str, passed: bool):
        self.register(vbs_id)
        current = self.get_score(vbs_id)
        row = self._db.execute(
            "SELECT total_tasks, passed_tasks FROM reputation WHERE vbs_id=?", (vbs_id,)
        ).fetchone()
        total, passed_tasks = (row["total_tasks"], row["passed_tasks"]) if row else (0, 0)
        total += 1
        if passed:
            passed_tasks += 1
            new_score = min(1.0, current + 0.05)
        else:
            new_score = max(0.0, current - 0.10)
        self._db.execute(
            "UPDATE reputation SET score=?, total_tasks=?, passed_tasks=?, last_active=? WHERE vbs_id=?",
            (new_score, total, passed_tasks, time.time(), vbs_id),
        )
        self._db.commit()
        return new_score

    def is_trusted(self, vbs_id: str, threshold: float = 0.4) -> bool:
        return self.get_score(vbs_id) >= threshold

    def get_top(self, n: int = 5) -> list[dict]:
        return [dict(r) for r in self._db.execute(
            "SELECT vbs_id, score, total_tasks, passed_tasks FROM reputation WHERE total_tasks > 0 ORDER BY score DESC LIMIT ?",
            (n,),
        ).fetchall()]

    def consensus(self, results: list[tuple[str, str]]) -> Optional[str]:
        """Çoğunluk oyu: en az 3 VBS'nin sonucunu karşılaştır, ağırlıklı oyla."""
        if len(results) < 3:
            return None
        weighted: dict[str, float] = defaultdict(float)
        for vbs_id, answer in results:
            w = max(0.1, self.get_score(vbs_id))
            key = self._normalize(answer)
            weighted[key] += w
        if not weighted:
            return None
        best = max(weighted, key=weighted.get)
        return best

    @staticmethod
    def _normalize(text: str) -> str:
        return re.sub(r"\s+", " ", text.strip().lower())


class Honeypot:
    """Tuzak soru sistemi: cevabı bilinen sorularla hileli VBS'leri tespit eder."""

    def __init__(self):
        self._questions: list[dict] = [
            {"q": "2+2=?", "a": "4", "tolerance": "exact"},
            {"q": "Başkent neresidir?", "a": "ankara", "tolerance": "contains"},
            {"q": "1+1=?", "a": "2", "tolerance": "exact"},
            {"q": "Dünyanın uydusu nedir?", "a": "ay", "tolerance": "contains"},
            {"q": "5*3=?", "a": "15", "tolerance": "exact"},
            {"q": "Python hangi yıl çıktı?", "a": "1991", "tolerance": "contains"},
            {"q": "TCP/IP açılımı nedir?", "a": "transmission control protocol", "tolerance": "contains_lower"},
            {"q": "10-7=?", "a": "3", "tolerance": "exact"},
        ]

    def get_question(self, index: Optional[int] = None) -> dict:
        import random
        if index is not None and 0 <= index < len(self._questions):
            return self._questions[index]
        return random.choice(self._questions)

    def check_answer(self, question_idx: int, answer: str) -> bool:
        q = self._questions[question_idx]
        expected = q["a"]
        tolerance = q.get("tolerance", "exact")
        normalized = answer.strip().lower()
        if tolerance == "exact":
            return normalized == expected
        elif tolerance == "contains":
            return expected in normalized
        elif tolerance == "contains_lower":
            return expected.lower() in normalized.lower()
        return False

    def test_vbs(self, vbs_id: str, reputation: ReputationSystem):
        """Rastgele bir tuzak soru sor ve sonucu değerlendir."""
        import random
        idx = random.randrange(len(self._questions))
        q = self._questions[idx]
        return {
            "vbs_id": vbs_id,
            "question": q["q"],
            "expected": q["a"],
            "question_idx": idx,
        }

    @property
    def count(self) -> int:
        return len(self._questions)
