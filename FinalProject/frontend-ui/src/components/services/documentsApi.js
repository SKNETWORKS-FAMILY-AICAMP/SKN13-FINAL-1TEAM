// src/components/services/documentsApi.js
import createAxios from "./createAxios.js";

// createAxios 인스턴스 생성
const api = createAxios("");

// ─────────────────────────────────────────────────────────────
// 기존 API들 (그대로 유지)
// ─────────────────────────────────────────────────────────────
export async function listDocuments({ limit = 200, page = 1, sort = "-updated_at", q = "" } = {}) {
  const sp = new URLSearchParams({ limit, page, sort });
  if (q) sp.set("q", q);
  const response = await api.get(`/files?${sp.toString()}`);
  return response.data?.items ?? response.data ?? [];
}

export async function createDocumentMeta({ title, url, mime }) {
  const response = await api.post(`/files`, { title, url, mime });
  return response.data;
}

export async function removeDocument(id) {
  await api.delete(`/files/${id}`);
  return true;
}

export async function restoreDocument(id) {
  await api.post(`/files/${id}/restore`);
  return true;
}

// ✅ 최근 열람(DB, presigned_url 포함)
export async function listRecentDocs({ limit = 50, page = 1, sort = "-updated_at" } = {}) {
  const sp = new URLSearchParams({ limit, page, sort });
  const response = await api.get(`/files/recent?${sp.toString()}`);
  return response.data?.items ?? response.data ?? [];
}
export async function exportToDocx(html, filename = "document.docx", doc_id = null) {
  // 1) 서버에 HTML → DOCX 변환 API 사용 시도 (createAxios 사용으로 CORS 해결)
  try {
    const endpoint = doc_id 
      ? `/files/${doc_id}/export`      // 특정 문서 export
      : `/files/export/docx`;          // 일반 HTML → DOCX 변환
    
    const response = await api.post(endpoint, {
      html,
      filename
    }, {
      responseType: 'blob'  // DOCX 바이너리 응답을 위한 설정
    });

    // axios는 자동으로 blob으로 변환해줌
    return response.data;
  } catch (e) {
    console.warn("[documentsApi] exportToDocx: 서버 변환 실패, 클라이언트 폴백 사용", e);
  }


  // 2) 폴백: HTML을 Word에서 열 수 있는 형식으로 저장
  //    * 진짜 .docx 변환은 아님 (정확한 변환은 서버/전용 라이브러리 필요)
  //    * 그래도 Word는 HTML 파일을 잘 열 수 있음
  const htmlDoc =
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${(filename || "document").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</title>
</head>
<body>
${html || ""}
</body>
</html>`;

  // Word가 열 수 있도록 MIME을 Word 계열로 지정 (완벽한 docx는 아님)
  return new Blob([htmlDoc], { type: "application/msword" });
}