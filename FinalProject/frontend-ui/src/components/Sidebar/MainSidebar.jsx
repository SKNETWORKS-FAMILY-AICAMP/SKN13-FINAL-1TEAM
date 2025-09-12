// components/Sidebar/MainSidebar.jsx
import React, { useCallback, useRef } from "react";
// 로고 사진
import Logo from "../../assets/sample_logo.svg";
// 아이콘
import {
  BsPersonVcard,
  BsPersonCircle,
  BsBoxArrowRight,
  BsChevronLeft,
} from "react-icons/bs";
import { MdEditDocument } from "react-icons/md";
import { IoDocumentText } from "react-icons/io5";
import { FiCalendar } from "react-icons/fi";

const iconMap = {
  employee: BsPersonVcard,
  docs: IoDocumentText,
  forms: MdEditDocument,
  calendar: FiCalendar,
  mypage: BsPersonCircle,
};

export default function MainSidebar({
  collapsed = false,
  onCollapse = () => {},
  companyName = "ClickA",
  logoSrc = Logo,
  sections = [],
  footer = [],
  activeKey,
  onSelect = () => {},
  onLogoutClick,
}) {
    const widthClass = collapsed ? "w-[72px]" : "w-72";
    const sidePad = "px-4";
    const logoBox = "w-9 h-9";
    const busyRef = useRef(false);

  const MenuItem = ({ it }) => {
    const Icon = it.Icon || iconMap[it.key] || BsPersonVcard;
    const isActive = it.key === activeKey;
    return (
      <button
        type="button"
        onClick={() => onSelect(it.key)}
        className={[
          "flex items-center gap-3 h-[48px] w-full px-3 py-3 rounded-xl transition",
          isActive ? "bg-gray-100" : "hover:bg-gray-50",
        ].join(" ")}
      >
        <span className="inline-flex w-6 h-6 items-center justify-center shrink-0">
            <Icon className="text-[20px] leading-none" />
        </span>
        <span
          className={[
            "truncate origin-left",
            "text-[14px]",
            "transition-[opacity,transform,width] duration-300 ease-in-out",
            collapsed
              ? "opacity-0 -translate-x-2 scale-95 w-0 max-w-0 overflow-hidden"
              : "opacity-100 translate-x-0 scale-100 w-auto max-w-full",
          ].join(" ")}
        >
          {it.label}
        </span>
      </button>
    );
  };

  /** ✅ 전역 로그아웃: 버튼이 직접 호출 (변경 없음) */
  const handleGlobalLogout = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      window.auth?.requestLogout?.("all");
    } finally {
      busyRef.current = false;
    }
  }, []);

  return (
    <aside
        className={[
            "h-full shrink-0 bg-white border-r border-gray-200",
            "flex flex-col overflow-hidden",
            "transition-all duration-300 ease-in-out",
            widthClass, // collapsed ? "w-18" : "w-72"
        ].join(" ")}
    >
      <div className={`flex items-center ${sidePad} pt-4 pb-4`}>
        <div
          onClick={() => onCollapse?.()}
          className={`${logoBox} shrink-0 rounded-full bg-white shadow overflow-hidden flex items-center justify-center cursor-pointer`}
          title={collapsed ? "펼치기" : "접기"}
        >
          {logoSrc ? (
            <img
              src={logoSrc}
              alt="logo"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200" />
          )}
        </div>

        <h1
          className={[
            "ml-3 font-semibold text-[20px] truncate origin-left",
            "transition-[opacity,transform,width] duration-300 ease-in-out",
            collapsed
              ? "opacity-0 -translate-x-2 scale-95 w-0 max-w-0 overflow-hidden"
              : "opacity-100 translate-x-0 scale-100 w-auto max-w-[10rem]",
          ].join(" ")}
        >
          {companyName}
        </h1>

        {!collapsed && (
          <button
            onClick={() => onCollapse?.()}
            className="ml-auto p-2 rounded-lg hover:bg-gray-100"
            title="사이드바 접기"
          >
            <BsChevronLeft />
          </button>
        )}
      </div>

      <nav className="mt-4 px-3 space-y-2">
        {sections.map((sec, idx) => (
          <section key={idx} className="space-y-2">
            {sec.title ? (
              <h6
                className={[
                  "px-2 text-[11px] tracking-wide text-gray-400 origin-left",
                  "transition-[opacity,transform,width] duration-300 ease-in-out",
                  collapsed
                    ? "opacity-0 -translate-x-2 scale-95 w-0 max-w-0 overflow-hidden"
                    : "opacity-100 translate-x-0 scale-100 w-auto max-w-full",
                ].join(" ")}
              >
                {sec.title}
              </h6>
            ) : null}

            {sec.items?.map((it) => (
              <MenuItem key={it.key} it={it} />
            ))}
          </section>
        ))}
      </nav>

      {footer?.length ? (
        <div className="mt-auto px-3 pb-4 space-y-2 pt-3">
          {footer.map((it) => {
            const isLogout = it.key === "logout";
            const Icon =
              it.Icon || (isLogout ? BsBoxArrowRight : iconMap[it.key]);

            const onClick = isLogout
              ? onLogoutClick || handleGlobalLogout
              : () => onSelect(it.key);

            return (
              <button
                key={it.key}
                type="button"
                onClick={onClick}
                className={[
                  "flex items-center gap-3 w-full px-3 py-2 text-left text-[14px] rounded-xl transition",
                  isLogout
                    ? "text-red-600 hover:bg-red-50"
                    : "hover:bg-gray-50",
                ].join(" ")}
                title={it.label}
              >
                <span className="inline-flex w-6 h-6 items-center justify-center shrink-0">
                    <Icon className="text-[18px] leading-none" />
                </span>
                <span
                  className={[
                    "truncate origin-left",
                    "transition-[opacity,transform,width] duration-300 ease-in-out",
                    collapsed
                      ? "opacity-0 -translate-x-2 scale-95 w-0 max-w-0 overflow-hidden"
                      : "opacity-100 translate-x-0 scale-100 w-auto max-w-full",
                  ].join(" ")}
                >
                  {it.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}