import os
from pyhwpx import Hwp

def hwpx_to_pdf(hwp_path, pdf_path):
    hwpx = None
    try:
        hwpx = Hwp()
        hwpx.XHwpWindows.Item(0).Visible = False
        hwpx.Open(hwp_path, "")
        hwpx.SaveAs(pdf_path, "PDF", "")
        print(f"[SUCCESS] PDF 변환 완료: {pdf_path}")
    except Exception as e:
        print(f"[ERROR] 변환 실패: {e}")
        raise
    finally:
        if hwpx:
            hwpx.Quit()

if __name__ == "__main__":
    base_dir = r"C:\Users\jhwoo\Desktop\SKN_ws\project\SKN13-FINAL-1TEAM\한국방송광고진흥공사\내부문서"

    # 1. 변환 대상 .hwpx 파일 목록 수집
    hwpx_files = []
    for root, _, files in os.walk(base_dir):
        for file in files:
            if file.lower().endswith(".hwpx"):
                hwpx_files.append(os.path.join(root, file))

    total_files = len(hwpx_files)
    print(f"[INFO] 총 변환 대상: {total_files}개")

    # 2. 하나씩 변환하면서 진행률 표시
    for idx, hwpx_file in enumerate(hwpx_files, start=1):
        pdf_file = os.path.splitext(hwpx_file)[0] + ".pdf"
        print(f"[{idx}/{total_files}] 변환 중: {os.path.basename(hwpx_file)}")
        try:
            hwpx_to_pdf(hwpx_file, pdf_file)
        except Exception as e:
            print(f"[ERROR] 처리 중 오류 발생 '{hwpx_file}': {e}")
