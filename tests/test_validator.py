"""Tests for validator."""

import pytest
from project_underdog.orchestrator.validator import Validator


class TestValidator:
    def test_empty_data(self):
        ok, msg = Validator.validate_result({})
        assert not ok
        assert "Bos veri" in msg

    def test_none_data(self):
        ok, msg = Validator.validate_result(None)
        assert not ok

    def test_missing_answer(self):
        ok, msg = Validator.validate_result({"data": "test"})
        assert not ok
        assert "answer" in msg.lower()

    def test_empty_answer(self):
        ok, msg = Validator.validate_result({"answer": "   "})
        assert not ok
        assert "bos" in msg.lower()

    def test_valid_answer(self):
        ok, msg = Validator.validate_result({"answer": "4"})
        assert ok

    def test_valid_json(self):
        assert Validator.is_valid_json('{"key": "value"}')
        assert not Validator.is_valid_json("{invalid")

    def test_harmful_content_detection(self):
        assert Validator.contains_harmful_content("rm -rf /")
        assert Validator.contains_harmful_content("<script>alert(1)</script>")
        assert not Validator.contains_harmful_content("normal text")
        assert Validator.contains_harmful_content("DROP TABLE users;")
