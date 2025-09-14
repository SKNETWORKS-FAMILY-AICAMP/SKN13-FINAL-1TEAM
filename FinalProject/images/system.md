# CLIKCA 시스템 아키텍처

## 📋 개요

본 문서는 CLIKCA 시스템의 전체 아키텍처, 새로 도입된 **다단계 AI 워크플로우(Multi-Step AI Workflow)**, 각 구성 요소 간의 상호작용, 데이터 흐름, 그리고 기술 스택을 상세히 기술한 시스템 구성도입니다. 주요 목표는 복잡한 사용자 요청을 지능적으로 분석하고, 여러 AI 에이전트를 체계적으로 오케스트레이션하여 `검색 → 분석 → 편집`과 같은 다단계 작업을 자동으로 처리하는 것입니다.

---

## 🏗️ 전체 시스템 아키텍처

### 1. 시스템 구성도

```mermaid
graph TB
    %% CLIENT LAYER
    subgraph "CLIENT LAYER"
        DESKTOP["Desktop App<br/>Electron + React<br/>설치형 배포"]
    end

    %% GATEWAY LAYER
    subgraph "GATEWAY LAYER"
        NGINX["Nginx<br/>Reverse Proxy"]
    end

    %% APPLICATION LAYER
    subgraph "APPLICATION LAYER"
        subgraph "FastAPI Backend"
            DOC_API["Document Routes<br/>/api/v1/files/*"]
            CHAT_API["Chat Routes<br/>/api/v1/chat/*"]
            AUTH_API["Auth Routes<br/>/api/v1/auth/*"]
            CAL_API["Calendar Routes<br/>/api/v1/calendar/*"]
            USER_API["User Routes<br/>/api/v1/users/*"]
        end
        
        subgraph "AI Agent Workflow (LangGraph)"
            WORKFLOW["Workflow orchestration<br/>LangGraph 기반<br/>작업 오케스트레이션"]
        end
    end

    %% DATA PROCESSING LAYER
    subgraph "DATA PROCESSING LAYER"
        DATA_SERVICE["Data Processing Service<br/>PDF/HWP → Markdown"]
        VECTOR_EMB["Vector Embedder<br/>OpenAI text-embedding-3-large"]
    end

    %% DATABASE & STORAGE LAYER
    subgraph "DATABASE & STORAGE LAYER"
        subgraph "AWS S3"
            S3_RAW["Raw Files<br/>/uploads/<br/>PDF, HWP"]
            S3_PROCESSED["Processed Files<br/>/processed/<br/>Markdown"]
        end

        MYSQL["(MySQL 8.0<br/>Primary DB<br/>- 사용자 정보, 채팅 기록<br/>- 파일 메타데이터, 일정)"]
        
        CHROMADB["(ChromaDB 0.5+<br/>Vector DB<br/>- 문서 벡터, 메타데이터)"]
    end

    %% Flow
    DESKTOP --> NGINX
    NGINX --> DOC_API
    NGINX --> CHAT_API
    NGINX --> AUTH_API
    NGINX --> CAL_API
    NGINX --> USER_API

    CHAT_API --> WORKFLOW

    DOC_API --> DATA_SERVICE
    DATA_SERVICE --> S3_PROCESSED
    DATA_SERVICE --> VECTOR_EMB
    VECTOR_EMB --> CHROMADB

    AUTH_API & CHAT_API & DOC_API & CAL_API & USER_API --> MYSQL
    DOC_API --> S3_RAW
    WORKFLOW --> CHROMADB
    WORKFLOW --> MYSQL
    WORKFLOW --> S3_PROCESSED

    %% Styling
    classDef client fill:#e1f5fe,stroke:#333,stroke-width:2px
    classDef gateway fill:#f3e5f5,stroke:#333,stroke-width:2px
    classDef app fill:#e8f5e9,stroke:#333,stroke-width:2px
    classDef workflow fill:#fff9c4,stroke:#333,stroke-width:2px
    classDef data fill:#fff3e0,stroke:#333,stroke-width:2px
    classDef db fill:#f1f8e9,stroke:#333,stroke-width:2px

    class DESKTOP client
    class NGINX gateway
    class DOC_API app
    class CHAT_API app
    class AUTH_API app
    class CAL_API app
    class USER_API app
    class WORKFLOW workflow
    class DATA_SERVICE data
    class VECTOR_EMB data
    class S3_RAW db
    class S3_PROCESSED db
    class MYSQL db
    class CHROMADB db
```

### 2. 기술 스택 및 버전 (현재 구현)

| 구분 | 기술 | 버전 | 목적 |
|---|---|---|---|
| **Frontend** | React | 18.2.0 | UI/UX 구축 |
| | Electron | 31.0.2 | 데스크톱 앱 패키징 |
| | Vite | 5.0+ | 개발 서버 및 빌드 도구 |
| **Backend** | FastAPI | 0.111.0+ | API 서버 구축 |
| | Python | 3.11+ | 주력 개발 언어 |
| | Uvicorn | - | ASGI 서버 |
| **AI/LLM** | LangChain | 0.2.5+ | AI 에이전트 및 도구 개발 |
| | LangGraph | 0.0.65+ | 다단계 워크플로우 관리 |
| | OpenAI API | GPT-4o | 핵심 LLM 모델 |
| | text-embedding-3-large | - | 문서 벡터 임베딩 |
| **Database** | MySQL | 8.0 | RDB (사용자, 채팅, 메타데이터) |
| | ChromaDB | 0.5.0+ | Vector DB (문서 임베딩 저장) |
| | SQLAlchemy | 2.0+ | Python ORM |
| **Storage** | AWS S3 | - | 파일 스토리지 (원본, 처리 데이터) |
| | boto3 | 1.34+ | AWS SDK for Python |
| **Communication** | Server-Sent Events (SSE) | - | 실시간 스트리밍 |
| | IPC (Inter-Process Communication) | - | Electron 메인-렌더러 통신 |
| **Security** | JWT | - | 사용자 인증 토큰 |
| | bcrypt | - | 패스워드 해싱 |
| **Development** | Docker | 26.1.3+ | 컨테이너화 및 배포 |
| | Nginx | 1.25.3+ | 리버스 프록시 (운영 환경) |

---

## 🤖 AI 에이전트 워크플로우 상세

### 1. Multi-Step Workflow 아키텍처 (LangGraph 기반)

새로운 아키텍처는 **`MultiStepWorkflowGraph`** 를 중심으로 구성됩니다. 이 그래프는 단순한 의도 분류를 넘어, 여러 AI 에이전트를 순차적 또는 조건부로 실행하여 복잡한 작업을 해결합니다.

```mermaid
graph TD
    subgraph "API LAYER"
        CHAT_ROUTER["Chat Routes<br/>/api/v1/chat/*"]
    end

    subgraph "WORKFLOW ORCHESTRATION (LangGraph)"
        ORCHESTRATOR["Workflow Orchestrator<br/>중앙 허브, 다음 단계 결정<br/>(RoutingAgent)"]
        WORKFLOW_TRACKER["Workflow Tracker<br/>에이전트 실행 후 상태 추적<br/>(Continue/Complete)"]
    end

    subgraph "SPECIALIZED AGENT LAYER"
        DOC_SEARCH["DocumentSearchAgent<br/>RAG 기반 문서 검색 및 요약"]
        DOC_EDIT["DocumentEditorAgent<br/>TipTap 호환 문서 편집"]
        BIZ_REJECT["BusinessRejectionAgent<br/>업무 외 요청 거부"]
    end

    subgraph "TOOLS LAYER (LangChain Tools)"
        SEARCH_TOOLS["Enhanced Search Tools<br/>하이브리드 검색, 쿼리 확장, 요약"]
        EDITOR_TOOLS["Comprehensive Editor Tools<br/>HTML 편집, 템플릿, 스타일링"]
    end

    subgraph "DATA & STORAGE LAYER"
        CHROMADB["(ChromaDB)"]
        MYSQL["(MySQL)"]
        S3["(AWS S3)"]
    end

    %% Connections
    CHAT_ROUTER --> ORCHESTRATOR

    ORCHESTRATOR -- "다음 에이전트 실행" --> DOC_SEARCH
    ORCHESTRATOR -- "다음 에이전트 실행" --> DOC_EDIT
    ORCHESTRATOR -- "업무 외" --> BIZ_REJECT
    ORCHESTRATOR -- "워크플로우 관리" --> WORKFLOW_TRACKER

    DOC_SEARCH --> WORKFLOW_TRACKER
    DOC_EDIT --> WORKFLOW_TRACKER
    BIZ_REJECT --> WORKFLOW_TRACKER

    WORKFLOW_TRACKER -- "작업 계속" --> ORCHESTRATOR
    WORKFLOW_TRACKER -- "작업 완료" --> END

    DOC_SEARCH --> SEARCH_TOOLS
    DOC_EDIT --> EDITOR_TOOLS

    SEARCH_TOOLS --> CHROMADB
    SEARCH_TOOLS --> S3
    EDITOR_TOOLS --> S3

    DOC_SEARCH & DOC_EDIT & BIZ_REJECT --> MYSQL

    %% Styling
    classDef api fill:#e8f5e9,stroke:#333
    classDef orchestrator fill:#fff9c4,stroke:#333
    classDef agent fill:#f3e5f5,stroke:#333
    classDef tool fill:#fff3e0,stroke:#333
    classDef data fill:#f1f8e9,stroke:#333

    class CHAT_ROUTER api
    class ORCHESTRATOR orchestrator
    class WORKFLOW_TRACKER orchestrator
    class DOC_SEARCH agent
    class DOC_EDIT agent
    class BIZ_REJECT agent
    class SEARCH_TOOLS tool
    class EDITOR_TOOLS tool
    class CHROMADB data
    class MYSQL data
    class S3 data
```

### 2. Sequence Diagram

#### 2.1. 문서 처리 및 인증

```mermaid
sequenceDiagram
    participant C as Desktop App<br/>(Electron)
    participant N as Nginx
    participant API as FastAPI
    participant DB as MySQL
    participant V as ChromaDB
    participant S3 as AWS S3

    Note over C,S3: 📄 문서 업로드 및 처리 플로우
    
    C->>+N: 1. 업로드 URL 요청
    N->>+API: 2. 요청 전달 (/api/v1/files/upload-url)
    API->>+S3: 3. Presigned URL 생성
    S3-->>-API: 4. 업로드 URL 반환
    API-->>-N: 5. 업로드 URL 응답
    N-->>-C: 6. URL 전달
    
    C->>+S3: 7. 파일 직접 업로드
    S3-->>-C: 8. 업로드 완료
    
    C->>+N: 9. 파일 메타데이터 저장
    N->>+API: 10. 요청 전달 (/api/v1/files)
    API->>+DB: 11. 파일 정보 저장
    DB-->>-API: 12. 저장 완료
    API-->>-N: 13. 처리 완료 응답
    N-->>-C: 14. 완료 알림
    
    Note over API,S3: 📊 백그라운드 문서 처리 (PDF/HWP → MD → Vector)
    API->>+S3: 15. 원본 파일 다운로드
    S3-->>-API: 16. 파일 데이터
    API->>API: 17. Markdown 변환
    API->>+S3: 18. 처리된 MD 파일 업로드
    S3-->>-API: 19. 업로드 완료
    API->>API: 20. 텍스트 임베딩 생성 (OpenAI)
    API->>+V: 21. 벡터 데이터 저장
    V-->>-API: 22. 인덱싱 완료

    Note over C,DB: 🔐 사용자 인증 플로우
    
    C->>+N: 23. 로그인 요청
    N->>+API: 24. 요청 전달 (/api/v1/auth/login)
    API->>+DB: 25. 사용자 인증 확인
    DB-->>-API: 26. 인증 결과
    API->>API: 27. JWT 토큰 생성
    API-->>-N: 28. 토큰 응답
    N-->>-C: 29. 토큰 전달
```

#### 2.2. AI 채팅 (문서 검색 예시)

```mermaid
sequenceDiagram
    participant C as Desktop App
    participant N as Nginx
    participant API as FastAPI
    participant Orch as Workflow Orchestrator
    participant Agent as Specialized Agent
    participant Tracker as Workflow Tracker
    participant DB as MySQL
    participant V as ChromaDB

    Note over C,V: 💬 AI 채팅 워크플로우 (문서 검색 예시)

    C->>+N: 1. 채팅 메시지 전송
    N->>+API: 2. 요청 전달 (/api/v1/chat)
    
    API->>+DB: 3. 사용자 메시지 저장
    DB-->>-API: 4. 저장 완료
    
    API->>+Orch: 5. 워크플로우 시작
    Orch->>Orch: 6. 의도 분석 (→ 'document_search')
    
    Orch->>+Agent: 7. DocumentSearchAgent 실행
    Agent->>+V: 8. 관련 문서 벡터 검색
    V-->>-Agent: 9. 검색 결과 반환
    Agent->>Agent: 10. 결과 요약 및 답변 생성 (RAG)
    Agent-->>-Tracker: 11. 작업 완료 보고

    Tracker->>+Orch: 12. 다음 단계 확인
    Orch->>Orch: 13. 추가 작업 없음 확인
    Orch-->>-API: 14. 최종 답변 반환

    API->>+DB: 15. AI 응답 저장
    DB-->>-API: 16. 저장 완료

    API-->>-N: 17. 스트리밍 응답
    N-->>-C: 18. 실시간 응답 전송
```

#### 2.3. AI 채팅 (문서 편집 예시)

```mermaid
sequenceDiagram
    participant C as Desktop App<br/>(Electron)
    participant N as Nginx
    participant API as FastAPI
    participant Orch as Workflow Orchestrator<br/>(RoutingAgent)
    participant Agent as DocumentEditorAgent
    participant Tracker as Workflow Tracker
    participant DB as MySQL
    participant S3 as AWS S3

    Note over C,S3: ✍️ AI 채팅 워크플로우 (문서 편집 - 청크 전송)

    C->>+N: 1. 편집 요청 ("우편번호를 전화번호로 바꿔줘")
    N->>+API: 2. 요청 전달 (/api/v1/chat/stream)

    API->>+DB: 3. 사용자 메시지 저장
    DB-->>-API: 4. 저장 완료

    API->>+Orch: 5. 워크플로우 시작 (LangGraph)
    Orch->>Orch: 6. 의도 분석 (→ WorkflowStep.EDIT_REQUESTED)

    Orch->>+Agent: 7. DocumentEditorAgent 실행

    alt 간단한 텍스트 교체
        Agent->>Agent: 8a. 패턴 매칭 ("A를 B로 바꿔")
        Agent->>Agent: 8b. 직접 텍스트 교체 (LLM 호출 없음)
    else 복잡한 편집 또는 초안 작성
        Agent->>+S3: 8c. 참조 문서 검색 (초안 작성시)
        S3-->>-Agent: 8d. 문서 데이터 반환
        Agent->>Agent: 8e. LLM + Tools 사용한 편집
    end

    Agent-->>-Tracker: 9. 작업 완료 보고 + 편집된 문서

    Tracker->>Tracker: 10. 대용량 문서 확인 (>5KB)

    alt 대용량 문서 (청크 전송)
        Tracker-->>API: 11a. 메타데이터 전송 (open_document_in_editor_chunked)
        API-->>N: 11b. SSE 스트리밍
        N-->>C: 11c. 메타데이터 수신

        loop 청크 전송
            Tracker-->>API: 12a. 문서 청크 전송 (4KB 단위)
            API-->>N: 12b. SSE 스트리밍
            N-->>C: 12c. 청크 수신 & 재조립
        end

        C->>C: 13. 문서 완전 재조립
    else 소용량 문서
        Tracker-->>API: 11d. 일반 전송 (open_document_in_editor)
        API-->>N: 11e. SSE 스트리밍
        N-->>C: 11f. 문서 직접 수신
    end

    C->>C: 14. IPC 통신으로 문서편집창 자동 열기

    API->>+DB: 15. AI 응답 저장
    DB-->>-API: 16. 저장 완료

    API-->>-N: 17. [DONE] 신호
    N-->>-C: 18. 스트림 종료
```

### 3. 새로운 워크플로우 구조

#### 3-1. 워크플로우 오케스트레이터

```mermaid
graph TD
    A[사용자 요청 수신] --> B[Workflow Orchestrator<br/>워크플로우 시작]
    B --> C[Intent Analyzer<br/>3-tier 의도 분석]
    C --> D{의도 분석 결과}
    
    D -->|업무 외 요청| E[Business Rejection Agent<br/>친근한 거부 메시지]
    D -->|문서 검색| F[Document Search Agent<br/>검색 프로세스]
    D -->|문서 편집| G[Document Editor Agent<br/>편집 프로세스]
    D -->|다단계 작업| H[Multi-Step Workflow<br/>검색 → 편집]
    
    E --> I[Workflow Tracker<br/>완료 확인]
    F --> I
    G --> I
    H --> I
    
    I --> J{워크플로우 완료?}
    J -->|아니오| B
    J -->|예| K[최종 응답 반환]

    classDef orchestrationProcess fill:#fff9c4
    classDef agentProcess fill:#f3e5f5
    classDef decisionProcess fill:#ffeaa7

    class A,B,C,I,J,K orchestrationProcess
    class E,F,G,H agentProcess
    class D decisionProcess
```

#### 3-2. DocumentSearchAgent

```mermaid
graph TD
    A[검색 요청 수신] --> B{문서 필요 여부}
    B -->|필요| C[Document Requester<br/>프론트엔드 문서 요청]
    B -->|불필요| D[Route Query Tool<br/>후속/신규 질문 판단]
    
    C --> D
    D --> E[Enhanced Hybrid Search<br/>우선순위 검색 도구]
    E --> F[Query Expansion<br/>검색어 확장]
    F --> G[ChromaDB 벡터 검색]
    G --> H[검색 결과 획득]
    H --> I[Summarization Tool<br/>결과 요약 및 답변 생성]
    I --> J{다운로드 요청?}
    J -->|Yes| K[Presigned URL Tool<br/>S3 다운로드 링크]
    J -->|No| L[Handle Follow Up<br/>후속 질문 처리]
    K --> L
    L --> M[최종 답변 반환]

    classDef searchProcess fill:#e3f2fd
    classDef toolProcess fill:#fff9c4
    classDef dataProcess fill:#fce4ec

    class A,H,M searchProcess
    class B,C,D,E,F,I,J,K,L toolProcess
    class G dataProcess
```

#### 3-3. DocumentEditorAgent

```mermaid
graph TD
    A[편집 요청 수신] --> B{초안 작성 요청?}
    B -->|Yes| C[Draft Creation Workflow<br/>참조 문서 분석 → 2025 문서 생성]
    B -->|No| D{간단한 텍스트 교체?}

    D -->|Yes| E[Simple Text Replacement<br/>A를 B로 바꿔 패턴 매칭<br/>LLM 호출 없이 즉시 처리]
    D -->|No| F[복잡한 편집 요청<br/>LLM + Tools 사용]

    C --> G[Reference Documents Analysis<br/>S3에서 문서 검색/분석]
    G --> H[2025 Document Generation<br/>분석 결과 기반 새 문서 생성]

    F --> I{편집 도구 선택}
    I -->|구조적 편집| J[run_document_edit<br/>메인 편집 도구]
    I -->|텍스트 교체| K[replace_text_in_document<br/>단순 텍스트 치환]
    I -->|템플릿 생성| L[Document Templates<br/>보고서/회의록/구조]
    I -->|스타일링| M[Advanced Tools<br/>리스트/테이블/인용문/스타일]

    E --> N[편집 완료]
    H --> O[청크 전송<br/>대용량 문서 분할 전송]
    J --> N
    K --> N
    L --> N
    M --> N

    O --> P[문서편집창 자동 열기<br/>IPC 통신]
    N --> Q[문서 업데이트<br/>SSE 스트리밍]
    P --> R[최종 완료]
    Q --> R

    classDef editProcess fill:#e8f5e8
    classDef toolProcess fill:#fff9c4
    classDef optimizedProcess fill:#e1f5fe
    classDef draftProcess fill:#fff3e0

    class A,B,D,N,Q,R editProcess
    class I,J,K,L,M toolProcess
    class E optimizedProcess
    class C,G,H,O,P draftProcess
```
---

### 4. 주요 변경사항 및 특징 (2025년 현재 구현)

- **비활성화된 에이전트**:
  - `GeneralChatAgent`: 업무와 무관한 대화는 `BusinessRejectionAgent`가 처리하도록 통합하여 시스템의 전문성을 강화했습니다.
  - `DocumentSelectionAgent`: 프론트엔드에서 사용자가 직접 문서를 선택하는 방식으로 UX가 변경됨에 따라, 백엔드에서의 선택 에이전트는 불필요해졌습니다.

- **핵심 컴포넌트**:
  - **Workflow Orchestrator**: `RoutingAgent`를 기반으로 하며, 전체 워크플로우의 두뇌 역할을 합니다. 사용자 요청을 분석하여 필요한 에이전트들의 실행 순서를 결정하고, `Workflow Tracker`와 상호작용하며 작업 흐름을 제어합니다.
  - **Workflow Tracker**: 각 에이전트의 실행이 끝난 후, 워크플로우가 계속 진행되어야 하는지(`continue`), 아니면 모든 작업이 완료되었는지(`complete`)를 판단하여 오케스트레이터에게 피드백을 제공합니다.

- **최적화된 DocumentEditorAgent**:
  - **간단한 텍스트 교체 최적화**: "A를 B로 바꿔줘" 패턴을 regex로 감지하여 LLM 호출 없이 즉시 처리
  - **초안 작성 기능**: S3의 참조 문서들을 분석하여 새로운 연도 문서 자동 생성
  - **Strategy Pattern 도구 구조**: 1061줄 스파게티 코드를 전략 패턴으로 리팩토링하여 유지보수성 향상

- **대용량 문서 전송 시스템**:
  - **청크 기반 SSE 전송**: 5KB 이상 문서를 4KB 단위로 분할하여 안전한 전송
  - **JSON 파싱 오류 해결**: 대용량 JSON 데이터의 SSE 전송 시 발생하는 파싱 오류 완전 해결
  - **문서 자동 재조립**: 프론트엔드에서 청크들을 자동으로 재조립하여 완전한 문서 복원

- **IPC 통신 강화**:
  - **문서편집창 자동 열기**: 백엔드에서 편집 완료 시 Electron IPC를 통해 자동으로 문서편집창 열기
  - **실시간 문서 업데이트**: SSE를 통한 실시간 문서 내용 업데이트 및 동기화

- **상태 관리 (`AgentState`)**: LangGraph의 `StateGraph`를 통해 워크플로우의 모든 상태(사용자 입력, 현재 문서, 대화 기록, 다음 실행할 에이전트 목록 등)가 중앙에서 관리되어 데이터 흐름의 일관성을 보장합니다.

- **에러 처리 개선**:
  - **re 모듈 import 문제**: 모든 에이전트에서 regex 사용 시 발생하는 import 오류 완전 해결
  - **포괄적 예외 처리**: 각 단계별 상세한 에러 로깅 및 사용자 친화적 오류 메시지

---

## 📄 엔드포인트 및 서비스 기능

| 라우터 | 엔드포인트 | HTTP 메소드 | 주요 기능 |
|---|---|---|---|
| **Auth** | `/api/v1/auth/login` | POST | 사용자 로그인 및 JWT 토큰 발급 |
| | `/api/v1/auth/signup` | POST | 회원가입 |
| **Users** | `/api/v1/users/me` | GET | 현재 사용자 정보 조회 |
| **Files** | `/api/v1/files/upload-url` | GET | AWS S3 Presigned URL 생성 (파일 업로드용) |
| | `/api/v1/files/` | GET | 업로드된 파일 목록 조회 |
| | `/api/v1/files/{file_id}` | GET | 특정 파일 정보 및 내용 조회 |
| **Chat** | `/api/v1/chat/` | POST | AI 에이전트 워크플로우 시작 및 채팅 응답 (스트리밍) |
| **Calendar**| `/api/v1/calendar/events` | GET, POST | 캘린더 이벤트 조회 및 생성 |