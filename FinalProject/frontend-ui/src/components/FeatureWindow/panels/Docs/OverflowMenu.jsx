// ✅ 파일: frontend-ui/src/components/FeatureWindow/panels/Docs/_parts/OverflowMenu.jsx
import React, { useState } from "react";

export default function OverflowMenu({ onDelete }) {
  const [open, setOpen] = useState(false);
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
