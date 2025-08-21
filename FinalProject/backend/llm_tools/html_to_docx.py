from html2docx import HTML2Docx
import os

def convert_html_to_docx(html_content: str, output_path: str) -> bool:
    """
    Converts an HTML string to a .docx file using the html2docx library.

    Args:
        html_content: The HTML content as a string.
        output_path: The full path where the .docx file will be saved.

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

        parser = HTML2Docx()
        parser.add_html(html_content)
        parser.save(output_path)
        
        print(f"Successfully converted HTML to {output_path}")
        return True
    except Exception as e:
        print(f"An error occurred during DOCX conversion: {e}")
        return False

# Example Usage:
if __name__ == '__main__':
    sample_html = """
    <h1>This is a Test Heading</h1>
    <p>This is a test paragraph from your GigaChad agent.</p>
    <p>This text should be <b>bold</b> and this should be <i>italic</i>.</p>
    <ul>
        <li>List item 1</li>
        <li>List item 2</li>
    </ul>
    """
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
    test_output_path = os.path.join(desktop_path, "test_document_from_html2docx.docx")
    
    success = convert_html_to_docx(sample_html, test_output_path)
    
    if success:
        print(f"Test file created at: {test_output_path}")
    else:
        print("Test file creation failed.")
