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
export async function exportToDocx(html, filename = "document.docx", documentTitle = null) {
  // 1) 서버에 HTML → DOCX 변환 API 사용 시도 (createAxios 사용으로 CORS 해결)
  try {
    const endpoint = `/files/export/docx`;          // 일반 HTML → DOCX 변환
    
    const response = await api.post(endpoint, {
      html,
      filename,
      title: documentTitle  // 문서 제목을 별도로 전달
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
  
  // 본문에서 문서 제목과 일치하는 내용을 모두 제거 (중복 방지)
  let processedHtml = html || "";
  
  if (documentTitle) {
    // 1. 첫 번째 h1 태그가 문서 제목과 같다면 제거
    const h1TitleRegex = new RegExp(`<h1[^>]*>\\s*${documentTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</h1>`, 'gi');
    processedHtml = processedHtml.replace(h1TitleRegex, '');
    
    // 2. 첫 번째 p 태그가 문서 제목과 같다면 제거
    const pTitleRegex = new RegExp(`<p[^>]*>\\s*${documentTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</p>`, 'gi');
    processedHtml = processedHtml.replace(pTitleRegex, '');
    
    // 3. 단순 텍스트로 시작하는 제목도 제거 (첫 번째 줄이 제목인 경우)
    const lines = processedHtml.split('\n');
    if (lines.length > 0 && lines[0].trim() === documentTitle.trim()) {
      lines.shift(); // 첫 번째 줄 제거
      processedHtml = lines.join('\n');
    }
    
    // 4. 빈 p 태그들 정리
    processedHtml = processedHtml.replace(/<p[^>]*>\s*<\/p>/gi, '');
    processedHtml = processedHtml.trim();
  }
  
  const htmlDoc =
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${(documentTitle || filename || "document").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</title>
</head>
<body>
${documentTitle ? `<h1>${documentTitle.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</h1>` : ''}
${processedHtml}
</body>
</html>`;

  // Word가 열 수 있도록 MIME을 Word 계열로 지정 (완벽한 docx는 아님)
  return new Blob([htmlDoc], { type: "application/msword" });
}