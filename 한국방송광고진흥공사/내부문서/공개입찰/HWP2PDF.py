import subprocess
import os
from pyhwpx import Hwp

def get_short_path_file(path):
    try:
        cmd = f'for %I in ("{path}") do @echo %~sI'
        result = subprocess.run(cmd, capture_output=True, text=True, shell=True)
        short_path = result.stdout.strip().strip('"')
        return short_path if short_path else path
    except Exception as e:
        print(f"[ERROR] Short path 변환 실패: {e}")
        return path

def hwp_to_pdf(hwp_path, pdf_path):
    hwp_path_short = get_short_path_file(hwp_path)
    pdf_path_short = get_short_path_file(pdf_path)

    hwp = None
    try:
        hwp = Hwp()
        #hwp.RegisterModule("FilePathCheckDLL", "SecurityModule")

        hwp.Open(hwp_path_short, "")
        hwp.SaveAs(pdf_path_short, "PDF", "")

        print(f"[SUCCESS] PDF 변환 완료: {pdf_path_short}")

    except Exception as e:
        print(f"[ERROR] 변환 실패: {e}")
        raise
    finally:
        if hwp:
            hwp.Quit()

if __name__ == "__main__":
    base_dir = r"C:\Users\Playdata\SKN13-FINAL-1TEAM\한국방송광고진흥공사\내부문서"
    for root, _, files in os.walk(base_dir):
        for file in files:
            if file.lower().endswith(".hwp"):
                hwp_file = os.path.join(root, file)
                pdf_file = os.path.splitext(hwp_file)[0] + ".pdf"
                try:
                    hwp_to_pdf(hwp_file, pdf_file)
                except Exception as e:
                    print(f"[ERROR] 처리 중 오류 발생 '{hwp_file}': {e}")

