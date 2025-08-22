/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/Docs/Section.jsx
  역할: 문서 패널 내부에서 "섹션" 구획(섹션 제목 + 섹션 콘텐츠)을 일관된 스타일로 감싸주는 래퍼.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FeatureDocs.jsx (여러 섹션을 나눠 보여줄 때 레이아웃 통일)
    - 이 파일이 사용하는 것: (없음, 단순 래퍼)
*/

export default function Section({ title, children }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-600">{title}</h2>
      </div>
      {children}
    </div>
  );
}
