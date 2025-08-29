import os
import re
from bs4 import BeautifulSoup, NavigableString
from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def add_run_with_style(paragraph, text, style):
    run = paragraph.add_run(text)
    font = run.font

    # 텍스트 스타일
    font.bold = style.get('bold', False)
    font.italic = style.get('italic', False)
    font.underline = style.get('underline', False)
    font.strike = style.get('strike', False)

    # 폰트, 크기
    if 'font_family' in style:
        font.name = style['font_family']
        r = run._element.rPr.rFonts
        r.set(qn('w:eastAsia'), style['font_family'])  # 한글 폰트 적용
    if 'font_size' in style:
        try:
            size_val = float(re.sub(r'[^\d.]', '', style['font_size']))
            font.size = Pt(size_val)
        except:
            pass

    # 색상
    if 'color' in style:
        color = style['color'].lstrip('#')
        if len(color) == 6:
            font.color.rgb = RGBColor.from_string(color.upper())
    if 'bgcolor' in style:
        # Background color는 DOCX 제한, 하이라이트 정도 적용
        shading_elm = OxmlElement('w:shd')
        shading_elm.set(qn('w:fill'), style['bgcolor'].lstrip('#'))
        run._element.rPr.append(shading_elm)

def parse_inline_style(style_str):
    style_dict = {}
    for item in style_str.split(';'):
        if ':' in item:
            key, val = item.split(':', 1)
            key = key.strip().lower()
            val = val.strip()
            if key == 'font-family':
                style_dict['font_family'] = val.strip("'\"")
            elif key == 'font-size':
                style_dict['font_size'] = val
            elif key == 'color':
                style_dict['color'] = val
            elif key in ['background-color', 'background']:
                style_dict['bgcolor'] = val
            elif key == 'text-decoration':
                if 'line-through' in val:
                    style_dict['strike'] = True
                if 'underline' in val:
                    style_dict['underline'] = True
    return style_dict

def process_node(node, paragraph, parent_style):
    style = parent_style.copy()

    # 태그 기반 스타일
    if node.name in ['b', 'strong']:
        style['bold'] = True
    if node.name in ['i', 'em']:
        style['italic'] = True
    if node.name == 'u':
        style['underline'] = True
    if node.name in ['s', 'del']:
        style['strike'] = True

    # inline style
    if node.attrs.get('style'):
        inline = parse_inline_style(node.attrs['style'])
        style.update(inline)

    if isinstance(node, NavigableString):
        if node.string.strip():
            add_run_with_style(paragraph, node.string, style)
    else:
        # table
        if node.name == 'table':
            table = paragraph._parent.add_table(rows=0, cols=0)
            table.style = 'Table Grid'
            for tr in node.find_all('tr', recursive=False):
                row = table.add_row()
                cells = tr.find_all(['td','th'], recursive=False)
                for i, td in enumerate(cells):
                    if len(row.cells) < len(cells):
                        row.add_cell()
                    cell_p = row.cells[i].paragraphs[0]
                    process_node(td, cell_p, style)
        # lists
        elif node.name in ['ul', 'ol']:
            for li in node.find_all('li', recursive=False):
                style_name = 'List Bullet' if node.name == 'ul' else 'List Number'
                p = paragraph._parent.add_paragraph(style=style_name)
                process_node(li, p, style)
        # headings
        elif node.name in ['h1','h2','h3','h4','h5','h6']:
            level = int(node.name[1])
            p = paragraph._parent.add_paragraph(style=f'Heading {level}')
            for child in node.children:
                process_node(child, p, style)
        # paragraph
        elif node.name == 'p':
            p = paragraph._parent.add_paragraph()
            for child in node.children:
                process_node(child, p, style)
        # span or others
        else:
            for child in node.children:
                process_node(child, paragraph, style)

def convert_html_to_docx(html_content: str, output_path: str, title: str=""):
    if not output_path.endswith('.docx'):
        print("Error: Output must be .docx")
        return False
    try:
        doc = Document()
        if title:
            doc.add_heading(title, level=1)

        soup = BeautifulSoup(html_content, 'html.parser')
        body = soup.find('body') or soup
        dummy_paragraph = doc.add_paragraph()  # dummy to start

        for element in body.children:
            if isinstance(element, NavigableString):
                if element.string.strip():
                    doc.add_paragraph(element.string)
            else:
                process_node(element, dummy_paragraph, {})

        doc.save(output_path)
        print(f"HTML successfully converted to {output_path}")
        return True
    except Exception as e:
        import traceback
        print(f"Conversion error: {e}")
        traceback.print_exc()
        return False

# Example Usage:
if __name__ == '__main__':
    sample_html = """
    <html>
    <head></head>
    <body>
        <h1>This is a Test Heading</h1>
        <p>This is a test paragraph.</p>
        <p>This text should be <b>bold</b>, <i>italic</i>, <u>underlined</u>, and <s>struck through</s>.</p>
        <p>Here is some <span style=\"font-family: 'Courier New';\">Courier New font</span>.</p>
        <p>Here is some <span style=\"font-size: 24pt;\">24pt font size</span>.</p>
        <p>A mix of styles: <b>bold and <span style=\"font-family: 'Times New Roman'; font-size: 16pt;\"><i>italic Times New Roman</i></span></b>.</p>
        <ul>
            <li>List item 1</li>
            <li>List item 2: <b>with bold</b></li>
        </ul>
    </body>
    </html>
    """
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
    test_output_path = os.path.join(desktop_path, "test_document_final_final.docx")
    
    print(f"Creating test file at: {test_output_path}")
    success = convert_html_to_docx(sample_html, test_output_path, title="My Final Test Document")
    
    if success:
        print(f"Test file created successfully.")
    else:
        print("Test file creation failed.")
