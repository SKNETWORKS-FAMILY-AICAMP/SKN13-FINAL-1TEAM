import os
import re
from bs4 import BeautifulSoup, NavigableString
from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH

def parse_style_attribute(style_str):
    """Parses an inline style attribute string into a dictionary."""
    style_dict = {}
    if not style_str:
        return style_dict

    for item in style_str.split(';'):
        if ':' not in item:
            continue
        key, value = item.split(':', 1)
        key = key.strip().lower()
        value = value.strip()
        if key == 'font-family':
            style_dict['font_family'] = value.replace('"', '').replace("'", '')
        elif key == 'font-size':
            style_dict['font_size'] = value
        elif key == 'color':
            match = re.search(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)', value)
            if match:
                style_dict['color'] = {'r': int(match.group(1)), 'g': int(match.group(2)), 'b': int(match.group(3))}
        elif key == 'background-color':
            style_dict['highlight'] = value # Simple mapping for now
        elif key == 'text-align':
            style_dict['text-align'] = value
    return style_dict

def apply_run_formatting(run, style):
    """Applies formatting from a style dict to a run."""
    font = run.font
    if style.get('bold'): font.bold = True
    if style.get('italic'): font.italic = True
    if style.get('underline'): font.underline = True
    if style.get('strike'): font.strike = True
    if style.get('font_family'):
        font.name = style['font_family']
        run._element.rPr.rFonts.set(qn('w:eastAsia'), style['font_family'])
    if style.get('font_size'):
        try:
            size_pt = float(re.sub(r'[^\d.]', '', style['font_size']))
            font.size = Pt(size_pt)
        except ValueError:
            pass
    if style.get('color'):
        rgb = style['color']
        font.color.rgb = RGBColor(rgb['r'], rgb['g'], rgb['b'])
    if style.get('highlight'):
        # Map common highlight colors
        color_map = {'yellow': 'yellow', 'rgb(255, 255, 0)': 'yellow'}
        highlight_color_str = color_map.get(style['highlight'].lower(), 'yellow')
        run.font.highlight_color = getattr(WD_COLOR_INDEX, highlight_color_str.upper(), WD_COLOR_INDEX.YELLOW)

def process_node(node, container, current_style):
    """Recursively processes a node, adding it to the container (doc or cell)."""
    if isinstance(node, NavigableString):
        if node.string.strip():
            p = container if hasattr(container, 'add_run') else container.add_paragraph()
            apply_run_formatting(p.add_run(node.string), current_style)
        return

    # Update style from the current tag
    new_style = current_style.copy()
    tag_name = node.name
    if tag_name in ['strong', 'b']: new_style['bold'] = True
    if tag_name in ['em', 'i']: new_style['italic'] = True
    if tag_name == 'u': new_style['underline'] = True
    if tag_name in ['s', 'del']: new_style['strike'] = True
    if tag_name == 'mark': new_style['highlight'] = 'yellow' # Default highlight for <mark>

    if node.has_attr('style'):
        new_style.update(parse_style_attribute(node['style']))

    # Process element based on its type
    if tag_name in ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
        if tag_name.startswith('h'):
            level = int(tag_name[1])
            p = container.add_heading(level=level)
        else:
            p = container.add_paragraph()
        
        if new_style.get('text-align'):
            align_map = {'left': WD_ALIGN_PARAGRAPH.LEFT, 'center': WD_ALIGN_PARAGRAPH.CENTER, 'right': WD_ALIGN_PARAGRAPH.RIGHT}
            p.alignment = align_map.get(new_style['text-align'], WD_ALIGN_PARAGRAPH.LEFT)

        for child in node.children:
            process_node(child, p, new_style)

    elif tag_name in ['ul', 'ol']:
        for li in node.find_all('li', recursive=False):
            style = 'List Bullet' if tag_name == 'ul' else 'List Number'
            p = container.add_paragraph(style=style)
            for child in li.children:
                process_node(child, p, new_style)

    elif tag_name == 'table':
        rows = node.find_all('tr')
        if not rows: return
        cols_count = max(len(tr.find_all(['td', 'th'])) for tr in rows)
        table = container.add_table(rows=len(rows), cols=cols_count, style='Table Grid')
        for i, tr in enumerate(rows):
            for j, cell_node in enumerate(tr.find_all(['td', 'th'])):
                cell = table.cell(i, j)
                cell.text = '' # Clear default paragraph
                for child in cell_node.children:
                    process_node(child, cell, new_style)

    elif hasattr(container, 'add_run'): # Already in a paragraph
        for child in node.children:
            process_node(child, container, new_style)
    else: # Fallback for other block-level elements
        p = container.add_paragraph()
        for child in node.children:
            process_node(child, p, new_style)


def convert_html_to_docx(html_content: str, output_path: str, title: str = ""):
    if not output_path.endswith('.docx'):
        return False
    try:
        doc = Document()
        if title:
            doc.add_heading(title, level=0)

        soup = BeautifulSoup(html_content, 'html.parser')
        body = soup.find('body') or soup

        for element in body.children:
            if not isinstance(element, NavigableString):
                process_node(element, doc, {})

        doc.save(output_path)
        return True
    except Exception as e:
        print(f"Error during DOCX conversion: {e}")
        import traceback
        traceback.print_exc()
        return False

# Example Usage:
if __name__ == '__main__':
    sample_html = '''
    <h1>이 글은 H1 입니다.</h1><h2>이 글은 H2 입니다.</h2><h3>이 글은 H3 입니다.</h3><p><span style="font-family: 돋움;">이 글은 돋움 입니다.</span></p><p><span style="font-size: 48px;">이 글은 48px입니다</span></p><p><strong>이 글은 볼드체입니다</strong></p><p><em>이 글은 이탤릭체입니다</em></p><p><u>이 글은 밑줄입니다</u></p><p><s>이 글은 취소선입니다.</s></p><p><span style="color: rgb(255, 0, 0);">이 글은 빨간글씨 입니다.</span></p><p><mark>이 글은 하이라이트입니다.</mark></p><p style="text-align: left;">이 글은 왼쪽 정렬입니다.</p><p style="text-align: center;">이 글은 가운데 정렬입니다.</p><p style="text-align: right;">이 글은 오른쪽 정렬입니다.</p><p>아래는 표입니다.</p><table><tbody><tr><th>1</th><th>2</th><th>3</th></tr><tr><td>4</td><td>5</td><td>6</td></tr></tbody></table><ol><li><p>번호 매기기 1</p></li><li><p>번호 매기기 2</p></li></ol><ul><li><p>글머리 기호 1</p></li><li><p>글머리 기호 2</p></li></ul>
    '''
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
    test_output_path = os.path.join(desktop_path, "test_document_final.docx")
    
    print(f"Creating test file at: {test_output_path}")
    success = convert_html_to_docx(sample_html, test_output_path, title="My Final Test Document")
    
    if success:
        print(f"Test file created successfully.")
    else:
        print("Test file creation failed.")
