"""
새로운 Strategy Pattern 기반 Editor Tool
1061줄 스파게티 코드를 전략 패턴으로 리팩토링
"""

import logging
from typing import List

# Import all strategies
from .editor_strategies.base_strategy import EditorToolRegistry
from .editor_strategies.basic_text_strategy import BasicTextStrategy  
from .editor_strategies.html_editing_strategy import HtmlEditingStrategy
from .editor_strategies.structure_template_strategy import StructureTemplateStrategy
from .editor_strategies.advanced_editing_strategy import AdvancedEditingStrategy

logger = logging.getLogger(__name__)

# Initialize the registry and register all strategies
EDITOR_REGISTRY = EditorToolRegistry()
EDITOR_REGISTRY.register_strategy(BasicTextStrategy())
EDITOR_REGISTRY.register_strategy(HtmlEditingStrategy())
EDITOR_REGISTRY.register_strategy(StructureTemplateStrategy())
EDITOR_REGISTRY.register_strategy(AdvancedEditingStrategy())

# Export all tools in a single list (maintains backward compatibility)
ALL_EDITOR_TOOLS = EDITOR_REGISTRY.get_all_tools()

# Export strategy info for debugging
STRATEGY_INFO = EDITOR_REGISTRY.get_strategy_info()

logger.info(f"Editor tool strategies initialized:")
for strategy_name, tool_names in STRATEGY_INFO.items():
    logger.info(f"  {strategy_name}: {len(tool_names)} tools")

logger.info(f"Total editor tools available: {len(ALL_EDITOR_TOOLS)}")

# Export specific tool functions for direct use if needed
from .editor_strategies.basic_text_strategy import (
    replace_text_in_document,
    add_formatted_text,
    format_text_block
)

from .editor_strategies.html_editing_strategy import (
    edit_html_document,
    run_document_edit,
    insert_content_at_position
)

from .editor_strategies.structure_template_strategy import (
    create_document_structure,
    create_business_report_template, 
    create_meeting_minutes_template,
    generate_document_from_outline
)

from .editor_strategies.advanced_editing_strategy import (
    apply_document_styling,
    enhance_document_readability,
    create_list,
    create_table,
    add_blockquote
)

# Backward compatibility function
def get_available_tools() -> List[str]:
    """Get list of all available tool names"""
    return [tool.name for tool in ALL_EDITOR_TOOLS]

def get_strategy_summary() -> dict:
    """Get summary of strategies and their tools for debugging"""
    return {
        "total_strategies": len(EDITOR_REGISTRY.strategies),
        "total_tools": len(ALL_EDITOR_TOOLS),
        "strategies": STRATEGY_INFO
    }

# Legacy support function
def create_final_prompt(user_command: str, document_content: str) -> str:
    """
    DEPRECATED: This function existed in original editor_tool.py
    Use the new strategy-based approach instead
    """
    logger.warning("create_final_prompt is deprecated. Use run_document_edit instead.")
    return f"""
현재 HTML 문서 내용:
{document_content}

사용자 편집 요청:
{user_command}

위 요청을 분석하여 적절한 편집 도구를 사용해 문서를 수정하세요.
"""

# Export for compatibility
__all__ = [
    'ALL_EDITOR_TOOLS',
    'EDITOR_REGISTRY', 
    'STRATEGY_INFO',
    'get_available_tools',
    'get_strategy_summary',
    # Tool functions
    'replace_text_in_document',
    'edit_html_document', 
    'run_document_edit',
    'create_document_structure',
    'create_business_report_template',
    'create_meeting_minutes_template',
    'add_formatted_text',
    'create_list',
    'create_table',
    'add_blockquote',
    'insert_content_at_position',
    'format_text_block',
    'apply_document_styling',
    'enhance_document_readability',
    'generate_document_from_outline',
    # Legacy
    'create_final_prompt'
]