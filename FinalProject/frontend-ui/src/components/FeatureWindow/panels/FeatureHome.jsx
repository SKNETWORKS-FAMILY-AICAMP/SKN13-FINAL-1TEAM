// ✅ FeatureHome.jsx
/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/FeatureHome.jsx
  역할: 기능부의 홈(대시보드) 섹션. 간단한 안내 텍스트를 렌더하며,
       실제 서비스에서는 최근 작업/바로가기/공지 등 홈 위젯들을 추가하는 진입점이 된다.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FeatureShell.jsx (역할/라우팅에 따라 홈으로 진입)
    - 이 파일이 사용하는 것:
      * 외부 서비스/컴포넌트 없음 (현재는 순수 UI)

  확장 포인트(예시):
    - 최근 열람 문서/북마크/공지/작업 위젯 카드들을 별도 컴포넌트로 분리하여 구성 가능
    - 서버 연동 시 홈 대시보드 API → 상태/이펙트로 데이터 로드 및 스켈레톤 표시
*/

import React from "react";

export default function FeatureHome() {
  return (
    <section className="bg-white">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">기능부 홈</h1>
      <p className="text-gray-600">
        워드 형식의 파일수정 페이지 입니다.
      </p>
    </section>
  );
}
