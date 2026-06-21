"""Token optimizer - veri boyutu kucultme katmani.

Uses plugin architecture for extensibility.
"""

from project_underdog.token_optimizer.compressor import TokenCompressor
from project_underdog.token_optimizer.plugin import (
    OptimizerPlugin,
    BuiltinCompressor,
    PluginRegistry,
    get_plugin_registry,
    load_external_plugin,
)

__all__ = [
    "TokenCompressor",
    "OptimizerPlugin",
    "BuiltinCompressor",
    "PluginRegistry",
    "get_plugin_registry",
    "load_external_plugin",
]
