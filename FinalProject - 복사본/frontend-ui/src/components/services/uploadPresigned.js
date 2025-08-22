// ✅ uploadPresigned.js (수정된 버전)

/**
 * Electron 백엔드에서 presigned URL을 받아와 S3로 직접 파일을 업로드한다.
 * @param {File} file - 업로드할 파일 객체
 * @param {{sessionId: string}} metadata - 추가 메타데이터 (현재는 사용되지 않음)
 * @returns {Promise<{fileUrl: string}>} - 업로드 완료 후 최종 파일 URL을 포함한 객체
 */
export async function uploadChatbotFilePresigned(file, { sessionId }) {
  console.log(`'${file.name}' 파일 업로드를 시작한다.`);

  // 1. preload에 만들어둔 함수를 통해 Electron 백엔드(main.js)에 presigned URL을 요청한다.
  // 이게 올바른 방법이다. HTTP 서버는 필요 없다.
  const response = await window.electron.getS3UploadUrl(file.name);

  if (response.error || !response.url) {
    throw new Error(`Presigned URL을 받아오지 못했다: ${response.error || 'URL이 없음.'}`);
  }

  const uploadUrl = response.url;
  console.log(`Presigned URL을 받았다. S3에 업로드를 시작한다...`);

  // 2. 받은 URL을 사용해서 파일 본문을 PUT 요청으로 직접 S3에 업로드한다.
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

  // 3. 업로드 성공 후, 파일에 접근할 수 있는 최종 URL을 반환한다.
  // presigned URL에서 쿼리스트링(?AWSAccessKeyId=...)을 제거하면 순수한 파일 URL이 된다.
  const finalFileUrl = uploadUrl.split('?')[0];
  
  // 이 URL을 채팅 메시지에 첨부하거나 다른 곳에 사용할 수 있다.
  // 네놈의 원래 코드에 있던 '첨부 메타 저장' 로직은 별도의 백엔드 API가 필요하므로,
  // 그 기능이 필요하다면 그건 따로 만들어야 한다. 지금은 파일 업로드 자체에만 집중한다.
  return { fileUrl: finalFileUrl };
}