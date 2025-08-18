import React from "react";
import OverflowMenu from "./OverflowMenu.jsx";
import DocTypeBadge from "./DocTypeBadge.jsx";

export default function DocumentRowList({ docs, onDelete, onOpen }) {
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
            onClick={() => onOpen?.(d)}
          >
            <DocTypeBadge name={d.title || d.name} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium max-w-[24rem]">
                {d.title || d.name || "제목 없음"}
              </div>
            </div>
          </div>
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <OverflowMenu onDelete={() => onDelete?.(d)} />
          </div>
        </div>
      ))}
    </div>
  );
}
