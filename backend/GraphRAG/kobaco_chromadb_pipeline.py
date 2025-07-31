
import os
import re
import json
from typing import List, Dict
from collections import defaultdict
from langchain.document_loaders import PyMuPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import Chroma

BASE_DIR = "../../한국방송광고진흥공사"  # 실제 상대경로로 수정
SUBFOLDERS = ["사내규정", "내부문서", "법령", "관계법령"]

def collect_pdf_files(base_dir, subfolders):
    pdfs = []
    for sub in subfolders:
        sub_path = os.path.join(base_dir, sub)
        for root, _, files in os.walk(sub_path):
            for f in files:
                if f.endswith(".pdf"):
                    pdfs.append(os.path.join(root, f))
    return pdfs

def clean_text(text: str) -> str:
    text = re.sub(r'-\s*\d+\s*-', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_metadata_from_filename(filename: str):
    base = os.path.basename(filename)
    match = re.match(r'(.+?)\((\d{4}년도 \d{1,2}월 .+?)\)\.pdf', base)
    if match:
        title, version = match.groups()
        return title.strip(), version.strip()
    return base, "unknown"

def build_graph_from_text(text: str, title: str) -> Dict[str, Dict[str, List[str]]]:
    graph = defaultdict(list)
    current_chapter = None
    for line in text.splitlines():
        line = line.strip()
        chapter_match = re.match(r'(제\d+장)\s*(.+)?', line)
        if chapter_match:
            current_chapter = f"{chapter_match.group(1)} {chapter_match.group(2) or ''}".strip()
            continue
        article_match = re.match(r'(제\d+조)(\(.+?\))?', line)
        if article_match and current_chapter:
            article = f"{article_match.group(1)}{article_match.group(2) or ''}"
            graph[current_chapter].append(article)
    return {title: dict(graph)}

def main():
    pdf_files = collect_pdf_files(BASE_DIR, SUBFOLDERS)
    print(f"총 {len(pdf_files)}개의 PDF 파일을 찾았습니다.")

    all_chunks: List[Document] = []
    document_graphs = {}

    for path in pdf_files:
        loader = PyMuPDFLoader(path)
        documents = loader.load()

        full_text = "\n".join([doc.page_content for doc in documents])
        title, version = extract_metadata_from_filename(path)
        document_graphs.update(build_graph_from_text(full_text, title))

        for doc in documents:
            doc.page_content = clean_text(doc.page_content)

        splitter = RecursiveCharacterTextSplitter(chunk_size=700, chunk_overlap=100)
        chunks = splitter.split_documents(documents)

        for chunk in chunks:
            chunk.metadata.update({
                "source": os.path.basename(path),
                "title": title,
                "version": version,
                "category": os.path.basename(os.path.dirname(path))
            })

        all_chunks.extend(chunks)

    embedding = OpenAIEmbeddings()
    vectorstore = Chroma.from_documents(
        documents=all_chunks,
        embedding=embedding,
        persist_directory="./chroma/kobaco"
    )
    vectorstore.persist()
    print("✅ ChromaDB에 벡터 저장 완료")

    with open("kobaco_graph.json", "w", encoding="utf-8") as f:
        json.dump(document_graphs, f, ensure_ascii=False, indent=2)
    print("✅ 문서 구조 그래프 저장 완료")

if __name__ == "__main__":
    main()
