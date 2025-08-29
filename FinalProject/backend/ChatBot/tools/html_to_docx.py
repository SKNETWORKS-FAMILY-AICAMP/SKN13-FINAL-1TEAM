from bs4 import BeautifulSoup
from html2docx import html2docx
import os

def convert_html_to_docx(html_content: str, output_path: str, title: str) -> bool:
    """
    Converts an HTML string to a .docx file using the html2docx function,
    after cleaning the HTML.

    Args:
        html_content: The HTML content as a string.
        output_path: The full path where the .docx file will be saved.
        title: The title of the document.

    Returns:
        True if conversion was successful, False otherwise.
    """
    if not output_path.endswith('.docx'):
        print("Error: Output path must end with .docx")
        return False

    try:
        # Ensure the output directory exists
        output_dir = os.path.dirname(output_path)
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # Clean the HTML content
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Remove script and style tags as they can interfere with conversion
        for tag in soup(['script', 'style']):
            tag.decompose()
            
        cleaned_html = str(soup)

        print(f"--- convert_html_to_docx: Cleaned HTML content length: {len(cleaned_html)} ---")
        print(f"--- convert_html_to_docx: Cleaned HTML (first 500 chars): {cleaned_html[:500]} ---")

        # html2docx function returns a buffer
        buf = html2docx(cleaned_html, title=title)
        print(f"--- convert_html_to_docx: html2docx returned buffer. Buffer length: {len(buf.getvalue())} ---")

        # Write the buffer to a .docx file
        with open(output_path, "wb") as f:
            f.write(buf.getvalue())
        
        print(f"Successfully converted HTML to {output_path}")
        return True
    except Exception as e:
        import traceback
        print(f"An error occurred during DOCX conversion: {e}")
        traceback.print_exc()
        return False

# Example Usage:
if __name__ == '__main__':
    sample_html = """
    <h1>This is a Test Heading</h1>
    <p>This is a test paragraph from your GigaChad agent.</p>
    <p>This text should be <b>bold</b> and this should be <i>italic</i>.</p>
    <style>
        p { color: red; }
    </style>
    <ul>
        <li>List item 1</li>
        <li>List item 2</li>
    </ul>
    <script>
        alert('This should be removed');
    </script>
    """
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
    test_output_path = os.path.join(desktop_path, "test_document_final.docx")
    
    success = convert_html_to_docx(sample_html, test_output_path, title="My Final Test")
    
    if success:
        print(f"Test file created at: {test_output_path}")
    else:
        print("Test file creation failed.")
