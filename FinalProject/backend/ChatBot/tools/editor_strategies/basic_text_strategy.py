"""
Basic text editing strategy - simple text operations
"""

import logging
from typing import List
from langchain_core.tools import tool
from bs4 import BeautifulSoup

from .base_strategy import BaseEditorStrategy

logger = logging.getLogger(__name__)


class BasicTextStrategy(BaseEditorStrategy):
    """Strategy for basic text editing operations"""
    
    def get_strategy_name(self) -> str:
        return "BasicTextStrategy"
    
    def get_tools(self) -> List:
        return [
            replace_text_in_document,
            add_formatted_text,
            format_text_block
        ]


@tool
def replace_text_in_document(document_content: str, old_text: str, new_text: str) -> str:
    """
    주어진 문서 내용에서 특정 텍스트를 찾아 다른 텍스트로 교체합니다.
    GPT가 단순 문자열 치환을 해야 할 때 사용하는 경량 툴.
    """
    logger.info(f"Replacing '{old_text[:50]}...' with '{new_text[:50]}...'")
    # Perform the text replacement
    updated_content = document_content.replace(old_text, new_text)
    
    # Normalize all newline types (\r\n, \r, \n) to <br /> for HTML
    # First, convert Windows-style \r\n to \n
    content_with_lf = updated_content.replace('\r\n', '\n')
    # Then, convert any remaining Mac-style \r to \n
    content_with_lf = content_with_lf.replace('\r', '\n')
    # Finally, convert all \n to <br />
    return content_with_lf.replace('\n', '<br />')




@tool
def add_formatted_text(
    document_content: str,
    text: str,
    format_type: str = "paragraph",
    position: str = "end"
) -> str:
    """
    문서에 포맷된 텍스트를 추가합니다.
    format_type: paragraph, heading1, heading2, heading3, bold, italic, underline
    position: start, end, after_tag
    """
    logger.info(f"Adding formatted text: {format_type} at {position}")
    
    try:
        soup = BeautifulSoup(document_content, 'html.parser')
        
        # Create formatted element
        if format_type == "paragraph":
            new_element = soup.new_tag("p")
        elif format_type == "heading1":
            new_element = soup.new_tag("h1")
        elif format_type == "heading2":
            new_element = soup.new_tag("h2")
        elif format_type == "heading3":
            new_element = soup.new_tag("h3")
        elif format_type == "bold":
            new_element = soup.new_tag("strong")
        elif format_type == "italic":
            new_element = soup.new_tag("em")
        elif format_type == "underline":
            new_element = soup.new_tag("u")
        else:
            new_element = soup.new_tag("p")  # default to paragraph
        
        new_element.string = text
        
        # Insert based on position
        if position == "start":
            if soup.body:
                soup.body.insert(0, new_element)
            else:
                soup.insert(0, new_element)
        else:  # default to end
            if soup.body:
                soup.body.append(new_element)
            else:
                soup.append(new_element)
        
        return str(soup)
    
    except Exception as e:
        logger.error(f"Error adding formatted text: {e}")
        return document_content


@tool
def format_text_block(
    document_content: str,
    target_text: str,
    format_style: str = "bold"
) -> str:
    """
    문서 내 특정 텍스트 블록에 포맷을 적용합니다.
    format_style: bold, italic, underline, highlight, strikethrough
    """
    logger.info(f"Formatting text block with {format_style}")
    
    try:
        soup = BeautifulSoup(document_content, 'html.parser')
        
        # Find and replace text with formatted version
        for text_node in soup.find_all(string=True):
            if target_text in text_node:
                new_content = text_node.replace(target_text, f'<{_get_format_tag(format_style)}>{target_text}</{_get_format_tag(format_style)}>')
                text_node.replace_with(BeautifulSoup(new_content, 'html.parser'))
        
        return str(soup)
    
    except Exception as e:
        logger.error(f"Error formatting text block: {e}")
        return document_content


def _get_format_tag(format_style: str) -> str:
    """Get HTML tag for format style"""
    format_map = {
        "bold": "strong",
        "italic": "em", 
        "underline": "u",
        "highlight": "mark",
        "strikethrough": "s"
    }
    return format_map.get(format_style, "span")