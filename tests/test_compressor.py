"""Tests for token compressor."""

import pytest
from project_underdog.token_optimizer.compressor import TokenCompressor


class TestTokenCompressor:
    def test_compress_text(self):
        original = "hello    world\t\tfoo  bar"
        compressed = TokenCompressor.compress_text(original)
        assert compressed == "hello world foo bar"

    def test_compress_long_text(self):
        long_text = "x" * 3000
        compressed = TokenCompressor.compress_text(long_text)
        assert len(compressed) <= 2003
        assert compressed.endswith("...")

    def test_compress_json_string_truncation(self):
        data = {"key": "x" * 1000}
        result = TokenCompressor.compress_json(data)
        assert len(result["key"]) <= 500
        assert result["key"].endswith("...")

    def test_compress_json_list_truncation(self):
        data = {"items": list(range(100))}
        result = TokenCompressor.compress_json(data)
        assert len(result["items"]) == 20
        assert result["items_count"] == 100

    def test_estimate_tokens(self):
        assert TokenCompressor.estimate_tokens("1234") == 1
        assert TokenCompressor.estimate_tokens("X" * 400) == 100

    def test_estimated_savings(self):
        original = "X" * 400
        compressed = "Y" * 100
        savings = TokenCompressor.estimated_savings(original, compressed)
        assert savings["original_tokens"] == 100
        assert savings["compressed_tokens"] == 25
        assert savings["saved_tokens"] == 75
        assert savings["savings_percent"] == 75.0
