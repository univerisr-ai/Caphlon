"""Tests for config/settings."""

import os
import pytest
from project_underdog.config import get_settings, reset_settings, Settings


class TestSettings:
    def test_defaults(self):
        os.environ.pop("UNDERDOG_HOST", None)
        os.environ.pop("UNDERDOG_PORT", None)
        reset_settings()

        settings = get_settings()
        assert settings.host == "0.0.0.0"
        assert settings.port == 8800
        assert settings.min_workers == 3
        assert settings.consensus_threshold == 0.5

    def test_env_overrides(self):
        os.environ["UNDERDOG_HOST"] = "127.0.0.1"
        os.environ["UNDERDOG_PORT"] = "9999"
        os.environ.pop("UNDERDOG_URL", None)
        reset_settings()

        settings = get_settings()
        assert settings.host == "127.0.0.1"
        assert settings.port == 9999
        assert settings.orchestrator_url == "ws://127.0.0.1:9999/ws"

    def test_data_dir(self):
        settings = get_settings()
        assert settings.data_dir.exists()
        assert settings.data_dir.is_dir()
        assert settings.export_dir.exists()

    def test_model_dir_property(self):
        settings = get_settings()
        assert settings.model_dir.exists()
