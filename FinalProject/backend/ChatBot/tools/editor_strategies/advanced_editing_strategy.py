"""
Advanced editing strategy - document enhancement and styling
"""

import logging
import re
from typing import List, Dict, Any
from langchain_core.tools import tool
from bs4 import BeautifulSoup

from .base_strategy import BaseEditorStrategy

logger = logging.getLogger(__name__)


class AdvancedEditingStrategy(BaseEditorStrategy):
    """Strategy for advanced document editing and enhancement"""
    
    def get_strategy_name(self) -> str:
        return "AdvancedEditingStrategy"
    
    def get_tools(self) -> List:
        return [
            apply_document_styling,
            enhance_document_readability,
            create_list,
            create_table,
            add_blockquote
        ]


@tool
def apply_document_styling(
    document_content: str,
    style_theme: str = "professional",
    color_scheme: str = "default"
) -> str:
    """
    문서에 일관된 스타일링을 적용합니다.
    style_theme: professional, modern, minimal, academic
    color_scheme: default, blue, green, warm
    """
    logger.info(f"문서 스타일링 적용: {style_theme} theme, {color_scheme} colors")
    
    try:
        soup = BeautifulSoup(document_content, 'html.parser')
        
        # Get color schemes
        colors = _get_color_scheme(color_scheme)
        
        # Apply theme-specific styling
        if style_theme == "professional":
            _apply_professional_styling(soup, colors)
        elif style_theme == "modern":
            _apply_modern_styling(soup, colors)
        elif style_theme == "minimal":
            _apply_minimal_styling(soup, colors)
        elif style_theme == "academic":
            _apply_academic_styling(soup, colors)
        else:
            _apply_default_styling(soup, colors)
        
        return str(soup)
    
    except Exception as e:
        logger.error(f"스타일링 적용 오류: {str(e)}")
        return document_content


@tool
def enhance_document_readability(
    document_content: str,
    improvements: List[str] = None
) -> str:
    """
    문서의 가독성을 향상시킵니다.
    improvements: spacing, typography, structure, highlighting
    """
    if improvements is None:
        improvements = ["spacing", "typography", "structure"]
    
    logger.info(f"가독성 향상 적용: {', '.join(improvements)}")
    
    try:
        soup = BeautifulSoup(document_content, 'html.parser')
        
        if "spacing" in improvements:
            _improve_spacing(soup)
        
        if "typography" in improvements:
            _improve_typography(soup)
        
        if "structure" in improvements:
            _improve_structure(soup)
        
        if "highlighting" in improvements:
            _add_highlighting(soup)
        
        return str(soup)
    
    except Exception as e:
        logger.error(f"가독성 향상 오류: {str(e)}")
        return document_content


@tool
def create_list(
    document_content: str,
    items: List[str],
    list_type: str = "unordered",
    insert_position: str = "end"
) -> str:
    """
    리스트를 생성하고 문서에 삽입합니다.
    list_type: ordered, unordered
    insert_position: start, end, after_heading
    """
    logger.info(f"리스트 생성: {list_type}, 항목 {len(items)}개")
    
    try:
        soup = BeautifulSoup(document_content, 'html.parser')
        
        # Create list element
        list_tag_name = "ol" if list_type == "ordered" else "ul"
        list_element = soup.new_tag(list_tag_name, style="margin: 16px 0; padding-left: 24px;")
        
        # Add list items
        for item in items:
            li = soup.new_tag("li", style="margin-bottom: 8px;")
            li.string = item
            list_element.append(li)
        
        # Insert at specified position
        _insert_at_position(soup, list_element, insert_position)
        
        return str(soup)
    
    except Exception as e:
        logger.error(f"리스트 생성 오류: {str(e)}")
        return document_content


@tool
def create_table(
    document_content: str,
    headers: List[str],
    rows: List[List[str]],
    table_style: str = "standard"
) -> str:
    """
    테이블을 생성하고 문서에 추가합니다.
    table_style: standard, minimal, striped, bordered
    """
    logger.info(f"테이블 생성: {len(headers)}x{len(rows)}, {table_style} style")
    
    try:
        soup = BeautifulSoup(document_content, 'html.parser')
        
        # Get table styles
        table_styles = _get_table_styles(table_style)
        
        # Create table
        table = soup.new_tag("table", style=table_styles["table"])
        
        # Create header
        if headers:
            thead = soup.new_tag("thead")
            header_row = soup.new_tag("tr")
            
            for header in headers:
                th = soup.new_tag("th", style=table_styles["header"])
                th.string = header
                header_row.append(th)
            
            thead.append(header_row)
            table.append(thead)
        
        # Create body
        tbody = soup.new_tag("tbody")
        for i, row_data in enumerate(rows):
            row = soup.new_tag("tr")
            if table_style == "striped" and i % 2 == 1:
                row["style"] = "background-color: #f9f9f9;"
            
            for cell_data in row_data:
                td = soup.new_tag("td", style=table_styles["cell"])
                td.string = cell_data
                row.append(td)
            
            tbody.append(row)
        
        table.append(tbody)
        soup.append(table)
        
        return str(soup)
    
    except Exception as e:
        logger.error(f"테이블 생성 오류: {str(e)}")
        return document_content


@tool
def add_blockquote(
    document_content: str,
    quote_text: str,
    author: str = "",
    style: str = "standard"
) -> str:
    """
    인용문 블록을 추가합니다.
    style: standard, callout, highlight
    """
    logger.info(f"인용문 추가: {style} style")
    
    try:
        soup = BeautifulSoup(document_content, 'html.parser')
        
        # Create blockquote with style
        blockquote_styles = _get_blockquote_styles(style)
        blockquote = soup.new_tag("blockquote", style=blockquote_styles)
        
        # Add quote text
        quote_p = soup.new_tag("p")
        quote_p.string = quote_text
        blockquote.append(quote_p)
        
        # Add author if provided
        if author:
            author_p = soup.new_tag("p", style="text-align: right; margin-top: 8px; font-style: italic; font-size: 0.9em;")
            author_p.string = f"— {author}"
            blockquote.append(author_p)
        
        soup.append(blockquote)
        return str(soup)
    
    except Exception as e:
        logger.error(f"인용문 추가 오류: {str(e)}")
        return document_content


# === Helper Functions ===

def _get_color_scheme(scheme: str) -> Dict[str, str]:
    """Get color scheme dictionary"""
    schemes = {
        "default": {
            "primary": "#333333",
            "secondary": "#666666", 
            "accent": "#007acc",
            "light": "#f5f5f5",
            "border": "#dddddd"
        },
        "blue": {
            "primary": "#1e3a8a",
            "secondary": "#3b82f6",
            "accent": "#60a5fa", 
            "light": "#eff6ff",
            "border": "#bfdbfe"
        },
        "green": {
            "primary": "#166534",
            "secondary": "#16a34a",
            "accent": "#4ade80",
            "light": "#f0fdf4", 
            "border": "#bbf7d0"
        },
        "warm": {
            "primary": "#92400e",
            "secondary": "#d97706",
            "accent": "#f59e0b",
            "light": "#fffbeb",
            "border": "#fed7aa"
        }
    }
    return schemes.get(scheme, schemes["default"])


def _apply_professional_styling(soup: BeautifulSoup, colors: Dict[str, str]):
    """Apply professional theme styling"""
    
    # Headers
    for level in ['h1', 'h2', 'h3']:
        for header in soup.find_all(level):
            if level == 'h1':
                style = f"color: {colors['primary']}; font-size: 28px; margin: 32px 0 24px 0; text-align: center; border-bottom: 2px solid {colors['accent']}; padding-bottom: 16px;"
            elif level == 'h2':
                style = f"color: {colors['primary']}; font-size: 22px; margin: 28px 0 16px 0; border-bottom: 1px solid {colors['border']}; padding-bottom: 8px;"
            else:
                style = f"color: {colors['secondary']}; font-size: 18px; margin: 20px 0 12px 0;"
            header["style"] = style
    
    # Paragraphs
    for p in soup.find_all('p'):
        current_style = p.get('style', '')
        if 'color:' not in current_style and 'font-style: italic' not in current_style:
            p["style"] = f"{current_style} line-height: 1.6; margin: 16px 0; color: {colors['primary']}; font-size: 14px;".strip()


def _apply_modern_styling(soup: BeautifulSoup, colors: Dict[str, str]):
    """Apply modern theme styling"""
    
    # Headers with modern styling
    for level in ['h1', 'h2', 'h3']:
        for header in soup.find_all(level):
            if level == 'h1':
                style = f"color: {colors['primary']}; font-size: 32px; font-weight: 300; margin: 40px 0 32px 0; text-align: center;"
            elif level == 'h2':
                style = f"color: {colors['accent']}; font-size: 24px; font-weight: 400; margin: 32px 0 20px 0; padding-left: 16px; border-left: 4px solid {colors['accent']};"
            else:
                style = f"color: {colors['secondary']}; font-size: 18px; font-weight: 500; margin: 24px 0 16px 0;"
            header["style"] = style


def _apply_minimal_styling(soup: BeautifulSoup, colors: Dict[str, str]):
    """Apply minimal theme styling"""
    
    # Clean, minimal headers
    for level in ['h1', 'h2', 'h3']:
        for header in soup.find_all(level):
            if level == 'h1':
                style = f"color: {colors['primary']}; font-size: 26px; font-weight: 400; margin: 48px 0 32px 0; text-align: left;"
            elif level == 'h2':
                style = f"color: {colors['primary']}; font-size: 20px; font-weight: 400; margin: 32px 0 16px 0;"
            else:
                style = f"color: {colors['secondary']}; font-size: 16px; font-weight: 400; margin: 24px 0 12px 0;"
            header["style"] = style


def _apply_academic_styling(soup: BeautifulSoup, colors: Dict[str, str]):
    """Apply academic theme styling"""
    
    # Formal academic styling
    for level in ['h1', 'h2', 'h3']:
        for header in soup.find_all(level):
            if level == 'h1':
                style = f"color: {colors['primary']}; font-size: 24px; font-weight: bold; margin: 32px 0 24px 0; text-align: center; text-transform: uppercase; letter-spacing: 1px;"
            elif level == 'h2':
                style = f"color: {colors['primary']}; font-size: 18px; font-weight: bold; margin: 28px 0 16px 0;"
            else:
                style = f"color: {colors['secondary']}; font-size: 16px; font-weight: bold; margin: 20px 0 12px 0;"
            header["style"] = style


def _apply_default_styling(soup: BeautifulSoup, colors: Dict[str, str]):
    """Apply default styling"""
    _apply_professional_styling(soup, colors)


def _improve_spacing(soup: BeautifulSoup):
    """Improve document spacing"""
    for p in soup.find_all('p'):
        current_style = p.get('style', '')
        if 'margin:' not in current_style and 'margin-' not in current_style:
            p["style"] = f"{current_style} margin: 16px 0;".strip()


def _improve_typography(soup: BeautifulSoup):
    """Improve typography"""
    for p in soup.find_all('p'):
        current_style = p.get('style', '')
        if 'line-height:' not in current_style:
            p["style"] = f"{current_style} line-height: 1.6; font-size: 14px;".strip()


def _improve_structure(soup: BeautifulSoup):
    """Improve document structure"""
    # Add spacing after sections
    for h2 in soup.find_all('h2'):
        current_style = h2.get('style', '')
        if 'margin-top:' not in current_style:
            h2["style"] = f"{current_style} margin-top: 32px;".strip()


def _add_highlighting(soup: BeautifulSoup):
    """Add subtle highlighting to important elements"""
    # Highlight first paragraph of sections
    for h2 in soup.find_all('h2'):
        next_p = h2.find_next_sibling('p')
        if next_p and 'background-color:' not in next_p.get('style', ''):
            current_style = next_p.get('style', '')
            next_p["style"] = f"{current_style} background-color: #f9f9f9; padding: 12px; border-left: 3px solid #007acc;".strip()


def _insert_at_position(soup: BeautifulSoup, element, position: str):
    """Insert element at specified position"""
    if position == "start":
        soup.insert(0, element)
    elif position == "after_heading":
        last_heading = soup.find(['h1', 'h2', 'h3'])
        if last_heading:
            last_heading.insert_after(element)
        else:
            soup.append(element)
    else:  # default to end
        soup.append(element)


def _get_table_styles(style: str) -> Dict[str, str]:
    """Get table styling dictionary"""
    styles = {
        "standard": {
            "table": "width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #ddd;",
            "header": "border: 1px solid #ddd; padding: 12px; background-color: #f5f5f5; font-weight: bold; text-align: left;",
            "cell": "border: 1px solid #ddd; padding: 10px;"
        },
        "minimal": {
            "table": "width: 100%; border-collapse: collapse; margin: 20px 0;",
            "header": "border-bottom: 2px solid #333; padding: 12px 8px; font-weight: bold; text-align: left;",
            "cell": "border-bottom: 1px solid #eee; padding: 10px 8px;"
        },
        "striped": {
            "table": "width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #ddd;",
            "header": "border: 1px solid #ddd; padding: 12px; background-color: #f0f0f0; font-weight: bold; text-align: left;",
            "cell": "border: 1px solid #ddd; padding: 10px;"
        },
        "bordered": {
            "table": "width: 100%; border-collapse: collapse; margin: 20px 0; border: 2px solid #333;",
            "header": "border: 1px solid #333; padding: 12px; background-color: #f5f5f5; font-weight: bold; text-align: left;",
            "cell": "border: 1px solid #333; padding: 10px;"
        }
    }
    return styles.get(style, styles["standard"])


def _get_blockquote_styles(style: str) -> str:
    """Get blockquote styling"""
    styles = {
        "standard": "margin: 20px 0; padding: 16px 20px; border-left: 4px solid #ddd; background-color: #f9f9f9; font-style: italic;",
        "callout": "margin: 20px 0; padding: 20px; border: 1px solid #007acc; background-color: #f0f8ff; border-radius: 4px;",
        "highlight": "margin: 20px 0; padding: 16px 20px; border-left: 4px solid #f59e0b; background-color: #fffbeb; font-weight: 500;"
    }
    return styles.get(style, styles["standard"])