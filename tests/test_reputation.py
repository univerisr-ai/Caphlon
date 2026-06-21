"""Tests for reputation system."""

import pytest
from project_underdog.orchestrator.reputation import ReputationManager


class TestReputationManager:
    @pytest.mark.asyncio
    async def test_register_worker(self):
        mgr = ReputationManager(use_db=False)
        await mgr.register_worker("w1")
        score = await mgr.get_score("w1")
        assert score == 1.0

    @pytest.mark.asyncio
    async def test_reward_success(self):
        mgr = ReputationManager(use_db=False)
        await mgr.register_worker("w1")
        await mgr.reward_success("w1")
        score = await mgr.get_score("w1")
        assert score > 1.0

    @pytest.mark.asyncio
    async def test_penalize_failure(self):
        mgr = ReputationManager(use_db=False)
        await mgr.register_worker("w1")
        await mgr.penalize_failure("w1")
        score = await mgr.get_score("w1")
        assert score < 1.0

    @pytest.mark.asyncio
    async def test_penalize_honeypot(self):
        mgr = ReputationManager(use_db=False)
        await mgr.register_worker("w1")
        await mgr.penalize_honeypot("w1")
        score = await mgr.get_score("w1")
        assert score == 0.7

    @pytest.mark.asyncio
    async def test_is_trusted(self):
        mgr = ReputationManager(use_db=False)
        await mgr.register_worker("w1")
        assert await mgr.is_trusted("w1") is True

    @pytest.mark.asyncio
    async def test_score_capped(self):
        mgr = ReputationManager(use_db=False)
        await mgr.register_worker("w1")
        for _ in range(50):
            await mgr.reward_success("w1")
        score = await mgr.get_score("w1")
        assert score <= 2.0
