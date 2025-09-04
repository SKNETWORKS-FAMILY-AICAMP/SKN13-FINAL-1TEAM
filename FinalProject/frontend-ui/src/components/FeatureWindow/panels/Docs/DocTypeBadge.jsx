import React from "react";

// 확장자 → 색/라벨 매핑
const EXT_STYLE = {
  pdf:  { bg:"bg-red-100",    fg:"text-red-600",    label:"PDF"  },
  doc:  { bg:"bg-blue-100",   fg:"text-blue-600",   label:"DOC"  },
  docx: { bg:"bg-blue-100",   fg:"text-blue-600",   label:"DOCX" },
  rtf:  { bg:"bg-blue-100",   fg:"text-blue-600",   label:"RTF"  },
  xls:  { bg:"bg-green-100",  fg:"text-green-700",  label:"XLS"  },
  xlsx: { bg:"bg-green-100",  fg:"text-green-700",  label:"XLSX" },
  csv:  { bg:"bg-green-100",  fg:"text-green-700",  label:"CSV"  },
  ppt:  { bg:"bg-orange-100", fg:"text-orange-600", label:"PPT"  },
  pptx: { bg:"bg-orange-100", fg:"text-orange-600", label:"PPTX" },
  txt:  { bg:"bg-gray-100",   fg:"text-gray-600",   label:"TXT"  },
  md:   { bg:"bg-gray-100",   fg:"text-gray-600",   label:"MD"   },
  hwp:  { bg:"bg-purple-100", fg:"text-purple-700", label:"HWP"  },
  hwpx: { bg:"bg-purple-100", fg:"text-purple-700", label:"HWPX" },
  odt:  { bg:"bg-cyan-100",   fg:"text-cyan-700",   label:"ODT"  },
  ods:  { bg:"bg-cyan-100",   fg:"text-cyan-700",   label:"ODS"  },
  odp:  { bg:"bg-cyan-100",   fg:"text-cyan-700",   label:"ODP"  },
  default: { bg:"bg-gray-100", fg:"text-gray-500",  label:"FILE" },
};

export function getExt(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext || "default";
}

export function getExtStyle(name = "") {
  const key = getExt(name);
  return EXT_STYLE[key] || EXT_STYLE.default;
}

/**
 * DocTypeBadge
 * size:
 *  - "lg": 카드(Grid)용 — aspect-video, 가로폭 채움
 *  - "sm": 리스트(Row)용 — 48px 정사각형
 */
export default function DocTypeBadge({ name = "", size = "lg", className = "" }) {
  const st = getExtStyle(name);

  if (size === "sm") {
    return (
      <div className={`w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center ${st.bg} ${className}`}>
        <span className={`text-xs font-semibold ${st.fg}`}>{st.label}</span>
      </div>
    );
  }

  // size === "lg"
  return (
    <div className={`aspect-video w-full overflow-hidden rounded-lg flex items-center justify-center ${st.bg} ${className}`}>
      <span className={`text-xs font-semibold ${st.fg}`}>{st.label}</span>
    </div>
  );
}
