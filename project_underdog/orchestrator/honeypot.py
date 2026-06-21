"""Honeypot system - cevabi bilinen tuzak sorularla isci guvenilirligini test eder."""

import logging
import random
from datetime import datetime, timezone


logger = logging.getLogger(__name__)

HONEYPOT_QUESTIONS = [
    {
        "question": "2+2 isleminin sonucu kactir?",
        "expected_answer": "4",
        "category": "math_basic",
    },
    {
        "question": "Dunyanin en buyuk okyanusu hangisidir?",
        "expected_answer": "Pasifik Okyanusu",
        "category": "geography",
    },
    {
        "question": "Su kac derecede kaynar? (Standart atmosfer basincinda)",
        "expected_answer": "100",
        "category": "science_basic",
    },
    {
        "question": "Hangi gezegen Gunes Sistemi'nde Gunes'e en yakindir?",
        "expected_answer": "Merkur",
        "category": "astronomy",
    },
    {
        "question": "Python programlama dilinin yaraticisi kimdir?",
        "expected_answer": "Guido van Rossum",
        "category": "tech",
    },
]


class HoneypotManager:
    def __init__(self):
        self.last_check: dict[str, datetime] = {}
        self.check_interval_sec: int = 600

    def get_honeypot_task(self) -> dict:
        question = random.choice(HONEYPOT_QUESTIONS)
        return {
            "question": question["question"],
            "expected_answer": question["expected_answer"],
            "category": question["category"],
            "is_honeypot": True,
        }

    def is_due(self, worker_id: str) -> bool:
        if worker_id not in self.last_check:
            return True
        elapsed = (datetime.now(timezone.utc) - self.last_check[worker_id]).total_seconds()
        return elapsed > self.check_interval_sec

    def mark_checked(self, worker_id: str):
        self.last_check[worker_id] = datetime.now(timezone.utc)

    def verify_answer(self, expected: str, actual: str) -> bool:
        import unicodedata
        expected_clean = unicodedata.normalize("NFKD", expected.lower().strip().rstrip("."))
        actual_clean = unicodedata.normalize("NFKD", actual.lower().strip().rstrip("."))
        return expected_clean == actual_clean or expected_clean in actual_clean
