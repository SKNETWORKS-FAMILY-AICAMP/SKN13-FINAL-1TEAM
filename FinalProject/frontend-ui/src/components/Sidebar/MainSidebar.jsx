// components/Sidebar/MainSidebar.jsx
import React, { useMemo } from "react";
import {
    BsPersonVcard,
    BsPersonCircle,
    BsBoxArrowRight,
    BsChevronLeft,
} from "react-icons/bs";
import { IoDocumentText } from "react-icons/io5";
import { FiCalendar } from "react-icons/fi";

// key → 기본 아이콘 매핑 (items에서 Icon을 넘기면 그걸 우선 사용)
const iconMap = {
    employee: BsPersonVcard,
    docs: IoDocumentText,
    // forms: IoDocumentText,
    calendar: FiCalendar,
    mypage: BsPersonCircle,
};

export default function MainSidebar({
  collapsed = true,
  onCollapse = () => {},
  companyName = "ClickA",
  logoSrc,
  // ▼ 라우팅 제거 후, config/상태 기반으로 사용
  sections = [],
  footer = [],
  activeKey,
  onSelect = () => {},
}) {
  const widthClass = collapsed ? "w-16" : "w-72";
  const show = !collapsed;
  const sidePad = collapsed ? "px-2" : "px-4";
  const logoBox = collapsed ? "w-8 h-8" : "w-9 h-9";

  const Item = ({ it }) => {
    const Icon = it.Icon || iconMap[it.key] || IoDocumentText;
    const isActive = it.key === activeKey;
    return (
      <button
        type="button"
        onClick={() => onSelect(it.key)}
        className={[
          "flex items-center gap-3 w-full px-3 py-3 rounded-xl transition",
          isActive ? "bg-gray-100 ring-1 ring-gray-200" : "hover:bg-gray-50",
        ].join(" ")}
      >
        <Icon className="text-[18px]" />
        {show && <span className="truncate">{it.label}</span>}
      </button>
    );
  };

  return (
    <aside
      className={[
        "h-full shrink-0 bg-white border-r border-gray-200",
        "flex flex-col transition-all duration-300 ease-in-out",
        widthClass,
      ].join(" ")}
      aria-label="메인 사이드바"
    >
      {/* 로고 + 회사명 */}
      <div className={`flex items-center ${sidePad} pt-4 pb-2`}>
        <div
          className={`${logoBox} shrink-0 rounded-full bg-white shadow overflow-hidden flex items-center justify-center`}
        >
          {logoSrc ? (
            <img src={logoSrc} alt="logo" className="w-full h-full object-contain" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200" />
          )}
        </div>
        {!collapsed && <h1 className="ml-3 font-semibold truncate">{companyName}</h1>}

        {/* 접기 버튼 (펼침 상태에서만) */}
        {!collapsed && (
          <button
            onClick={() => onCollapse?.()}
            className="ml-auto p-2 rounded-lg hover:bg-gray-100"
            title="접기"
          >
            <BsChevronLeft />
          </button>
        )}
      </div>

      {/* 섹션/아이템 */}
      <nav className="mt-4 px-3 space-y-4">
        {sections.map((sec, idx) => (
          <section key={idx} className="space-y-2">
            {!collapsed && sec.title ? (
              <h6 className="px-2 text-[11px] tracking-wide text-gray-400">
                {sec.title}
              </h6>
            ) : null}
            {sec.items?.map((it) => <Item key={it.key} it={it} />)}
          </section>
        ))}
      </nav>

      {/* 푸터(로그아웃 등) */}
      {footer?.length ? (
        <div className="mt-auto px-3 pb-4 space-y-2 border-t border-gray-100 pt-3">
          {footer.map((it) => {
            const Icon = it.Icon || (it.key === "logout" ? BsBoxArrowRight : iconMap[it.key]);
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => onSelect(it.key)}
                className="flex items-center gap-3 w-full px-3 py-2 text-left rounded-xl text-rose-600 hover:bg-rose-50 transition"
                title={it.label}
              >
                {Icon ? <Icon className="text-[18px]" /> : null}
                {show && <span>{it.label}</span>}
              </button>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
