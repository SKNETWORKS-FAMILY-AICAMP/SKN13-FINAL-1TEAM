import os
from pyhwpx import Hwp

def hwp_to_pdf(hwp_path, pdf_path):
    hwp = None
    try:
        hwp = Hwp()
        #hwp.RegisterModule("FilePathCheckDLL", "SecurityModule")

        hwp.Open(hwp_path, "")
        hwp.SaveAs(pdf_path, "PDF", "")

        print(f"[SUCCESS] PDF 변환 완료: {pdf_path}")

    except Exception as e:
        print(f"[ERROR] 변환 실패: {e}")
        raise
    finally:
        if hwp:
            hwp.Quit()

if __name__ == "__main__":
    base_dir = r"C:\Users\jhwoo\Desktop\SKN_ws\project\SKN13-FINAL-1TEAM\한국방송광고진흥공사\내부문서"
    for root, _, files in os.walk(base_dir):
        for file in files:
            if file.lower().endswith(".hwp"):
                hwp_file = os.path.join(root, file)
                pdf_file = os.path.splitext(hwp_file)[0] + ".pdf"
                try:
                    hwp_to_pdf(hwp_file, pdf_file)
                except Exception as e:
                    print(f"[ERROR] 처리 중 오류 발생 '{hwp_file}': {e}")