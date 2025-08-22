/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/Docs/OverflowMenu.jsx
  역할: 카드/리스트 항목 우측 상단/우측의 ⋯(오버플로우) 메뉴. 수정/이름변경/다운로드/삭제 액션 버튼을 제공.

  LINKS:
    - 이 파일을 사용하는 곳:
      1) DocumentGrid.jsx (카드형 그리드의 각 카드)
      2) DocumentRowList.jsx (리스트형의 각 행)
    - 이 파일이 사용하는 것: (없음, 내부 state만 사용)
  
  상호작용(부모 ↔ 자식):
    - props.onDelete(): "삭제" 클릭 시 부모로 콜백 실행
    - 외부 클릭 닫힘 등은 간단화를 위해 생략(현재 토글 버튼 기반의 메뉴 상태)

  확장 포인트:
    - "수정하기" / "이름변경" / "다운로드"는 이후 실제 핸들러를 상위에서 주입하여 연결
*/

import React, { useState } from "react";

export default function OverflowMenu({ onDelete }) {
  const [open, setOpen] = useState(false); // 메뉴 열림/닫힘 상태
  return (
    <div className="relative">
      <button className="rounded-lg border px-2 py-1 text-sm" onClick={() => setOpen(v => !v)}>⋯</button>
      {open && (
        <div className="absolute right-0 mt-2 w-36 rounded-xl border bg-white shadow z-10">
          <MenuItem label="수정하기" onClick={() => setOpen(false)} />
          <MenuItem label="이름변경" onClick={() => setOpen(false)} />
          <MenuItem label="다운로드" onClick={() => setOpen(false)} />
          <MenuItem label="삭제" danger onClick={() => { setOpen(false); onDelete?.(); }} />
        </div>
      )}
    </div>
  );
}
function MenuItem({ label, danger, onClick }) {
  return (
    <button
      className={`w-full text-left px-3 py-2 text-sm ${danger ? "text-red-600" : ""} hover:bg-gray-50`}
      onClick={onClick}
    >{label}</button>
  );
}
