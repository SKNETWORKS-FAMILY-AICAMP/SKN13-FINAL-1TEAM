# 🚀 FinalProject 백엔드 API 엔드포인트 가이드

이 문서는 FinalProject 백엔드의 모든 REST API 엔드포인트를 정리한 완전한 참고 가이드입니다.

## 📋 목차
- [🔧 API 기본 정보](#-api-기본-정보)
- [🔐 인증 API](#-인증-api-apiv1auth)
- [👥 사용자 관리 API](#-사용자-관리-api-apiv1users)
- [📄 파일/문서 API](#-파일문서-api-apiv1files)
- [💬 채팅/AI API](#-채팅ai-api-apiv1chat)
- [📅 캘린더 API](#-캘린더-api-apiv1calendar)
- [📊 응답 코드 가이드](#-응답-코드-가이드)
- [🛡️ 보안 정보](#️-보안-정보)

---

## 🔧 API 기본 정보

### Base URL
```
http://localhost:8000  # 개발 환경
```

### Content-Type
```
Content-Type: application/json
```

### 인증 방식
- **JWT Bearer Token** (Authorization 헤더)
- **Refresh Token** (HTTP-Only Cookie)

### CORS 설정
- `http://localhost`
- `http://localhost:5173` (프론트엔드 개발 서버)

---

## 🔐 인증 API (`/api/v1/auth`)

### 1. **로그인**
```http
POST /api/v1/auth/login
```

**요청 Body:**
```json
{
  "unique_auth_number": "EMP001",
  "password": "your_password"
}
```

**응답 (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "must_change_password": false,
  "user_info": {
    "id": 1,
    "unique_auth_number": "EMP001",
    "username": "홍길동",
    "email": "hong@company.com",
    "dept": "개발팀",
    "position": "대리",
    "is_manager": false
  }
}
```

**특징:**
- Refresh Token은 HTTP-Only 쿠키로 자동 설정
- 마지막 로그인 시간 자동 업데이트
- 토큰 만료: Access Token 30분, Refresh Token 7일

---

### 2. **토큰 갱신**
```http
POST /api/v1/auth/refresh
```

**요청:** 쿠키의 refresh_token 자동 사용

**응답 (200):**
```json
{
  "access_token": "new_access_token...",
  "token_type": "bearer"
}
```

**특징:**
- 토큰 회전(Rotation) 구현
- 재사용 탐지 및 보안 이벤트 처리
- 새로운 Refresh Token 자동 발급

---

### 3. **로그아웃**
```http
POST /api/v1/auth/logout
```

**요청:** 쿠키의 refresh_token 사용

**응답 (200):**
```json
{
  "message": "Logout successful"
}
```

---

### 4. **비밀번호 변경**
```http
PUT /api/v1/auth/password
Authorization: Bearer {access_token}
```

**요청 Body:**
```json
{
  "current_password": "current_password",
  "new_password": "new_password"
}
```

**응답 (200):**
```json
{
  "message": "Password updated successfully"
}
```

---

### 5. **현재 사용자 정보**
```http
GET /api/v1/auth/me
Authorization: Bearer {access_token}
```

**응답 (200):**
```json
{
  "id": 1,
  "unique_auth_number": "EMP001",
  "username": "홍길동",
  "email": "hong@company.com",
  "dept": "개발팀",
  "position": "대리",
  "is_manager": false,
  "must_change_password": false,
  "last_login_at": "2025-01-15T10:30:00.000Z"
}
```

---

## 👥 사용자 관리 API (`/api/v1/users`)

### 1. **사용자 생성** (관리자 전용)
```http
POST /api/v1/users
```

**요청 Body:**
```json
{
  "unique_auth_number": "EMP002",
  "username": "김철수",
  "email": "kim@company.com",
  "dept": "영업팀",
  "position": "과장",
  "is_manager": false
}
```

**응답 (201):**
```json
{
  "message": "User created successfully",
  "id": 2,
  "unique_auth_number": "EMP002",
  "username": "김철수",
  "email": "kim@company.com",
  "dept": "영업팀",
  "position": "과장"
}
```

**특징:**
- 초기 비밀번호는 "1234"로 설정
- `must_change_password`가 true로 설정됨

---

### 2. **전체 사용자 조회** (관리자 전용)
```http
GET /api/v1/users
```

**응답 (200):**
```json
[
  {
    "id": 1,
    "unique_auth_number": "EMP001",
    "username": "홍길동",
    "email": "hong@company.com",
    "dept": "개발팀",
    "position": "대리",
    "is_manager": false,
    "created_at": "2025-01-01T09:00:00.000Z",
    "last_login_at": "2025-01-15T10:30:00.000Z"
  }
]
```

---

### 3. **특정 사용자 조회** (관리자 전용)
```http
GET /api/v1/users/{user_id}
```

**응답 (200):**
```json
{
  "id": 1,
  "username": "홍길동",
  "email": "hong@company.com",
  "is_active": true,
  "is_manager": false
}
```

---

### 4. **사용자 정보 수정** (관리자 전용)
```http
PUT /api/v1/users/{user_id}
```

**요청 Body:** (선택적 필드들)
```json
{
  "username": "홍길동_수정",
  "email": "new_email@company.com",
  "dept": "새부서",
  "position": "새직급",
  "is_manager": true
}
```

---

### 5. **사용자 삭제** (관리자 전용)
```http
DELETE /api/v1/users/{user_id}
```

**응답:** 204 No Content

---

### 6. **비밀번호 초기화** (관리자 전용)
```http
PUT /api/v1/users/{user_id}/reset-password
```

**응답 (200):**
```json
{
  "message": "Password for user 홍길동 has been reset successfully."
}
```

**특징:**
- 비밀번호가 "1234"로 초기화됨
- `must_change_password`가 true로 설정됨

---

## 📄 파일/문서 API (`/api/v1/files`)

### 1. **문서 목록 조회**
```http
GET /api/v1/files/
Authorization: Bearer {access_token}
```

**응답 (200):**
```json
[
  {
    "id": "doc-uuid-123",
    "original_filename": "report.pdf",
    "file_type": "pdf",
    "uploaded_at": "2025-01-15T10:00:00.000Z",
    "updated_at": "2025-01-15T11:00:00.000Z"
  }
]
```

---

### 2. **문서 업로드**
```http
POST /api/v1/files/upload
Authorization: Bearer {access_token}
Content-Type: multipart/form-data
```

**요청 Form Data:**
```
file: [Binary File]
```

**지원 파일 형식:** PDF, DOCX, HWP, HWPX, MD, TXT

**응답 (200):**
```json
{
  "doc_id": "doc-uuid-123",
  "markdown_content": "# 문서 제목\n\n문서 내용...",
  "message": "Document uploaded and converted successfully"
}
```

**특징:**
- 파일은 자동으로 마크다운으로 변환됨
- 원본 파일과 마크다운 파일 모두 저장
- 소유자만 접근 가능

---

### 3. **문서 내용 조회**
```http
GET /api/v1/files/{doc_id}/content
Authorization: Bearer {access_token}
```

**응답 (200):**
```json
{
  "doc_id": "doc-uuid-123",
  "markdown_content": "# 문서 제목\n\n수정된 내용..."
}
```

---

### 4. **문서 내용 저장**
```http
PUT /api/v1/files/{doc_id}/content
Authorization: Bearer {access_token}
Content-Type: text/plain
```

**요청 Body:** (Raw 텍스트)
```
# 수정된 문서 제목

수정된 마크다운 내용...
```

**응답 (200):**
```json
{
  "doc_id": "doc-uuid-123",
  "message": "Markdown content saved successfully"
}
```

---

### 5. **문서 DOCX 내보내기**
```http
POST /api/v1/files/{doc_id}/export
Authorization: Bearer {access_token}
```

**요청 Body:**
```json
{
  "html": "<h1>제목</h1><p>내용</p>",
  "filename": "exported_document.docx"
}
```

**응답:** DOCX 파일 다운로드

---

### 6. **문서 삭제**
```http
DELETE /api/v1/files/{doc_id}
Authorization: Bearer {access_token}
```

**응답 (200):**
```json
{
  "message": "Document and associated files deleted successfully"
}
```

---

### 7. **S3 Presigned URL 생성**
```http
POST /api/v1/files/presigned
Authorization: Bearer {access_token}
```

**요청 Body:**
```json
{
  "filename": "upload_file.pdf",
  "contentType": "application/pdf"
}
```

**응답 (200):**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/bucket/signed-url",
  "fileKey": "unique-file-key",
  "displayName": "upload_file.pdf"
}
```

---

## 💬 채팅/AI API (`/api/v1/chat`)

### 1. **메시지 저장**
```http
POST /api/v1/chat/save
Authorization: Bearer {access_token}
```

**요청 Body:**
```json
{
  "session_id": "session-uuid-123",
  "role": "user",
  "content": "안녕하세요, 도움이 필요합니다"
}
```

**응답 (200):**
```json
{
  "status": "success"
}
```

---

### 2. **채팅 세션 목록 조회**
```http
GET /api/v1/chat/sessions
Authorization: Bearer {access_token}
```

**응답 (200):**
```json
{
  "sessions": [
    {
      "id": "session-uuid-123",
      "title": "안녕하세요, 도움이 필요합니다"
    }
  ]
}
```

---

### 3. **특정 세션 메시지 조회**
```http
GET /api/v1/chat/{session_id}/messages
Authorization: Bearer {access_token}
```

**응답 (200):**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "안녕하세요"
    },
    {
      "role": "assistant",
      "content": "안녕하세요! 어떻게 도와드릴까요?"
    }
  ]
}
```

---

### 4. **AI 응답 스트리밍**
```http
GET /api/v1/chat/stream?session_id={session_id}&prompt={prompt}&document_content={content}
```

**응답:** Server-Sent Events (SSE)
```
data: {"content": "안녕하세요! "}
data: {"content": "어떻게 "}
data: {"content": "도와드릴까요?"}
data: {"thinking_message": "[AI Thinking]: Using tool 'document_search'..."}
data: {"tool_message": "[Tool Output]: 검색 결과..."}
data: {"document_update": "업데이트된 문서 내용"}
data: {"needs_document_content": true, "agent_context": {...}}
data: [DONE]
```

**특징:**
- 실시간 스트리밍 응답
- AI 에이전트 도구 사용 과정 실시간 표시
- 문서 검색, 편집 등 다양한 AI 기능 지원

---

### 5. **메시지 삭제**
```http
DELETE /api/v1/chat/messages/{message_id}?hard=false
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `hard`: true (완전삭제) / false (소프트삭제)

**응답 (200):**
```json
{
  "ok": true,
  "message": "Message deleted successfully"
}
```

---

### 6. **세션 삭제**
```http
DELETE /api/v1/chat/sessions/{session_id}?hard=false
Authorization: Bearer {access_token}
```

**응답 (200):**
```json
{
  "ok": true,
  "message": "Session deleted successfully"
}
```

---

### 7. **세션 내 오래된 메시지 삭제**
```http
DELETE /api/v1/chat/sessions/{session_id}/messages?before=2025-01-01T00:00:00Z
```

또는

```http
DELETE /api/v1/chat/sessions/{session_id}/messages?keep_last=50
```

**Query Parameters:**
- `before`: ISO8601 날짜 (이 날짜 이전 메시지 삭제)
- `keep_last`: 정수 (최신 N개 메시지만 보존)

**응답 (200):**
```json
{
  "ok": true,
  "soft_deleted": 25,
  "message": "Deleted 25 messages"
}
```

---

## 📅 캘린더 API (`/api/v1/calendar`)

### 1. **이벤트 생성**
```http
POST /api/v1/calendar/events
Authorization: Bearer {access_token}
```

**요청 Body:**
```json
{
  "title": "팀 미팅",
  "description": "주간 팀 미팅입니다",
  "start": "2025-01-20T10:00:00",
  "end": "2025-01-20T11:00:00",
  "all_day": false,
  "color": "#3498db"
}
```

**응답 (200):**
```json
{
  "id": 1,
  "title": "팀 미팅",
  "description": "주간 팀 미팅입니다",
  "start": "2025-01-20T10:00:00",
  "end": "2025-01-20T11:00:00",
  "allDay": false,
  "color": "#3498db"
}
```

---

### 2. **이벤트 목록 조회**
```http
GET /api/v1/calendar/events?start=2025-01-01T00:00:00&end=2025-01-31T23:59:59
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `start`: 조회 시작 날짜 (ISO8601)
- `end`: 조회 종료 날짜 (ISO8601)

**응답 (200):**
```json
[
  {
    "id": 1,
    "title": "팀 미팅",
    "description": "주간 팀 미팅입니다",
    "start": "2025-01-20T10:00:00",
    "end": "2025-01-20T11:00:00",
    "allDay": false,
    "color": "#3498db"
  }
]
```

---

### 3. **이벤트 수정**
```http
PUT /api/v1/calendar/events/{event_id}
Authorization: Bearer {access_token}
```

**요청 Body:** (이벤트 생성과 동일)

**응답:** 수정된 이벤트 정보 (이벤트 생성 응답과 동일)

---

### 4. **이벤트 삭제**
```http
DELETE /api/v1/calendar/events/{event_id}
Authorization: Bearer {access_token}
```

**응답:** 204 No Content

---

## 📊 응답 코드 가이드

### 성공 응답
- **200 OK**: 요청 성공
- **201 Created**: 리소스 생성 성공
- **204 No Content**: 삭제 성공

### 클라이언트 오류
- **400 Bad Request**: 잘못된 요청 데이터
- **401 Unauthorized**: 인증 실패
- **403 Forbidden**: 권한 부족
- **404 Not Found**: 리소스를 찾을 수 없음
- **409 Conflict**: 중복 데이터
- **422 Unprocessable Entity**: 유효성 검사 실패

### 서버 오류
- **500 Internal Server Error**: 서버 내부 오류
- **503 Service Unavailable**: 서비스 일시 중단

---

## 🛡️ 보안 정보

### 인증 보안
- **JWT Access Token**: 30분 만료
- **Refresh Token**: 7일 만료, HTTP-Only 쿠키
- **토큰 회전**: Refresh Token 재사용 시 자동 갱신
- **재사용 탐지**: 폐기된 토큰 재사용 시 모든 세션 강제 종료

### 데이터 보안
- **소유권 검증**: 사용자는 자신의 데이터만 접근 가능
- **관리자 권한**: 사용자 관리 API는 관리자만 접근
- **파일 격리**: 업로드된 파일은 소유자별로 격리
- **세션 보안**: 채팅 세션은 사용자별로 격리

### CORS 보안
- 허용된 오리진에서만 API 호출 가능
- Credentials 포함 요청 허용
- 모든 HTTP 메서드 지원

---

## 🚀 개발 팁

### 인증 헤더 사용법
```javascript
const headers = {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
}
```

### 파일 업로드 예제
```javascript
const formData = new FormData();
formData.append('file', file);

fetch('/api/v1/files/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});
```

### SSE 스트리밍 예제
```javascript
const eventSource = new EventSource(
  `/api/v1/chat/stream?session_id=${sessionId}&prompt=${encodeURIComponent(prompt)}`
);

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  if (data.content) {
    // 일반 텍스트 응답
    console.log(data.content);
  } else if (data.needs_document_content) {
    // 문서 내용 요청
    console.log('AI가 문서 내용을 요청했습니다');
  }
};
```

---

**이 문서는 FinalProject 백엔드 API의 완전한 참조 가이드입니다. 모든 엔드포인트는 실제 구현된 코드를 기반으로 작성되었습니다.** 🚀