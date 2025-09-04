/* 
  역할: 화면/로직에서 쓰는 space 상수/라벨 모음
  - 파일 업로드/다운로드 시 사용
*/
export const SPACES = {
  SHARED: "shared",      // 공유 폴더
  RAW: "raw",            // 챗봇 원본 파일
  EXTRACTED: "extracted" // 추출 텍스트
};

export const SPACE_LABEL = {
  [SPACES.SHARED]: "공유폴더",
  [SPACES.RAW]: "원본",
  [SPACES.EXTRACTED]: "추출텍스트",
};
