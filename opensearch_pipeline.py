import csv
import pandas as pd
from opensearchpy import OpenSearch, helpers
from langchain_openai import OpenAIEmbeddings
import getpass
import os
from dotenv import load_dotenv
load_dotenv()

# --- 설정 ---
# OpenSearch 클라이언트 설정
OPENSEARCH_HOST = "localhost"
OPENSEARCH_PORT = 9200
OPENSEARCH_USER = "admin"
OPENSEARCH_PASSWORD = "admin123"
INDEX_NAME = "kobaco-rules-index"

# CSV 파일 경로
CSV_FILE_PATH = r"C:\Users\jhwoo\Desktop\SKN_ws\project\SKN13-FINAL-1TEAM\한국방송광고진흥공사\사내규정\all_parsed_output.csv"

def setup_opensearch_client():
    """OpenSearch 클라이언트를 설정하고 반환합니다."""
    return OpenSearch(
        hosts=[{'host': OPENSEARCH_HOST, 'port': OPENSEARCH_PORT}],
        http_auth=(OPENSEARCH_USER, OPENSEARCH_PASSWORD),
        use_ssl=False,
        verify_certs=False,
        ssl_assert_hostname=False,
        ssl_show_warn=False,
        timeout=30
    )

def create_index(client):
    """OpenSearch에 새로운 인덱스를 생성합니다. 기존 인덱스가 있다면 삭제합니다."""
    if client.indices.exists(index=INDEX_NAME):
        client.indices.delete(index=INDEX_NAME)
        print(f"기존 인덱스 '{INDEX_NAME}'를 삭제했습니다.")

    index_body = {
        "settings": {
            "index": {
                "knn": True,
                "knn.space_type": "cosinesimil"
            }
        },
        "mappings": {
            "properties": {
                "embedding": {
                    "type": "knn_vector",
                    "dimension": 3072,  # text-embedding-3-large 모델의 차원
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib"
                    }
                },
                "content": {"type": "text" },
                "filename": {"type": "keyword" },
                "last_modified": {"type": "date" },
                "chapter": {"type": "keyword" },
                "chapter_title": {"type": "text" },
                "article": {"type": "keyword" },
                "article_title": {"type": "text" }
            }
        }
    }
    client.indices.create(index=INDEX_NAME, body=index_body)
    print(f"새 인덱스 '{INDEX_NAME}'를 생성했습니다.")

def embed_and_index_data(client, embedding_model, batch_size=128):
    """CSV 파일에서 데이터를 읽어와 임베딩을 생성하고 OpenSearch에 대량으로 색인합니다."""
    try:
        df = pd.read_csv(CSV_FILE_PATH)
    except FileNotFoundError:
        print(f"오류: CSV 파일을 찾을 수 없습니다 - {CSV_FILE_PATH}")
        return

    df.dropna(subset=['content'], inplace=True)
    # NaN 값을 빈 문자열로 변환하여 JSON 에러 방지
    df.fillna(' ', inplace=True)

    if df.empty:
        print("오류: CSV 파일에 색인할 내용이 없습니다.")
        return

    total_docs = len(df)
    print(f"총 {total_docs}개의 문서를 처리합니다.")

    # 데이터를 작은 배치로 나누어 처리
    for start in range(0, total_docs, batch_size):
        end = min(start + batch_size, total_docs)
        batch_df = df.iloc[start:end]
        
        texts_to_embed = batch_df['content'].tolist()

        print(f"({start+1}-{end}/{total_docs}) 텍스트에 대한 임베딩을 생성합니다...")
        embeddings = embedding_model.embed_documents(texts_to_embed)
        print(f"({start+1}-{end}/{total_docs}) 임베딩 생성이 완료되었습니다.")

        actions = [
            {
                "_index": INDEX_NAME,
                "_source": {
                    "embedding": embedding,
                    "content": row['content'],
                    "filename": row['filename'],
                    "last_modified": row['last_modified'],
                    "chapter": row['chapter'],
                    "chapter_title": row['chapter_title'],
                    "article": row['article'],
                    "article_title": row['article_title']
                }
            }
            for (index, row), embedding in zip(batch_df.iterrows(), embeddings)
        ]

        print(f"({start+1}-{end}/{total_docs}) 문서를 색인합니다...")
        helpers.bulk(client, actions)
    
    print("모든 문서의 색인이 완료되었습니다.")

def search_documents(client, embedding_model, query: str, k: int = 5):
    """주어진 쿼리로 문서를 검색하고 결과를 출력합니다."""
    query_embedding = embedding_model.embed_query(query)

    search_body = {
        "size": k,
        "query": {
            "knn": {
                "embedding": {
                    "vector": query_embedding,
                    "k": k
                }
            }
        }
    }

    response = client.search(index=INDEX_NAME, body=search_body)

    print(f"\n'{query}'에 대한 검색 결과:")
    for hit in response['hits']['hits']:
        source = hit['_source']
        print(f"--- Score: {hit['_score']:.4f} ---")
        print(f"  파일명: {source['filename']}")
        print(f"  조항: {source.get('article', 'N/A')} ({source.get('article_title', 'N/A')})")
        print(f"  내용: {source['content'][:200]}...")
        print()

def main():
    """메인 실행 함수"""
    # OpenAI API 키 설정
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        try:
            api_key = getpass.getpass("OpenAI API Key를 입력하세요: ")
            if not api_key:
                print("오류: API 키가 입력되지 않았습니다. 스크립트를 종료합니다.")
                return
            os.environ["OPENAI_API_KEY"] = api_key
        except Exception as e:
            print(f"API 키를 읽는 중 오류 발생: {e}")
            return

    # 클라이언트 초기화
    client = setup_opensearch_client()

    # OpenSearch 서버 연결 확인
    if not client.ping():
        print("오류: OpenSearch 서버에 연결할 수 없습니다.")
        print("Docker 컨테이너가 실행 중인지 확인하세요. (힌트: docker-compose up -d)")
        return
        
    embedding_model = OpenAIEmbeddings(model="text-embedding-3-large")

    # 파이프라인 실행
    create_index(client)
    embed_and_index_data(client, embedding_model)
    
    # 테스트 검색
    while True:
        user_query = input(">>> 쿼리를 입력하세요: ")
        if user_query=="!quit":
            break
        search_documents(client,embedding_model,query=user_query)
        # search_documents(client, embedding_model, query="휴가 규정이 어떻게 돼?")
        # search_documents(client, embedding_model, query="계약직 연봉은 어떻게 결정돼?")


if __name__ == "__main__":
    main()