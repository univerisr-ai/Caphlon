"""Validator class - veri bicimi, mantiksal tutarlilik ve zararli icerik kontrolu."""

import json
import logging

logger = logging.getLogger(__name__)


class Validator:
    @staticmethod
    def validate_result(data: dict) -> tuple[bool, str]:
        if not data:
            return False, "Bos veri"

        if not isinstance(data, dict):
            return False, "Veri bir dict olmali"

        answer = data.get("answer")
        if answer is None:
            return False, "Cevap alani ('answer') bulunamadi"

        if isinstance(answer, str):
            if len(answer.strip()) == 0:
                return False, "Cevap bos olamaz"
            if len(answer) > 10_000:
                return False, "Cevap cok uzun (max 10K karakter)"

        return True, "OK"

    @staticmethod
    def is_valid_json(raw: str) -> bool:
        try:
            json.loads(raw)
            return True
        except (json.JSONDecodeError, TypeError):
            return False

    @staticmethod
    def contains_harmful_content(text: str) -> bool:
        harmful_patterns = [
            "DROP TABLE",
            "DELETE FROM",
            "<script>",
            "eval(",
            "exec(",
            "__import__",
            "rm -rf /",
            "format C:",
        ]
        text_lower = text.lower()
        for pattern in harmful_patterns:
            if pattern.lower() in text_lower:
                logger.warning("Zararli icerik tespit edildi: %s", pattern)
                return True
        return False
