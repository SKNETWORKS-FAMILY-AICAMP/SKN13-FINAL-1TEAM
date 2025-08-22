/* 
  파일: src/components/services/uploadPresigned.js
  역할: (Electron 권장 경로) preload → main 백엔드를 통해 S3 Presigned URL을 받아와
       브라우저에서 직접 PUT 업로드까지 수행하는 고수준 유틸리티.

  LINKS:
    - 이 파일을 사용하는 곳:
      * ChatWindow.jsx → uploadChatbotFilePresigned(file, { sessionId }) 로 호출
    - 이 파일이 사용하는 것:
      * window.electron.getS3UploadUrl(name) → preload가 노출한 안전한 브릿지
      * fetch PUT → S3로 바로 업로드

  흐름:
    1) getS3UploadUrl(name)으로 presigned URL 확보
    2) 해당 URL로 Content-Type 헤더와 함께 PUT 요청(파일 본문)
    3) 성공 시 쿼리스트링 제거한 최종 접근 URL 반환(fileUrl)
*/

/**
 * uploadChatbotFilePresigned(file, { sessionId })
 * 목적: Electron 백엔드에서 presigned URL을 받아와 S3에 직접 PUT 업로드한다.
 *
 * 인자:
 *  - file: 업로드할 File 객체
 *  - { sessionId }: 세션 ID (현재는 메타 용도로만 전달, 실제 업로드에는 비사용)
 *
 * 반환:
 *  - Promise<{ fileUrl: string }> — 업로드 완료 후 파일 접근 URL
 */
export async function uploadChatbotFilePresigned(file, { sessionId }) {
  console.log(`'${file.name}' 파일 업로드를 시작한다.`);

  // 1) preload 브릿지를 통해 presigned URL 요청
  const response = await window.electron.getS3UploadUrl(file.name);

  if (response.error || !response.url) {
    throw new Error(`Presigned URL을 받아오지 못했다: ${response.error || 'URL이 없음.'}`);
  }

  const uploadUrl = response.url;
  console.log(`Presigned URL을 받았다. S3에 업로드를 시작한다...`);

  // 2) S3로 직접 PUT 업로드
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`S3 업로드 실패: ${uploadResponse.status} ${errorText}`);
  }

  console.log(`'${file.name}' 파일 업로드에 성공했다.`);

  // 3) 최종 접근 URL(쿼리스트링 제거)
  const finalFileUrl = uploadUrl.split('?')[0];
  return { fileUrl: finalFileUrl };
}
