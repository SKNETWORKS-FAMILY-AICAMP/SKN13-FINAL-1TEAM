import os
import re
import json
import pandas as pd
from typing import List, Dict
from collections import defaultdict
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

BASE_DIR = r"C:\Users\jhwoo\Desktop\SKN_ws\project\SKN13-FINAL-1TEAM"
SUBFOLDERS = ["사내규정"]
CSV_FILE = r"C:\Users\jhwoo\Desktop\SKN_ws\project\SKN13-FINAL-1TEAM\사내규정.csv"

def collect_csv_files(base_dir, subfolders):
    csvs = []
    for sub in subfolders:
        sub_path = os.path.join(base_dir, sub)
        for root, _, files in os.walk(sub_path):
            for f in files:
                if f.lower().endswith(".csv"):
                    csvs.append(os.path.join(root, f))
    return csvs

def clean_text(text: str) -> str:
    text = re.sub(r'-\s*\d+\s*-', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def build_graph_from_csv(df: pd.DataFrame, title: str) -> Dict[str, Dict[str, List[str]]]:
    # CSV용 그래프 구조는 데이터셋 특성에 따라 달라짐
    # 예: 특정 컬럼 기준으로 계층화 가능
    graph = defaultdict(list)
    # 임시 예시로 "장"과 "조"라는 컬럼 있다고 가정
    if "제 O장" in df.columns and "제 O조" in df.columns:
        for _, row in df.iterrows():
            chapter = row["제 O장"]
            article = row["제 O조"]
            graph[chapter].append(article)
    return {title: dict(graph)}

def main():
    # splitter 세팅 먼저 해
    splitter = RecursiveCharacterTextSplitter(chunk_size=300, chunk_overlap=50)

    # csv_files = collect_csv_files(BASE_DIR, SUBFOLDERS)
    csv_files = [CSV_FILE]
    print(f"총 {len(csv_files)}개의 CSV 파일을 찾았습니다.")

    all_chunks: List[Document] = []
    document_graphs = {}

    for path in csv_files:
        df = pd.read_csv(path)
        title = os.path.basename(path).replace(".csv", "")
        document_graphs.update(build_graph_from_csv(df, title))

        for _, row in df.iterrows():
            text = " ".join(str(row[col]) for col in df.columns if col != "제 O장" and col != "제 O조")
            text = clean_text(text)
            metadata = {
                "source": os.path.basename(path),
                "title": title,
                "category": os.path.basename(os.path.dirname(path))
            }
            doc = Document(page_content=text, metadata=metadata)

            # 🔥 여기서 splitter로 자른다
            chunks = splitter.split_documents([doc])
            all_chunks.extend(chunks)

    embedding = OpenAIEmbeddings(model="text-embedding-3-large")
    vectorstore = Chroma.from_documents(
        documents=all_chunks,
        embedding=embedding,
        persist_directory="./chroma/kobaco_csv"
    )
    # vectorstore.persist()
    print("✅ CSV 기반 ChromaDB에 벡터 저장 완료")

    with open("kobaco_csv_graph.json", "w", encoding="utf-8") as f:
        json.dump(document_graphs, f, ensure_ascii=False, indent=2)
    print("✅ CSV 문서 구조 그래프 저장 완료")

if __name__ == "__main__":
    main()
