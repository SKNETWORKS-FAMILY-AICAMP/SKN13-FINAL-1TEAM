/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/Docs/DocumentGrid.jsx
  역할: 문서 목록을 "카드형 그리드"로 렌더링. 각 카드에 확장자 배지, 제목, 오버플로우 메뉴(⋯) 제공.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FeatureDocs.jsx (문서 패널에서 view === "grid"일 때 사용)
    - 이 파일이 사용하는 것:
      1) OverflowMenu.jsx → 카드 우측 상단 ⋯ 메뉴(삭제 등 액션)
      2) DocTypeBadge.jsx → 확장자별 배지(썸네일 대체)
  
  상호작용(부모 ↔ 자식):
    - props.docs: 문서 배열(id, title/name 등)
    - props.onOpen(doc): 카드 클릭 시 개별 문서 열기
    - props.onDelete(doc): ⋯ 메뉴에서 "삭제" 선택 시 호출
      → 내부에서 이벤트 버블링을 막아 카드 온클릭과 충돌 방지(onClick stopPropagation)

  UI 주의:
    - 제목과 ⋯ 버튼이 겹치지 않도록 flex 분리
    - 문서가 없을 때 비어있는 상태 메시지 표시(UX 배려)
*/

import React from "react";
import OverflowMenu from "./OverflowMenu.jsx";
import DocTypeBadge from "./DocTypeBadge.jsx";

export default function DocumentGrid({ docs, onDelete, onOpen }) {
  if (!docs?.length) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-sm text-gray-400">
        표시할 문서가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {docs.map((d) => (
        <div
          key={d.id}
          className="group relative rounded-2xl border p-3 hover:shadow-sm bg-white cursor-pointer"
          onClick={() => onOpen?.(d)} // 카드 전체 클릭 → 문서 열기
        >
          {/* 확장자 배지 (썸네일 대체) */}
          <DocTypeBadge name={d.title || d.name} size="lg" className="mb-2" />

          {/* 제목/버튼 분리 → 겹침 방지 */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium max-w-[14rem]">
                {d.title || d.name || "제목 없음"}
              </div>
            </div>
            <div className="shrink-0" onClick={(e) => e.stopPropagation() /* 카드 클릭 이벤트와 분리 */}>
              <OverflowMenu onDelete={() => onDelete?.(d)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
