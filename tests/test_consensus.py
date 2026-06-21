"""Tests for consensus engine."""

import pytest
from project_underdog.orchestrator.consensus import compute_consensus


class TestConsensus:
    def test_insufficient_results(self):
        result = compute_consensus({"w1": {"success": True, "data": {"answer": "4"}}})
        assert result is None

    def test_unanimous_consensus(self):
        results = {
            "w1": {"success": True, "data": {"answer": "4"}},
            "w2": {"success": True, "data": {"answer": "4"}},
            "w3": {"success": True, "data": {"answer": "4"}},
        }
        result = compute_consensus(results)
        assert result is not None
        assert result["consensus_reached"] is True
        assert result["answer"] == "4"
        assert result["consensus_ratio"] == 1.0

    def test_majority_consensus(self):
        results = {
            "w1": {"success": True, "data": {"answer": "4"}},
            "w2": {"success": True, "data": {"answer": "4"}},
            "w3": {"success": True, "data": {"answer": "5"}},
        }
        result = compute_consensus(results)
        assert result is not None
        assert result["consensus_reached"] is True
        assert result["answer"] == "4"
        assert len(result["agreeing_workers"]) == 2
        assert len(result["disagreeing_workers"]) == 1

    def test_no_consensus(self):
        results = {
            "w1": {"success": True, "data": {"answer": "4"}},
            "w2": {"success": True, "data": {"answer": "5"}},
        }
        result = compute_consensus(results)
        assert result is not None
        assert result["consensus_reached"] is False

    def test_failed_results_excluded(self):
        results = {
            "w1": {"success": True, "data": {"answer": "4"}},
            "w2": {"success": False, "error": "timeout"},
            "w3": {"success": True, "data": {"answer": "4"}},
        }
        result = compute_consensus(results)
        assert result is not None
        assert result["consensus_reached"] is True
        assert result["total_workers"] == 2
