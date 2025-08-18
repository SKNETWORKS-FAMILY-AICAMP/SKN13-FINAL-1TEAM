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
          onClick={() => onOpen?.(d)}
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
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <OverflowMenu onDelete={() => onDelete?.(d)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
