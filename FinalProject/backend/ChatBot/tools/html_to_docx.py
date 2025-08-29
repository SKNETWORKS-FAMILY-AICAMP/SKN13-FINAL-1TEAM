import os
import re
from bs4 import BeautifulSoup, NavigableString
from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX
from docx.table import _Cell
from docx.text.paragraph import Paragraph

# ------------------------ Helpers ------------------------
def parse_style_attribute(style_str: str) -> dict:
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
            style_dict['font_family'] = value.replace('"', '').replace("'", "")
        elif key == 'font-size':
            style_dict['font_size'] = value
        elif key == 'color':
            m = re.match(r'rgb\((\d+),\s*(\d+),\s*(\d+)\)', value)
            if m:
                style_dict['color'] = {'r': int(m.group(1)), 'g': int(m.group(2)), 'b': int(m.group(3))}
            else:
                style_dict['color'] = value
        elif key == 'background-color':
            style_dict['highlight'] = value
        elif key == 'text-align':
            style_dict['text-align'] = value
    return style_dict

def apply_run_formatting(run, style: dict):
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
        c = style['color']
        if isinstance(c, dict):
            font.color.rgb = RGBColor(c['r'], c['g'], c['b'])
    if style.get('highlight'):
        run.font.highlight_color = WD_COLOR_INDEX.YELLOW

# 안전하게 paragraph 생성
def safe_add_paragraph(container):
    if isinstance(container, Document) or isinstance(container, _Cell):
        return container.add_paragraph()
    elif isinstance(container, Paragraph):
        return container  # Paragraph 안에서는 run만 사용
    else:
        raise TypeError(f"Unsupported container type: {type(container)}")

# ------------------------ Node Processing ------------------------
def process_node(node, container, style: dict):
    if isinstance(node, NavigableString):
        text = node.string.strip()
        if text:
            if isinstance(container, Paragraph):
                run = container.add_run(text)
                apply_run_formatting(run, style)
            elif isinstance(container, (_Cell, Document)):
                p = container.add_paragraph()
                run = p.add_run(text)
                apply_run_formatting(run, style)
        return

    new_style = style.copy()
    tag = node.name
    if tag in ['b', 'strong']: new_style['bold'] = True
    if tag in ['i', 'em']: new_style['italic'] = True
    if tag == 'u': new_style['underline'] = True
    if tag in ['s', 'del']: new_style['strike'] = True
    if tag == 'mark': new_style['highlight'] = 'yellow'
    if node.has_attr('style'):
        new_style.update(parse_style_attribute(node['style']))

    # ----------------- Block Elements -----------------
    if tag in ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
        if tag.startswith('h'):
            level = int(tag[1])
            p = safe_add_paragraph(container)
            p.style = container.styles['Heading {}'.format(level)]
        else:
            p = safe_add_paragraph(container)

        if new_style.get('text-align'):
            align_map = {'left': WD_ALIGN_PARAGRAPH.LEFT,
                         'center': WD_ALIGN_PARAGRAPH.CENTER,
                         'right': WD_ALIGN_PARAGRAPH.RIGHT}
            p.alignment = align_map.get(new_style['text-align'], WD_ALIGN_PARAGRAPH.LEFT)

        for child in node.children:
            process_node(child, p, new_style)

    elif tag in ['ul', 'ol']:
        for li in node.find_all('li', recursive=False):
            style_name = 'List Bullet' if tag == 'ul' else 'List Number'
            p = safe_add_paragraph(container)
            p.style = style_name
            for child in li.children:
                process_node(child, p, new_style)

    elif tag == 'table':
        rows = node.find_all('tr')
        if not rows:
            return
        col_count = max(len(tr.find_all(['td', 'th'])) for tr in rows)
        table = safe_add_paragraph(container).add_table(rows=len(rows), cols=col_count, style='Table Grid') \
            if isinstance(container, Paragraph) else container.add_table(rows=len(rows), cols=col_count, style='Table Grid')
        for i, tr in enumerate(rows):
            cells = tr.find_all(['td', 'th'])
            for j, td in enumerate(cells):
                cell = table.cell(i, j)
                cell.text = ''
                for child in td.children:
                    process_node(child, cell, new_style)

    else:
        for child in node.children:
            process_node(child, container, new_style)

# ------------------------ Main Function ------------------------
def convert_html_to_docx(html_content: str, output_path: str, title: str = "") -> bool:
    if not output_path.endswith('.docx'):
        return False
    try:
        doc = Document()
        if title:
            doc.add_heading(title, level=0)

        soup = BeautifulSoup(html_content, 'html.parser')
        body = soup.find('body') or soup

        for el in body.children:
            process_node(el, doc, {})

        doc.save(output_path)
        return True
    except Exception as e:
        print(f"Error during conversion: {e}")
        import traceback
        traceback.print_exc()
        return False


# ------------------------ Example ------------------------
if __name__ == '__main__':
    sample_html = '''
    <h1>H1 제목</h1><h2>H2 제목</h2><p><span style="font-family: 돋움;">돋움 글씨</span></p>
    <p><span style="font-size: 48px;">48px 글씨</span></p><p><strong>볼드체</strong></p>
    <p><em>이탤릭</em></p><p><u>밑줄</u></p><p><s>취소선</s></p>
    <p><span style="color: rgb(255,0,0);">빨간 글씨</span></p><p><mark>하이라이트</mark></p>
    <table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>
    <ol><li>번호 1</li><li>번호 2</li></ol>
    <ul><li>글머리 1</li><li>글머리 2</li></ul>
    '''
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
    test_output = os.path.join(desktop_path, "final_doc.docx")
    success = convert_html_to_docx(sample_html, test_output, title="완벽 테스트 문서")
    print("완료!" if success else "실패!")
