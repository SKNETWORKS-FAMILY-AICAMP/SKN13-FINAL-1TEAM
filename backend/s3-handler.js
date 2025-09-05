const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// 중요: AWS 자격증명과 리전은 환경 변수로 설정해라.
// 여기에 하드코딩하면 죽는다.
// AWS_ACCESS_KEY_ID
// AWS_SECRET_ACCESS_KEY
// AWS_REGION
// AWS_S3_BUCKET
const s3Client = new S3Client({});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

if (!BUCKET_NAME) {
    throw new Error("이봐, 아들. AWS_S3_BUCKET 환경 변수가 설정되지 않았다.");
}

/**
 * S3에 파일을 업로드하기 위한 presigned URL을 생성한다.
 * @param {string} fileName - 업로드할 파일의 이름.
 * @returns {Promise<string>} - Presigned URL.
 */
async function getUploadUrl(fileName) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `uploads/${Date.now()}-${fileName}`, // 덮어쓰기 방지를 위해 타임스탬프 추가
    });

    try {
        const signedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 300, // URL은 5분 뒤에 만료된다
        });
        console.log("서명된 URL 생성 성공:", signedUrl);
        return signedUrl;
    } catch (err) {
        console.error("젠장. 서명된 URL 생성 중 오류 발생", err);
        throw err;
    }
}

module.exports = { getUploadUrl };
