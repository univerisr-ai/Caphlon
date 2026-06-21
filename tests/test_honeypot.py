"""Tests for honeypot system."""

import pytest
from project_underdog.orchestrator.honeypot import HoneypotManager


class TestHoneypotManager:
    def test_get_honeypot_task(self):
        mgr = HoneypotManager()
        task = mgr.get_honeypot_task()
        assert task["is_honeypot"] is True
        assert "question" in task
        assert "expected_answer" in task
        assert "category" in task

    def test_is_due_initial(self):
        mgr = HoneypotManager()
        assert mgr.is_due("worker-1") is True

    def test_is_due_after_check(self):
        mgr = HoneypotManager()
        mgr.mark_checked("worker-1")
        mgr.check_interval_sec = 999999
        assert mgr.is_due("worker-1") is False

    def test_verify_answer_exact(self):
        mgr = HoneypotManager()
        assert mgr.verify_answer("4", "4") is True
        assert mgr.verify_answer("Pasifik Okyanusu", "Pasifik Okyanusu") is True

    def test_verify_answer_case_insensitive(self):
        mgr = HoneypotManager()
        assert mgr.verify_answer("Pasifik Okyanusu", "pasifik okyanusu") is True

    def test_verify_answer_wrong(self):
        mgr = HoneypotManager()
        assert mgr.verify_answer("4", "5") is False
