"""
Base editor strategy for all document editing operations
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from langchain_core.tools import tool


class BaseEditorStrategy(ABC):
    """Base class for all editor strategies"""
    
    @abstractmethod
    def get_tools(self) -> List:
        """Return list of tools provided by this strategy"""
        pass
    
    @abstractmethod
    def get_strategy_name(self) -> str:
        """Return strategy name for logging/debugging"""
        pass
    
    def get_tool_names(self) -> List[str]:
        """Helper to get tool names for easier debugging"""
        return [tool.name for tool in self.get_tools()]


class EditorToolRegistry:
    """Registry for managing all editor strategies"""
    
    def __init__(self):
        self.strategies: List[BaseEditorStrategy] = []
    
    def register_strategy(self, strategy: BaseEditorStrategy):
        """Register a new editor strategy"""
        self.strategies.append(strategy)
    
    def get_all_tools(self) -> List:
        """Get all tools from all registered strategies"""
        tools = []
        for strategy in self.strategies:
            tools.extend(strategy.get_tools())
        return tools
    
    def get_strategy_info(self) -> Dict[str, List[str]]:
        """Get info about registered strategies for debugging"""
        info = {}
        for strategy in self.strategies:
            info[strategy.get_strategy_name()] = strategy.get_tool_names()
        return info
