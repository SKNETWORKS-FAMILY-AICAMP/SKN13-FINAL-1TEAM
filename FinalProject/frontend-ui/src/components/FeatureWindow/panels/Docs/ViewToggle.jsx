/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/Docs/ViewToggle.jsx
  역할: 문서 보기 전환 토글 버튼(그리드/리스트). 접근성(aria-label) 포함.

  LINKS:
    - 이 파일을 사용하는 곳:
      * Toolbar.jsx → 우측 제어 영역의 보기 전환 버튼
    - 이 파일이 사용하는 것: (없음, 단순 토글 UI)

  상호작용(부모 ↔ 자식):
    - props.value: 현재 보기 모드("grid" | "list")
    - props.onChange(mode): 모드 전환 핸들러 (상위 상태 변경)
*/

export default function ViewToggle({ value, onChange }) {
  return (
    <div className="flex items-center rounded-xl border overflow-hidden">
      <button
        className={`px-3 py-2 text-sm ${value === "grid" ? "bg-gray-100" : ""}`}
        onClick={() => onChange("grid")}
        aria-label="그리드 보기"
      >▦</button>
      <button
        className={`px-3 py-2 text-sm ${value === "list" ? "bg-gray-100" : ""}`}
        onClick={() => onChange("list")}
        aria-label="리스트 보기"
      >☰</button>
    </div>
  );
}
