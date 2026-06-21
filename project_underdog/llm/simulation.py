"""Simulation provider - no API needed, uses local rule-based responses."""

from __future__ import annotations

import logging
from typing import Any

from project_underdog.llm.base import BaseLLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class SimulationProvider(BaseLLMProvider):
    @property
    def provider_name(self) -> str:
        return "simulation"

    async def generate(self, prompt: str, system: str = "", **kwargs: Any) -> LLMResponse:
        answer = self._respond(prompt)
        tokens = max(1, len(prompt + answer) // 4)
        return LLMResponse(
            answer=answer,
            model="simulated-teacher-student",
            provider=self.provider_name,
            tokens_used=tokens,
        )

    async def health_check(self) -> bool:
        return True

    @staticmethod
    def _respond(question: str) -> str:
        q = question.lower()

        if "2+2" in q or "2 arti 2" in q:
            return "Dogru cevap: 2+2 = 4"
        elif "merhaba dünya" in q or "hello world" in q:
            return "Merhaba Dunya! Project Underdog calisiyor."
        elif "başkent" in q or "capital" in q:
            if "türkiye" in q or "turkey" in q:
                return "Turkiye'nin baskenti Ankara'dir."
            if "fransa" in q or "france" in q:
                return "Fransa'nin baskenti Paris'tir."
            return "Bircok ulkenin baskenti vardir."
        elif "gezegen" in q and ("güneş" in q or "gunes" in q) and ("yakın" in q or "yakin" in q):
            return "Merkur"
        elif "okyanus" in q and ("büyük" in q or "buyuk" in q):
            return "Pasifik Okyanusu"
        elif "kaynar" in q or "kaynama" in q:
            return "100"
        elif "python" in q and ("yaratıcı" in q or "yaratici" in q or "kim" in q):
            return "Guido van Rossum"
        elif "python" in q:
            return "Python, yuksek seviyeli, yorumlanan bir programlama dilidir."
        elif "ai" in q or "yapay zeka" in q:
            return "Yapay Zeka (AI), makinelerin insan benzeri zeka gostermesidir."
        elif "türkiye" in q or "turkey" in q:
            return "Turkiye, Asya ve Avrupa kitalarinda yer alan bir ulkedir."
        elif "öğren" in q or "ogren" in q:
            return "Bu konuyu detayli arastirmak icin akademik kaynaklara basvurulmalidir."
        else:
            return f"Sorunuza cevap veriyorum. Konu: {question[:80]}"
