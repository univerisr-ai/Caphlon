"""Token compressor - metin ve JSON token kullanimini optimize eder."""

import json
import logging

logger = logging.getLogger(__name__)


class TokenCompressor:
    @staticmethod
    def compress_text(text: str) -> str:
        text = " ".join(text.split())
        text = text.replace("\t", " ")
        if len(text) > 2000:
            text = text[:1997] + "..."
        return text

    @staticmethod
    def compress_json(data: dict) -> dict:
        result = {}
        for key, value in data.items():
            if isinstance(value, str) and len(value) > 500:
                result[key] = value[:497] + "..."
            elif isinstance(value, list) and len(value) > 20:
                result[key] = value[:20]
                result[f"{key}_count"] = len(value)
            else:
                result[key] = value
        return result

    @staticmethod
    def to_minimal_json(data: dict) -> str:
        return json.dumps(data, separators=(",", ":"), ensure_ascii=True)

    @staticmethod
    def estimate_tokens(text: str) -> int:
        return max(1, len(text) // 4)

    @staticmethod
    def estimated_savings(original: str, compressed: str) -> dict:
        orig_tokens = TokenCompressor.estimate_tokens(original)
        comp_tokens = TokenCompressor.estimate_tokens(compressed)
        saved = orig_tokens - comp_tokens
        percent = (saved / orig_tokens * 100) if orig_tokens > 0 else 0
        return {
            "original_tokens": orig_tokens,
            "compressed_tokens": comp_tokens,
            "saved_tokens": saved,
            "savings_percent": round(percent, 1),
        }
