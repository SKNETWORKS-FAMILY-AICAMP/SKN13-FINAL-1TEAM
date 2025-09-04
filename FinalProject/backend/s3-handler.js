/**
 * =============================================================================
 * 📦 파일: s3-handler.js
 * 역할: Electron "메인 프로세스(Node)"에서 AWS SDK로 S3 Presigned URL을 발급.
 *       프런트(렌더러)는 이 URL로 S3에 직접 PUT 업로드한다.
 *
 * 버킷 선택 규칙 (중요):
 *  - space === "shared" (대소문자 무시) → S3_SHARED_BUCKET 으로 업로드
 *    * 키 앞에 S3_SHARED_ROOT 가 설정되어 있으면 접두 경로로 추가
 *  - 그 외(원본/RAW 등) → AWS_S3_BUCKET 으로 업로드
 *
 * 필요 환경변수:
 *  - AWS_ACCESS_KEY_ID
 *  - AWS_SECRET_ACCESS_KEY
 *  - AWS_REGION (예: ap-northeast-2)
 *  - AWS_S3_BUCKET          ← 원본/RAW 파일 (챗봇이 텍스트로 추출해 쓰는 DB)
 *  - S3_SHARED_BUCKET       ← 공유 파일 버킷
 *  - S3_SHARED_ROOT (옵션)  ← 공유 버킷 키 앞 접두 경로 (예: "team-sharing/")
 * =============================================================================
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// 안전한 ENV 접근(사용 시점 검사)
function requireEnv(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === null || v === "") {
    throw new Error(`${name} is required`);
  }
  return v;
}

let _s3Client = null;
function s3() {
  if (_s3Client) return _s3Client;
  const region = requireEnv("AWS_REGION", "ap-northeast-2");
  _s3Client = new S3Client({ region });
  return _s3Client;
}

function sanitize(name) {
  return String(name || "").replace(/[^\w.\-()\s]/g, "_");
}

function trimSlashes(s) {
  return String(s || "").replace(/^\/+|\/+$/g, "");
}

// space/dir/ts/filename으로 S3 키 생성
function buildKey({ space = "shared", dir = "", ts, filename, sharedRoot = "" }) {
  const isShared = String(space).toLowerCase() === "shared";

  // 공유 루트(옵션): "folder/sub/" 형태로 정규화
  const root = isShared ? trimSlashes(sharedRoot) : "";
  const d = trimSlashes(dir);
  const parts = [];

  if (root) parts.push(root);
  // 디렉터리 지정이 있으면 그 아래에 저장
  if (d) parts.push(d);

  // 동일 파일명 덮어쓰기 방지: 타임스탬프-원본이름
  parts.push(`${ts}-${filename}`);

  // 최종 키
  return parts.join("/");
}

/**
 * Electron 메인에서 호출되는 Presigned 발급 함수
 * @param {{ filename: string, contentType?: string, space?: string, dir?: string }}
 * @returns {Promise<{ uploadUrl: string, fileKey: string, displayName: string, bucket: string }>}
 */
async function getUploadUrl(args = {}) {
  const filename = sanitize(args.filename);
  if (!filename) throw new Error("filename is required");

  const contentType = args.contentType || "application/octet-stream";
  const space = (args.space || "shared").toString();
  const dir = args.dir || "";
  const isShared = space.toLowerCase() === "shared";

  // 버킷 결정
  const BUCKET = isShared
    ? requireEnv("S3_SHARED_BUCKET")
    : requireEnv("AWS_S3_BUCKET");

  // 공유 버킷일 경우 선택적 접두 경로
  const SHARED_ROOT = process.env.S3_SHARED_ROOT || "";

  const ts = Date.now();
  const fileKey = buildKey({
    space,
    dir,
    ts,
    filename,
    sharedRoot: SHARED_ROOT,
  });

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3(), command, { expiresIn: 300 }); // 5분
  return { uploadUrl, fileKey, displayName: filename, bucket: BUCKET };
}

module.exports = { getUploadUrl };
