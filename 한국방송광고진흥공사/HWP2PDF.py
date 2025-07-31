import os
from pyhwpx import Hwp

def hwp_to_pdf(hwp_path, pdf_path):
    hwp = None
    try:
        hwp = Hwp()
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
    base_dir = r"C:\Users\Playdata\SKN13-FINAL-1TEAM\한국방송광고진흥공사\내부문서"

    # 1. 변환 대상 .hwp 파일 목록 수집
    hwp_files = []
    for root, _, files in os.walk(base_dir):
        for file in files:
            if file.lower().endswith(".hwp"):
                hwp_files.append(os.path.join(root, file))

    total_files = len(hwp_files)
    print(f"[INFO] 총 변환 대상: {total_files}개")

    # 2. 하나씩 변환하면서 진행률 표시
    for idx, hwp_file in enumerate(hwp_files, start=1):
        pdf_file = os.path.splitext(hwp_file)[0] + ".pdf"
        print(f"[{idx}/{total_files}] 변환 중: {os.path.basename(hwp_file)}")
        try:
            hwp_to_pdf(hwp_file, pdf_file)
        except Exception as e:
            print(f"[ERROR] 처리 중 오류 발생 '{hwp_file}': {e}")
