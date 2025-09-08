/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/Docs/DocumentRowList.jsx
  역할: 문서 목록을 "행(List) 형태"로 렌더링. 각 행의 좌측에 작은 확장자 배지, 우측에 ⋯ 액션 제공.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FeatureDocs.jsx (문서 패널에서 view === "list"일 때 사용)
    - 이 파일이 사용하는 것:
      1) OverflowMenu.jsx → ⋯ 메뉴(삭제 등)
      2) DocTypeBadge.jsx → 소형 배지(size="sm")

  상호작용(부모 ↔ 자식):
    - props.docs: 문서 배열
    - props.onOpen(doc): 행 클릭 시 문서 열기
    - props.onDelete(doc): ⋯ 메뉴에서 "삭제" 선택 시 호출
      → 이벤트 버블링 방지로 행 클릭(onOpen)과 충돌하지 않게 처리

  UI 주의:
    - divide-y + border로 리스트 가독성 강화
    - 제목 길이 제한(ellipsis)으로 행 레이아웃 안정화
*/

/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/Docs/DocumentRowList.jsx
  역할: 문서 목록을 "행(List) 형태"로 렌더링. 각 행의 좌측에 작은 확장자 배지, 우측에 ⋯ 액션 제공.
*/

import React from "react";
import OverflowMenu from "./OverflowMenu.jsx";
import DocTypeBadge from "./DocTypeBadge.jsx";

export default function DocumentRowList({
  docs,
  onDelete,
  onOpen,
  onEdit,    
  onRename,   
}) {
  if (!docs?.length) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-sm text-gray-400">
        표시할 문서가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y rounded-xl border bg-white">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center justify-between px-4 py-3">
          <div
            className="flex items-center gap-3 min-w-0 cursor-pointer"
            onClick={() => onOpen?.(d)} // 행 클릭 → 문서 열기
          >
            <DocTypeBadge name={d.title || d.name} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium max-w-[24rem]">
                {d.title || d.name || "제목 없음"}
              </div>
            </div>
          </div>

          {/* 메뉴 클릭 시 행 onClick과 충돌하지 않도록 전파 중단 */}
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <OverflowMenu
              onEdit={() => onEdit?.(d)}      
              onDelete={() => onDelete?.(d)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
