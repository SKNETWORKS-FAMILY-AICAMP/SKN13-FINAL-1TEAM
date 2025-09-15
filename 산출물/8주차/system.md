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
            WORKFLOW["Routing Agent<br/>LangGraph 기반<br/>중앙 허브, 다음 단계 결정<br/>"]
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

    %% Styling
    classDef client fill:#e1f5fe,stroke:#333,stroke-width:2px
    classDef gateway fill:#f3e5f5,stroke:#333,stroke-width:2px
    classDef app fill:#e8f5e9,stroke:#333,stroke-width:2px
    classDef workflow fill:#fff9c4,stroke:#333,stroke-width:2px
    classDef data fill:#fff3e0,stroke:#333,stroke-width:2px
    classDef db fill:#f1f8e9,stroke:#333,stroke-width:2px

    %% CHAT/WORKFLOW 전용 스타일 정의
    classDef chatSpecial fill:#ff8a80,stroke:#d84315,stroke-width:2px,color:#fff

    class DESKTOP client
    class NGINX gateway
    class DOC_API app
    class CHAT_API chatSpecial
    class AUTH_API app
    class CAL_API app
    class USER_API app
    class WORKFLOW chatSpecial
    class DATA_SERVICE data
    class VECTOR_EMB data
    class S3_RAW db
    class S3_PROCESSED db
    class MYSQL db
    class CHROMADB db
```

---

## 🤖 AI 에이전트 워크플로우 상세

### 1. Multi-Step Workflow 아키텍처 (LangGraph 기반)

새로운 아키텍처는 **`MultiStepWorkflowGraph`** 를 중심으로 구성됩니다. 이 그래프는 단순한 의도 분류를 넘어, 여러 AI 에이전트를 순차적 또는 조건부로 실행하여 복잡한 작업을 해결합니다.

```mermaid
graph TD
    subgraph "API LAYER"
        CHAT_ROUTER["Chat Routes<br/>/api/v1/chat/*"]
    end

    subgraph "Router"
        ORCHESTRATOR["Routing Agent<br/>중앙 허브, 다음 단계 결정<br/>"]
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

    %% 코랄핑크 강조 스타일
    classDef chatSpecial fill:#ff8a80,stroke:#d84315,stroke-width:2px,color:#fff

    class CHAT_ROUTER chatSpecial
    class ORCHESTRATOR chatSpecial
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
    
    API->>+Orch: 5. 워크플로우 시작 (LangGraph)
    Orch->>Orch: 6. 3-tier 의도 분석 (→ next_agents: ["document_search"])

    Orch->>+Agent: 7. DocumentSearchAgent 실행
    Agent->>+V: 8. 관련 문서 벡터 검색 (ChromaDB)
    V-->>-Agent: 9. 검색 결과 반환
    Agent->>Agent: 10. 결과 요약 및 답변 생성 (RAG)
    Agent-->>-Tracker: 11. 작업 완료 보고 (workflow_step: SEARCH_COMPLETED)

    Tracker->>Tracker: 12. 상태 데이터 보존 & 완료 판단
    Tracker->>+Orch: 13. workflow_complete=True
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
    Orch->>Orch: 6. 3-tier 의도 분석 (→ next_agents: ["document_edit"])

    Orch->>+Agent: 7. DocumentEditorAgent 실행

    alt 간단한 텍스트 교체 (최적화)
        Agent->>Agent: 8a. 패턴 매칭 ("A를 B로 바꿔" 감지)
        Agent->>Agent: 8b. replace_text_in_document (LLM 호출 없음)
    else 복잡한 편집
        Agent->>Agent: 8c. LLM + Tools 호출 (edit_html_document)
    else 초안 작성
        Agent->>+S3: 8d. 참조 문서 검색 (S3)
        S3-->>-Agent: 8e. 문서 데이터 반환
        Agent->>Agent: 8f. DocumentDraftAgent 위임
    end

    Agent-->>-Tracker: 9. 작업 완료 보고 (workflow_step: EDIT_COMPLETED)

    Tracker->>Tracker: 10. 상태 데이터 보존 & 에디터 자동 열기 처리

    alt 에디터 자동 열기 (send_to_editor=True)
        Tracker-->>API: 11a. 문서편집창 IPC 신호 전송
        API-->>N: 11b. SSE 스트리밍
        N-->>C: 11c. 문서편집창 자동 열기 (Electron IPC)

        alt 대용량 문서 (>5KB)
            loop 4KB 청크로 분할 전송
                Tracker-->>API: 12a. 청크 데이터 (document_content_chunk)
                API-->>N: 12b. SSE 청크 스트리밍
                N-->>C: 12c. 청크 수신 및 재조립
            end
            Tracker-->>API: 13a. 전송 완료 (content_transfer_complete)
        else 일반 문서
            Tracker-->>API: 12d. 문서 내용 직접 전송
        end
    else 일반 응답
        Tracker-->>API: 11d. 텍스트 응답만 전송
    end

    Tracker->>+Orch: 14. workflow_complete=True
    Orch-->>-API: 15. 최종 완료

    API->>+DB: 16. AI 응답 저장
    DB-->>-API: 17. 저장 완료

    API-->>-N: 18. [DONE] 신호
    N-->>-C: 19. 스트림 종료
```

### 3. 새로운 워크플로우 구조

#### 3-1. 워크플로우 오케스트레이터 (실제 LangGraph 노드 구조)

```mermaid
graph TD
    A[사용자 요청 수신] --> B[Workflow Orchestrator<br/>• 3-tier 의도 분석<br/>• next_agents 결정<br/>• workflow_step 관리]

    B -->|business_rejection| E[BusinessRejectionAgent<br/>업무 외 요청 거부]
    B -->|document_search| F[DocumentSearchAgent<br/>RAG 기반 문서 검색]
    B -->|document_edit| G[DocumentEditorAgent<br/>TipTap 편집]
    B -->|document_draft| H[DocumentDraftAgent<br/>새 문서 초안 생성]
    B -->|needs_document| R[Document Requester<br/>프론트엔드 문서 요청]

    E --> I[Workflow Tracker<br/>• 상태 데이터 보존<br/>• 에디터 자동 열기 처리<br/>• 완료 판단]
    F --> I
    G --> I
    H --> I
    R --> B

    I --> J{워크플로우 완료?}
    J -->|continue<br/>next_agents 있음| B
    J -->|complete| K[최종 응답 반환]

    classDef orchestrationProcess fill:#fff9c4
    classDef agentProcess fill:#f3e5f5
    classDef trackerProcess fill:#ffeaa7
    classDef endProcess fill:#e8f5e8

    class A,B,R orchestrationProcess
    class E,F,G,H agentProcess
    class I trackerProcess
    class J,K endProcess
```

#### 3-2. DocumentSearchAgent (핵심 라우팅 구조)

```mermaid
graph TD
    A["검색 요청 수신"] --> B["쿼리 분석 & LLM 호출"]
    B --> C{도구 라우팅}

    C -->|enhanced_hybrid_search_tool| D["하이브리드 검색<br/>ChromaDB + 메타데이터"]
    C -->|RAG_search_tool| E["벡터 DB 검색"]
    C -->|expand_query_tool| F["쿼리 확장"]
    C -->|summarize_tool| G["결과 요약"]

    D --> H["검색 결과 처리"]
    E --> H
    F --> H
    G --> H

    H --> I{에디터 자동 열기?}
    I -->|Yes| J["문서 데이터 준비<br/>send_to_editor=True"]
    I -->|No| K["일반 검색 응답"]

    J --> L["Workflow Tracker"]
    K --> L

    classDef process fill:#e3f2fd
    classDef routing fill:#fff9c4
    classDef tools fill:#fff3e0
    classDef completion fill:#e8f5e8

    class A,B,H,L process
    class C,I routing
    class D,E,F,G tools
    class J,K completion
```

#### 3-3. DocumentEditorAgent (핵심 라우팅 구조)

```mermaid
graph TD
    A["편집 요청 수신"] --> B{편집 유형 분석}

    B -->|초안 작성| C["DocumentDraftAgent<br/>위임"]
    B -->|간단한 교체| D["패턴 매칭<br/>LLM 호출 없음"]
    B -->|복잡한 편집| E["LLM + Tools 호출"]

    E --> F{편집 도구 라우팅}
    F -->|run_document_edit| G["구조적 편집"]
    F -->|replace_text_in_document| H["텍스트 치환"]
    F -->|edit_html_document| I["HTML 편집"]

    G --> J["편집 결과 처리"]
    H --> J
    I --> J

    C --> K["Workflow Tracker"]
    D --> K
    J --> K

    classDef process fill:#e8f5e8
    classDef routing fill:#fff9c4
    classDef optimization fill:#e1f5fe
    classDef tools fill:#fff3e0

    class A,J,K process
    class B,F routing
    class D optimization
    class C,E,G,H,I tools
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