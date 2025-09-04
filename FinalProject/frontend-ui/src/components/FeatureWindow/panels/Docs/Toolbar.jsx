/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/Docs/Toolbar.jsx
  역할: 문서 패널 상단 툴바. 제목 표시, 검색 입력, 보기 전환(그리드/리스트), 업로드 트리거 버튼(옵션)을 배치.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FeatureDocs.jsx (상단 바 영역)
    - 이 파일이 사용하는 것:
      1) ViewToggle.jsx → 보기 전환 토글 컴포넌트

  상호작용(부모 ↔ 자식):
    - props.title: 현재 섹션/페이지 타이틀
    - props.query / onQueryChange: 검색어 상태 제어(상위에서 상태 보유)
    - props.view / onViewChange: "grid" | "list" 전환
    - props.onUpload: 업로드 버튼 연결(현재 UI에서 버튼 노출은 제거되었을 수 있음)
*/

 // 순수 UI: 제목, 검색, 보기 전환, 업로드 버튼
import ViewToggle from "./ViewToggle.jsx";

export default function Toolbar({ title, query, onQueryChange, view, onViewChange, onUpload }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)} // 입력 변경 → 상위로 검색어 반영
          placeholder="문서를 검색하세요"
          className="w-72 rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
        />
        <ViewToggle value={view} onChange={onViewChange} />

      </div>
    </div>
  );
}
