"""Plugin architecture - extensible token optimizer plugin system.

Allows loading external token optimizer tools (tokenless, token-pilot, etc.)
as Python plugins.
"""

from __future__ import annotations

import importlib
import logging
from abc import ABC, abstractmethod
from typing import Any


logger = logging.getLogger(__name__)


class OptimizerPlugin(ABC):
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    def compress(self, text: str) -> str:
        ...

    def compress_json(self, data: dict[str, Any]) -> dict[str, Any]:
        return data

    def estimate_tokens(self, text: str) -> int:
        return max(1, len(text) // 4)


class BuiltinCompressor(OptimizerPlugin):
    def name(self) -> str:
        return "builtin"

    def compress(self, text: str) -> str:
        text = " ".join(text.split())
        text = text.replace("\t", " ")
        if len(text) > 2000:
            text = text[:1997] + "..."
        return text

    def compress_json(self, data: dict[str, Any]) -> dict[str, Any]:
        from project_underdog.token_optimizer.compressor import TokenCompressor
        return TokenCompressor.compress_json(data)


class PluginRegistry:
    def __init__(self):
        self._plugins: dict[str, OptimizerPlugin] = {}
        self._active: str | None = None

    def register(self, plugin: OptimizerPlugin) -> None:
        self._plugins[plugin.name()] = plugin
        logger.info("Optimizer plugin registered: %s", plugin.name())

    def get(self, name: str) -> OptimizerPlugin | None:
        return self._plugins.get(name)

    def activate(self, name: str) -> bool:
        if name not in self._plugins:
            logger.warning("Plugin not found: %s", name)
            return False
        self._active = name
        logger.info("Optimizer plugin activated: %s", name)
        return True

    @property
    def active(self) -> OptimizerPlugin | None:
        if self._active:
            return self._plugins.get(self._active)
        return None

    @property
    def available(self) -> list[str]:
        return list(self._plugins.keys())


_registry: PluginRegistry | None = None


def get_plugin_registry() -> PluginRegistry:
    global _registry
    if _registry is None:
        _registry = PluginRegistry()
        _registry.register(BuiltinCompressor())
        _registry.activate("builtin")
    return _registry


def load_external_plugin(module_path: str, class_name: str = "OptimizerPlugin") -> bool:
    """Dynamically load an external optimizer plugin."""
    try:
        module = importlib.import_module(module_path)
        plugin_class = getattr(module, class_name)
        plugin = plugin_class()
        get_plugin_registry().register(plugin)
        return True
    except Exception as e:
        logger.error("Failed to load plugin %s.%s: %s", module_path, class_name, e)
        return False
