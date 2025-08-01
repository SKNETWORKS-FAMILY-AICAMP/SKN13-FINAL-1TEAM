# [최종 명세서] 멀티테넌트, RAG, 및 세분화된 접근 제어를 위한 종합 시스템 설계

## 1. 프로젝트 목표 및 핵심 설계 원칙

### 1.1. 프로젝트 목표

이 프로젝트의 목표는 여러 회사(테넌트)가 각자의 독립된 환경에서 자체 데이터를 기반으로 LLM(거대 언어 모델) 서비스를 사용할 수 있는 **멀티테넌트 SaaS(서비스형 소프트웨어)**를 구축하는 것입니다. 사용자는 파일을 업로드하여 자신들만의 지식 베이스를 구축하고, LLM 에이전트는 이 지식 베이스를 참조하여 질문에 답변해야 합니다.

### 1.2. 핵심 설계 원칙

1.  **완벽한 데이터 격리 (Data Isolation)**: 한 회사(워크스페이스)의 데이터는 다른 회사로부터 완벽하게 격리되어야 합니다. 이는 파일 시스템, 데이터베이스, 그리고 벡터 DB(ChromaDB)를 포함한 모든 계층에서 보장되어야 합니다.

2.  **세분화된 접근 제어 (Fine-Grained Access Control)**: 시스템은 단순히 사용자를 구분하는 것을 넘어, 워크스페이스 내에서 사용자의 역할(Role)에 따라, 심지어는 사용자 개개인별로 특정 문서나 기능(도구)에 대한 접근 권한을 다르게 설정할 수 있어야 합니다.

3.  **확장성 및 유지보수성 (Scalability & Maintainability)**: Django의 설계 철학을 따라 기능을 명확한 앱(App) 단위로 분리하고, 데이터베이스 모델 간의 관계를 명확히 하여 향후 기능 추가 및 변경이 용이하도록 설계합니다.

---

## 2. 애플리케이션 아키텍처

관심사 분리 원칙에 따라, 프로젝트는 다음과 같이 기능적으로 독립된 Django 앱으로 구성됩니다.

-   `config/`: 프로젝트 전반의 설정 (`settings.py`, `urls.py`)을 관리하는 최상위 설정 디렉터리.
-   `accounts/`: 서비스 전체의 사용자 계정, 인증, 프로필 등 **글로벌 사용자** 정보를 관리합니다.
-   `workspaces/`: 각 회사에 해당하는 **워크스페이스**의 생성, 멤버 관리, 초대, 그리고 **워크스페이스 내 권한**을 관리합니다.
-   `llm_services/`: LLM 에이전트, **도구(Tool)**, **문서(Document)** 관리, 채팅 기록, RAG 파이프라인 등 핵심 LLM 기능들을 관리합니다.

---

## 3. 최종 데이터베이스 모델 설계

아래는 위 아키텍처에 따라 설계된 최종 데이터베이스 모델입니다. 각 모델은 특정 목적을 가지며, 관계(Relationship)를 통해 서로 상호작용합니다.

### 3.1. `accounts` 앱 모델

#### 👤 `User`
-   **목적**: 서비스에 가입한 모든 사용자의 고유 계정 정보. 워크스페이스와 무관한 글로벌 정보입니다.
-   **주요 필드**:
    -   `id` (PK): 고유 식별자
    -   `email` (unique): 로그인 ID
    -   `password`: 해싱된 비밀번호
    -   `username`: 사용자 이름
    -   `date_joined`: 가입 일시

### 3.2. `llm_services` 앱 모델 (일부)

#### 🛠️ `Tool`
-   **목적**: 시스템에서 LLM 에이전트가 사용할 수 있는 모든 도구를 데이터베이스에서 관리합니다. 이를 통해 동적으로 도구를 추가하고 권한을 부여할 수 있습니다.
-   **주요 필드**:
    -   `id` (PK)
    -   `name` (unique): 도구의 고유 이름 (예: `read_file`, `run_shell_command`)
    -   `description`: 도구에 대한 설명

#### 📄 `WorkspaceDocument`
-   **목적**: 각 워크스페이스에 업로드된 파일(지식 베이스)을 관리합니다.
-   **주요 필드**:
    -   `id` (PK)
    -   `workspace` (ForeignKey to `workspaces.Workspace`): 이 문서가 속한 워크스페이스 (데이터 격리의 핵심).
    -   `document` (FileField): 실제 파일. `upload_to`를 통해 워크스페이스별로 분리된 경로에 저장됩니다.
    -   `description`: 파일 설명.
    -   `uploaded_by` (ForeignKey to `accounts.User`): 업로드한 사용자.
    -   `category` (CharField): **문서별 접근 제어의 핵심**. 문서의 종류/민감도를 나타냅니다. (예: `GENERAL`, `CONFIDENTIAL`, `HR`, `LEGAL`)
    -   `uploaded_at`: 업로드 일시.

### 3.3. `workspaces` 앱 모델

#### 🏢 `Workspace`
-   **목적**: 각 회사/팀에 해당하는 독립된 공간 정보.
-   **주요 필드**:
    -   `id` (PK)
    -   `name`: 워크스페이스 이름
    -   `owner` (ForeignKey to `accounts.User`): 워크스페이스 생성자
    -   `created_at`: 생성 일시

#### 🧑‍💼 `WorkspaceMember` (가장 핵심적인 권한 관리 모델)
-   **목적**: `User`와 `Workspace`를 연결하며, 사용자가 특정 워크스페이스 내에서 가지는 모든 정보와 **권한**을 정의합니다.
-   **주요 필드**:
    -   `id` (PK)
    -   `user` (ForeignKey to `accounts.User`)
    -   `workspace` (ForeignKey to `workspaces.Workspace`)
    -   `role` (CharField): **역할 기반 접근 제어(RBAC)의 핵심**. 사용자의 기본 권한 템플릿. (예: `ADMIN`, `EDITOR`, `MEMBER`)
    -   `explicitly_allowed_tools` (ManyToManyField to `llm_services.Tool`): **개별 도구 권한**. 역할(Role) 권한 외에 이 사용자에게만 특별히 허용된 도구 목록.
    -   `allowed_documents` (ManyToManyField to `llm_services.WorkspaceDocument`): **개별 문서 접근 권한**. 이 사용자에게만 특별히 접근이 허용된 문서 목록.
    -   `work_email`, `department`, `position` 등 워크스페이스 내 개인 정보.

### 3.4. `llm_services` 앱 모델 (채팅)

#### 💬 `ChatSession` & `ChatMessage`
-   **목적**: 사용자와 LLM 에이전트 간의 대화 기록을 저장하여 히스토리 관리 및 분석을 지원합니다.
-   `ChatSession`: 대화의 묶음 (사용자, 워크스페이스, 제목 등).
-   `ChatMessage`: 개별 메시지 (내용, 발신자, 사용된 도구 정보 등).

---

## 4. 하이브리드 접근 제어 시스템 설계

본 시스템은 역할(Role)의 편리함과 개별 권한 설정의 유연함을 결합한 **하이브리드 모델**을 채택합니다.

### 4.1. Level 1: 역할 기반 접근 제어 (RBAC)
-   **동작**: `WorkspaceMember`의 `role` 필드를 기반으로 기본 권한 집합이 결정됩니다.
-   **구현**: 코드 내에 역할별 허용 목록을 정의합니다.

    ```python
    # permissions.py
    # 역할별 허용 도구
    ROLE_TOOL_PERMISSIONS = {
        'ADMIN': ['read_file', 'write_file', 'run_shell_command'],
        'EDITOR': ['read_file', 'write_file'],
        'MEMBER': ['read_file'],
    }

    # 역할별 접근 가능 문서 카테고리
    ROLE_DOCUMENT_PERMISSIONS = {
        'ADMIN': ['GENERAL', 'CONFIDENTIAL', 'HR', 'LEGAL'],
        'MEMBER': ['GENERAL'],
        'HR_MANAGER': ['GENERAL', 'HR'],
    }
    ```

### 4.2. Level 2: 개별 권한 부여 (Fine-Grained Control)
-   **동작**: `WorkspaceMember`의 `explicitly_allowed_tools`와 `allowed_documents` 다대다(M2M) 필드를 통해 역할 권한을 뛰어넘는 예외적인 권한을 부여합니다.
-   **예시 시나리오**:
    -   `MEMBER` 역할의 사용자는 기본적으로 `read_file` 도구만 사용할 수 있지만, 특정 프로젝트를 위해 `write_file` 권한이 필요할 경우, 관리자는 이 사용자의 `explicitly_allowed_tools`에 `write_file` 도구를 추가해줄 수 있습니다.
    -   `MEMBER` 역할은 `GENERAL` 카테고리의 문서만 볼 수 있지만, 특정 기밀문서(`CONFIDENTIAL` 카테고리)를 검토해야 할 경우, 해당 문서를 이 사용자의 `allowed_documents`에 추가해줄 수 있습니다.

### 4.3. 최종 권한 확인 로직
-   **동작**: 사용자가 어떤 작업을 요청할 때, 시스템은 항상 **(역할 기본 권한 ∪ 개별 추가 권한)**의 합집합으로 최종 권한을 계산합니다.

    ```python
    # 최종 허용 도구 목록 계산 예시
    def get_final_allowed_tools(member: WorkspaceMember):
        role_tools = set(ROLE_TOOL_PERMISSIONS.get(member.role, []))
        individual_tools = set(member.explicitly_allowed_tools.values_list('name', flat=True))
        final_tool_names = role_tools.union(individual_tools)
        # ... 이 이름들로 실제 도구 객체 리스트를 반환 ...
    ```

---

## 5. RAG 파이프라인 및 데이터 격리 구현

LLM이 참조할 지식 베이스를 관리하는 RAG 파이프라인은 다음 두 가지 수준에서 데이터 격리와 접근 제어를 수행합니다.

### 5.1. 테넌트 간 격리 (Inter-Tenant Isolation)
-   **문제**: 삼성 직원이 현대의 내부 문서를 검색하는 상황을 방지해야 합니다.
-   **해결책**: **ChromaDB `Collection`**을 사용합니다. 각 `Workspace`에 대해 고유한 이름의 컬렉션을 생성합니다. (예: `workspace_123`, `workspace_456`)
-   **구현**: 사용자가 파일을 업로드하거나 쿼리를 요청하면, 항상 해당 사용자가 속한 `Workspace`의 ID를 확인하고, 지정된 `Collection` 내에서만 모든 작업을 수행합니다.

### 5.2. 워크스페이스 내 접근 제어 (Intra-Workspace Control)
-   **문제**: 같은 회사 내에서도 일반 직원이 인사팀의 기밀문서를 검색하는 상황을 방지해야 합니다.
-   **해결책**: **ChromaDB `Metadata` 필터링**을 사용합니다.
-   **구현**:
    1.  **저장 시**: `WorkspaceDocument`를 벡터화하여 ChromaDB에 저장할 때, 해당 문서의 `id`와 `category`를 메타데이터로 함께 저장합니다.
        ```json
        { "metadata": { "document_id": 101, "category": "HR" } }
        ```
    2.  **검색 시**: 사용자가 쿼리를 날리면, 먼저 위 4.3절의 로직에 따라 해당 사용자가 접근할 수 있는 문서 `category` 목록을 계산합니다. 그리고 이 목록을 ChromaDB 쿼리의 `where` 절에 포함시켜, 허용된 카테고리의 문서 내에서만 검색을 수행합니다.
        ```python
        # 사용자의 역할/개별권한을 통해 허용된 카테고리가 ['GENERAL', 'HR']로 계산됨
        allowed_categories = ['GENERAL', 'HR']

        results = collection.query(
            query_texts=["사용자 질문"],
            where={"category": {"$in": allowed_categories}} # 허용된 카테고리만 검색
        )
        ```

---

## 6. 결론

이 설계는 Django의 강력한 ORM과 모듈식 아키텍처를 기반으로, 멀티테넌시 환경에서 요구되는 복잡한 데이터 격리 및 권한 관리 요구사항을 체계적으로 해결합니다. 역할(Role) 기반의 기본 정책과 개별 사용자에 대한 예외 정책을 결합한 하이브리드 모델은 관리의 효율성과 유연성을 모두 만족시키며, RAG 파이프라인에까지 접근 제어 정책을 일관되게 적용하여 안전하고 신뢰성 높은 LLM 서비스를 구축할 수 있는 견고한 토대를 제공합니다.