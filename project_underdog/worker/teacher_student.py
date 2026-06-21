"""Teacher-Student loop - Golge Boksu mekanizmasi.

Zayif model (Ogrenci) taslak cevap uretir, guclu model (Ogretmen) hatalari duzeltir.
Supports multiple LLM providers via the abstraction layer.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from project_underdog.llm import get_llm_provider, BaseLLMProvider
from project_underdog.config import get_settings

logger = logging.getLogger(__name__)

TEACHER_SYSTEM_PROMPT = (
    "Sen bir uzman yapay zeka egitmenisin. Ogrenci modelin verdigi cevabi "
    "dikkatlice incele, hatalari duzelt, eksikleri tamamla. "
    "Kisa, dogru ve ogretici cevaplar ver. "
    "Eger ogrencinin cevabi dogruysa onayla ve gelistir."
)

STUDENT_SYSTEM_PROMPT = (
    "Sen bir yapay zeka modeli gelistirme asamasindasin. "
    "Sorulan sorulara en iyi cevabi vermeye calis. "
    "Kisa, net ve dogru cevaplar ver."
)


class TeacherStudentLoop:
    def __init__(self):
        self.llm: BaseLLMProvider = get_llm_provider()
        self.simulation = None

    async def run(self, question: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        start = time.monotonic()

        settings = get_settings()
        if settings.llm_provider == "none":
            return await self._simulate(question, context)

        student = await self.llm.generate(
            prompt=question,
            system=STUDENT_SYSTEM_PROMPT,
            max_tokens=512,
        )

        if not student.ok:
            return {
                "answer": f"[Hata: {student.error}]",
                "method": "error",
                "tokens_used": 0,
                "model": self.llm.provider_name,
            }

        teacher = await self.llm.generate(
            prompt=f"Soru: {question}\n\nOgrenci Cevabi: {student.answer}",
            system=TEACHER_SYSTEM_PROMPT,
            max_tokens=256,
        )

        latency = (time.monotonic() - start) * 1000

        if teacher.ok:
            return {
                "answer": teacher.answer,
                "method": "teacher-student",
                "student_raw": student.answer,
                "tokens_used": student.tokens_used + teacher.tokens_used,
                "model": self.llm.provider_name,
                "latency_ms": latency,
            }

        logger.warning("Ogretmen basarisiz, ogrenci cevabi kullaniliyor")
        return {
            "answer": student.answer,
            "method": "student-only",
            "student_raw": student.answer,
            "tokens_used": student.tokens_used,
            "model": self.llm.provider_name,
            "latency_ms": latency,
        }

    async def _simulate(self, question: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        from project_underdog.llm.simulation import SimulationProvider

        if self.simulation is None:
            self.simulation = SimulationProvider()

        student = await self.simulation.generate(prompt=question, system=STUDENT_SYSTEM_PROMPT)

        teacher = await self.simulation.generate(
            prompt=f"Soru: {question}\n\nOgrenci Cevabi: {student.answer}",
            system=TEACHER_SYSTEM_PROMPT,
        )

        return {
            "answer": teacher.answer,
            "method": "simulation",
            "student_raw": student.answer,
            "tokens_used": student.tokens_used + teacher.tokens_used,
            "model": "simulated-teacher-student",
        }
