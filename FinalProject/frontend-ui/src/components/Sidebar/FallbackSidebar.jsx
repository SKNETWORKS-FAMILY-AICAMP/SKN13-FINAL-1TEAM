import React from "react";

/**
 * 임시 사이드바 (아이콘/이모지 없음, 심플 톤)
 * - 나중에 AdminSidebar가 준비되면 이 파일은 삭제하고 FeatureApp.jsx에서 교체.
 */
export default function FallbackSidebar({
  sections = [],
  footer = [],
  activeKey,
  onSelect,
  collapsed = false,
  header = null,
}) {
  const wrap = collapsed ? "w-[64px]" : "w-[240px]";
  const labelClass = collapsed ? "opacity-0 pointer-events-none" : "truncate";

  const Item = ({ it }) => {
    const active = it.key === activeKey;
    return (
      <button
        type="button"
        onClick={() => onSelect?.(it.key)}
        className={[
          "w-full px-4 py-2 text-left rounded-lg",
          "hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200",
          active ? "bg-gray-100 font-medium" : "text-gray-700",
        ].join(" ")}
      >
        <span className={labelClass}>{it.label}</span>
      </button>
    );
  };

  return (
    <aside
      className={[
        "h-full bg-white border-r border-gray-200",
        "flex flex-col shrink-0 transition-all",
        wrap,
      ].join(" ")}
      aria-label="사이드바"
    >
      <div className="h-10 flex items-center px-4 border-b border-gray-100">
        {header || <span className="text-sm text-gray-500">메뉴</span>}
      </div>

      <nav className="flex-1 overflow-auto px-2 py-3 space-y-4">
        {sections.map((sec, idx) => (
          <section key={idx} className="space-y-1">
            {!collapsed && sec.title ? (
              <h6 className="px-2 text-[11px] tracking-wide text-gray-400">
                {sec.title}
              </h6>
            ) : null}
            {sec.items?.map((it) => <Item key={it.key} it={it} />)}
          </section>
        ))}
      </nav>

      {footer?.length ? (
        <div className="border-t border-gray-100 px-2 py-3 space-y-1">
          {footer.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => onSelect?.(it.key)}
              className={[
                "w-full px-4 py-2 text-left rounded-lg",
                "text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200",
              ].join(" ")}
            >
              <span className={labelClass}>{it.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
