/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/Docs/DocTypeBadge.jsx
  역할: 문서 확장자에 따라 시각적 배지(썸네일 대체)를 그려주는 순수 UI 컴포넌트.
        Grid(카드)와 Row(리스트) 두 가지 크기("lg" | "sm")를 지원.

  LINKS:
    - 이 파일을 사용하는 곳:
      1) DocumentGrid.jsx → 카드 그리드에서 큰 배지(size="lg")로 사용
      2) DocumentRowList.jsx → 리스트 행에서 작은 배지(size="sm")로 사용
    - 이 파일이 사용하는 것: (없음, 순수 UI)
  
  데이터 흐름(요약):
    - 부모가 넘긴 name(파일명/제목)에서 확장자를 파싱(getExt)
    - 확장자별 색상/라벨(EXT_STYLE) 매핑을 조회(getExtStyle)
    - size props에 따라 적절한 레이아웃("lg"=aspect-video, "sm"=48px 정사각형) 렌더링

  주의할 점:
    - name이 없거나 확장자 파싱 실패 시 default 스타일 사용
    - 확장자 라벨은 간결성을 위해 상수 테이블에서 관리(디자인 일원화)
*/

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

/* 
 * DocTypeBadge
 * size:
 *  - "lg": 카드(Grid)용 — aspect-video, 가로폭 채움
 *  - "sm": 리스트(Row)용 — 48px 정사각형
 */
export default function DocTypeBadge({ name = "", size = "lg", className = "" }) {
  const st = getExtStyle(name); // 확장자 기반 스타일 결정

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
