"""
Base editor strategy for all document editing operations
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import functools
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
        """Get all tools from all registered strategies and add logging."""
        all_tools = []
        for strategy in self.strategies:
            for tool_obj in strategy.get_tools():
                original_func = tool_obj.func
                
                @functools.wraps(original_func)
                def wrapper(*args, **kwargs):
                    # Use a more descriptive name for the tool object to avoid shadowing
                    print(f"\n>> Calling Tool: {tool_obj.name}\n   Args: {args}\n   Kwargs: {kwargs}\n")
                    return original_func(*args, **kwargs)
                
                tool_obj.func = wrapper
                all_tools.append(tool_obj)
        return all_tools
    
    def get_strategy_info(self) -> Dict[str, List[str]]:
        """Get info about registered strategies for debugging"""
        info = {}
        for strategy in self.strategies:
            info[strategy.get_strategy_name()] = strategy.get_tool_names()
        return info
