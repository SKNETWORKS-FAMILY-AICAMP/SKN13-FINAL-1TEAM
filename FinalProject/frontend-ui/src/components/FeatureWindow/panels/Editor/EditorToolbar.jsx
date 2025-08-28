// ✅ 파일 위치: src/components/Editor/EditorToolbar.jsx
//
// ────────────────────────────────────────────────────────────────
// 역할(Role)
//  - RichEditor(TipTap)의 글꼴/크기/서식/정렬/표 삽입/리스트 등
//    "문서 편집용 툴바 UI".
//  - 워드프로세서 수준의 다양한 서식 버튼 제공.
//  - selection/caret 모드 선택: 드래그 영역 vs 커서 위치에만 적용.
//
// 사용처(Expected Usage)
//  - DocumentEditor.jsx 내부에서 <EditorToolbar editor={editorRef.current}/> 형태로 사용.
//  - 에디터의 상태(TipTap chain API)에 직접 연결되어 실행.
//
// 주요 컴포넌트 / 함수
//  - IconBtn: 아이콘 버튼 (클릭 시 selection 포커스 잃지 않도록 처리)
//  - TableDropdown: 표 삽입 UI (N×M 크기 선택 + 행/열 추가 버튼)
//  - usePageNumberToggle(): 인쇄 시 페이지 번호 표시용 스타일 삽입/제거
//
// state & 변수
//  - applyMode: "selection"(선택 영역) vs "caret"(커서 위치부터)
//  - FONT_LIST: 한국어 글꼴 목록 (맑은 고딕, 나눔고딕 등)
//  - WORD_STEPS: 워드처럼 단계별 글자 크기 배열 (8, 9, 10 … 128px)
//  - lastSelRef: 마지막 드래그 선택 범위 기억 (input 포커스 전환 시 유지)
//
// 기능별 버튼
//  - Bold/Italic/Underline/Strike → 기본 텍스트 스타일
//  - 글꼴 선택 (입력/드롭다운) + 글자 크기 (입력/드롭다운)
//  - 글자색 변경(Droplet) + 하이라이트 토글
//  - 문단/제목1~3/정렬(좌,중앙,우,양쪽)
//  - 리스트(순서/비순서), 들여쓰기/내어쓰기
//  - 표 삽입/행열 추가/삭제
//  - 페이지 번호 인쇄용 토글 (#페이지)
//  - 실행취소(Undo)/다시실행(Redo)
//
// 외부 연결(Dependency)
//  - lucide-react 아이콘 (UI 일관성 유지)
//  - TipTap editor.chain() API (실제 서식 적용 로직)
// ────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold, Italic, Underline as UIcon, Strikethrough,
  Type as FontIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, IndentIncrease, IndentDecrease,
  Table as TableIcon, ChevronDown,
  Eraser, Undo2, Redo2, Heading1, Heading2, Heading3,
  MousePointer, BoxSelect, Highlighter as HighlighterIcon, Droplet
} from "lucide-react";

/** 아이콘 버튼: 에디터 포커스/선택을 잃지 않도록 버튼만 preventDefault */
const IconBtn = ({ active, disabled, title, onClick, className = "", children }) => (
  <button
    title={title}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }}
    className={`px-2 py-1 text-sm border bg-white hover:bg-gray-50 disabled:opacity-40 ${active ? "bg-gray-200" : ""} ${className}`}
  >
    {children}
  </button>
);

/** 표 드롭다운 (N×N 미리보기 + 행/열 추가) */
function TableDropdown({ onInsert, onAddRow, onAddCol }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ r: 3, c: 3 });
  const maxR = 8, maxC = 10;
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (open && ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        title="표 삽입 옵션"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(v => !v)}
        className="px-2 py-1 rounded text-sm border bg-white hover:bg-gray-50 inline-flex items-center gap-1"
      >
        <TableIcon size={16} /><ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-[220px] rounded-md border bg-white shadow-lg p-2">
          <div className="text-xs text-gray-600 mb-1">표 크기 선택: {hover.r} × {hover.c}</div>
          <div className="grid grid-cols-10 gap-[2px] p-1">
            {Array.from({ length: maxR }).map((_, r) =>
              Array.from({ length: maxC }).map((_, c) => {
                const active = r < hover.r && c < hover.c;
                return (
                  <div
                    key={`${r}-${c}`}
                    className={`w-5 h-5 border ${active ? "bg-blue-100 border-blue-400" : "bg-white border-gray-300"}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                    onClick={() => { onInsert?.(hover.r, hover.c); setOpen(false); }}
                  />
                );
              })
            )}
          </div>
          <div className="mt-2 border-t pt-2 grid grid-cols-2 gap-2">
            <button className="text-xs px-2 py-1 rounded border hover:bg-gray-50" onMouseDown={(e) => e.preventDefault()} onClick={() => { onAddRow?.(); setOpen(false); }}>
              행 추가
            </button>
            <button className="text-xs px-2 py-1 rounded border hover:bg-gray-50" onMouseDown={(e) => e.preventDefault()} onClick={() => { onAddCol?.(); setOpen(false); }}>
              열 추가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 인쇄 페이지 번호 on/off */
function usePageNumberToggle() {
  const styleId = "print-page-numbers-style";
  const nodeId = "print-page-numbers-node";
  const enable = () => {
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        @media print {
          #${nodeId}{position:fixed;right:10mm;bottom:8mm;font-size:11px}
          #${nodeId}::after{content:counter(page) " / " counter(pages)}
        }
      `;
      document.head.appendChild(st);
    }
    if (!document.getElementById(nodeId)) {
      const el = document.createElement("div");
      el.id = nodeId;
      el.style.display = "none";
      document.body.appendChild(el);
    }
  };
  const disable = () => {
    document.getElementById(styleId)?.remove();
    document.getElementById(nodeId)?.remove();
  };
  return { enable, disable };
}

export default function EditorToolbar({ editor }) {
  if (!editor) return null;

  const [applyMode, setApplyMode] = useState("selection");
  const isOn = (name, attrs) => editor.isActive(name, attrs);

  /** 마지막 드래그 선택 범위를 기억 → input에 포커스가 가도 그 범위에 적용 */
  const lastSelRef = useRef(null);
  const captureSelection = () => {
    const { from, to, empty, head } = editor.state.selection;
    lastSelRef.current = { from, to, empty, head };
  };

  /** 선택 복원 + 적용 모드 반영 */
  const withApplyMode = (runner) => {
    let chain = editor.chain().focus();
    const cur = editor.state.selection;
    const saved = lastSelRef.current;

    if (applyMode === "selection") {
      if (!cur.empty) chain = chain.setTextSelection({ from: cur.from, to: cur.to });
      else if (saved && !saved.empty) chain = chain.setTextSelection({ from: saved.from, to: saved.to });
    } else {
      const head = !cur.empty ? cur.head : (saved ? saved.head : cur.head);
      chain = chain.setTextSelection(head);
    }

    runner(chain).run();
  };

  /** 글꼴 목록(한국어 이름만) */
  const FONT_LIST = useMemo(
    () => [
      "기본 글꼴",
      "맑은 고딕","굴림","돋움","바탕",
      "나눔고딕","나눔명조","나눔스퀘어",
      "본고딕(Noto Sans KR)","본명조(Noto Serif KR)",
      "Apple SD 고딕 Neo","Pretendard"
    ],
    []
  );

  // 글꼴: 입력 + 목록(항상 전체 표시)
  const [fontInput, setFontInput] = useState("");
  const [fontOpen, setFontOpen] = useState(false);
  const fontRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (fontOpen && fontRef.current && !fontRef.current.contains(e.target)) setFontOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [fontOpen]);

  const setFontFamily = (fontName) => {
    const name = (fontName === "기본 글꼴" || !fontName) ? null : fontName;
    withApplyMode((c) => c.setFontFamily(name));
  };

  /** 글자 크기 - Word 방식 단계값 + 입력/드롭다운 */
  const WORD_STEPS = useMemo(
    () => [8,9,10,11,12,14,16,18,20,22,24,26,28,36,48,72,96,128],
    []
  );
  const [fontSizeValue, setFontSizeValue] = useState("16px");
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizeRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (sizeOpen && sizeRef.current && !sizeRef.current.contains(e.target)) setSizeOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [sizeOpen]);

  const clampWord = (n) => {
    if (n <= WORD_STEPS[0]) return WORD_STEPS[0];
    if (n >= WORD_STEPS[WORD_STEPS.length - 1]) return WORD_STEPS[WORD_STEPS.length - 1];
    return n;
  };

  const applyFontSize = (pxNumber) => {
    const nearest = clampWord(pxNumber);
    setFontSizeValue(`${nearest}px`);
    withApplyMode((c) => c.setMark("textStyle", { fontSize: `${nearest}px` }));
  };

  const applyFontSizeFromValue = (val) => {
    const num = parseInt(String(val).replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(num)) return;
    applyFontSize(num);
  };

  /** 위/아래 키는 Word처럼 단계 배열에서 이전/다음 값으로 이동 */
  const onFontSizeKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyFontSizeFromValue(fontSizeValue);
      return;
    }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

    e.preventDefault();
    const curNum = parseInt(String(fontSizeValue).replace(/[^0-9]/g, ""), 10) || 16;
    let idx = WORD_STEPS.findIndex((v) => v >= curNum);
    if (idx === -1) idx = WORD_STEPS.length - 1;
    if (WORD_STEPS[idx] !== curNum) {
      // curNum 사이즈가 배열에 없으면 idx는 '바로 위' 단계
      if (e.key === "ArrowDown") idx = Math.max(0, idx - 1);
    } else {
      idx = Math.max(0, Math.min(WORD_STEPS.length - 1, idx + (e.key === "ArrowUp" ? 1 : -1)));
    }
    const next = WORD_STEPS[idx];
    setFontSizeValue(`${next}px`);
    withApplyMode((c) => c.setMark("textStyle", { fontSize: `${next}px` }));
  };

  // 리스트/들여쓰기
  const inAnyList = () => isOn("bulletList") || isOn("orderedList");
  const handleIndent = () => {
    const chain = editor.chain().focus();
    if (!inAnyList()) chain.toggleBulletList().sinkListItem("listItem").run();
    else chain.sinkListItem("listItem").run();
  };
  const handleOutdent = () => { if (inAnyList()) editor.chain().focus().liftListItem("listItem").run(); };

  // undo/redo
  const canUndo = editor.can().chain().focus().undo().run();
  const canRedo = editor.can().chain().focus().redo().run();

  // 페이지 번호
  const [pageNumOn, setPageNumOn] = useState(false);
  const { enable, disable } = usePageNumberToggle();
  const togglePageNumbers = () => { (pageNumOn ? disable() : enable()); setPageNumOn(!pageNumOn); };

  const insertTable = (rows, cols) =>
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();

  return (
    <div className="bg-white border-b">
      {/* 적용 대상 */}
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-50">
        <span className="text-xs text-gray-600 mr-1">적용 대상</span>
        <IconBtn title="드래그한 '선택 영역'에만 적용" active={applyMode === "selection"} onClick={() => setApplyMode("selection")} className="rounded">
          <BoxSelect size={16} />
        </IconBtn>
        <IconBtn title="커서가 있는 지점부터 앞으로 적용" active={applyMode === "caret"} onClick={() => setApplyMode("caret")} className="rounded">
          <MousePointer size={16} />
        </IconBtn>
        <span className="ml-2 text-xs text-gray-500">
          {applyMode === "selection" ? "선택 영역만" : "커서부터 앞으로"}
        </span>
      </div>

      {/* 툴바 본체 */}
      <div className="flex flex-wrap items-center gap-2 p-2">
        {/* 글꼴(입력 + 전체 드롭다운) */}
        <span className="inline-flex items-center" title="글꼴/크기"><FontIcon size={16} /></span>
        <div className="relative" ref={fontRef}>
          <input
            className="border rounded-l px-2 py-1 w-44"
            placeholder="글꼴 입력"
            value={fontInput}
            onMouseDown={captureSelection}
            onChange={(e) => setFontInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setFontFamily(fontInput.trim()); }}
            onBlur={() => { if (fontInput.trim()) setFontFamily(fontInput.trim()); }}
            title="글꼴 이름을 입력하세요"
          />
          <button
            className="border rounded-r px-2 py-1 bg-white hover:bg-gray-50"
            onMouseDown={(e) => { captureSelection(); e.preventDefault(); }}
            onClick={() => setFontOpen(v => !v)}
            title="글꼴 목록"
          >
            <ChevronDown size={14}/>
          </button>
          {fontOpen && (
            <div className="absolute z-50 mt-1 w-60 max-h-64 overflow-auto rounded-md border bg-white shadow-lg">
              {FONT_LIST.map((name) => (
                <button
                  key={name}
                  onMouseDown={(e) => { captureSelection(); e.preventDefault(); }}
                  onClick={() => { setFontInput(name === "기본 글꼴" ? "" : name); setFontFamily(name); setFontOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  style={{ fontFamily: name === "기본 글꼴" ? undefined : name }}
                  title={name}
                >
                  <div className="text-sm">{name}</div>
                  {name !== "기본 글꼴" && <div className="text-[11px] text-gray-500">가나다 ABC 123</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 글자 크기(입력 + Word 단계 드롭다운) */}
        <div className="relative" ref={sizeRef}>
          <input
            className="border rounded-l px-2 py-1 w-24 text-right"
            placeholder="크기"
            value={fontSizeValue}
            onMouseDown={captureSelection}
            onChange={(e) => setFontSizeValue(e.target.value)}
            onBlur={(e) => applyFontSizeFromValue(e.target.value)}
            onKeyDown={onFontSizeKeyDown}
            title="예: 16 또는 16px"
          />
          <button
            className="border rounded-r px-2 py-1 bg-white hover:bg-gray-50"
            onMouseDown={(e) => { captureSelection(); e.preventDefault(); }}
            onClick={() => setSizeOpen(v => !v)}
            title="글자 크기 목록(Word 단계)"
          >
            <ChevronDown size={14}/>
          </button>
          {sizeOpen && (
            <div className="absolute z-50 mt-1 w-28 max-h-64 overflow-auto rounded-md border bg-white shadow-lg">
              {WORD_STEPS.map(n => (
                <button
                  key={n}
                  onMouseDown={(e) => { captureSelection(); e.preventDefault(); }}
                  onClick={() => { setFontSizeValue(`${n}px`); applyFontSize(n); setSizeOpen(false); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
                >
                  {n}px
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 기본 서식 */}
        <IconBtn title="굵게 (Ctrl+B)" active={isOn("bold")} onClick={() => withApplyMode((c) => c.toggleBold())} className="rounded"><Bold size={16}/></IconBtn>
        <IconBtn title="기울임 (Ctrl+I)" active={isOn("italic")} onClick={() => withApplyMode((c) => c.toggleItalic())} className="rounded"><Italic size={16}/></IconBtn>
        <IconBtn title="밑줄 (Ctrl+U)" active={isOn("underline")} onClick={() => withApplyMode((c) => c.toggleUnderline())} className="rounded"><UIcon size={16}/></IconBtn>
        <IconBtn title="취소선" active={isOn("strike")} onClick={() => withApplyMode((c) => c.toggleStrike())} className="rounded"><Strikethrough size={16}/></IconBtn>

        {/* 글자 색상 / 하이라이트 */}
        <label className="border rounded px-1 py-[2px] inline-flex items-center gap-1 cursor-pointer" title="글자 색상" onMouseDown={captureSelection}>
          <Droplet size={16} />
          <input type="color" className="w-6 h-6 border rounded ml-1"
            onChange={(e) => withApplyMode((c) => c.setColor(e.target.value))} />
        </label>
        <IconBtn title="하이라이트 토글" active={isOn("highlight")} onClick={() => withApplyMode((c) => c.toggleHighlight())} className="rounded">
          <HighlighterIcon size={16}/>
        </IconBtn>

        <IconBtn title="모든 서식 지우기" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className="rounded"><Eraser size={16}/></IconBtn>

        {/* 문단/헤딩 */}
        <IconBtn title="본문" active={isOn("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} className="rounded">P</IconBtn>
        <IconBtn title="제목 1" active={isOn("heading",{level:1})} onClick={() => editor.chain().focus().toggleHeading({level:1}).run()} className="rounded"><Heading1 size={16}/></IconBtn>
        <IconBtn title="제목 2" active={isOn("heading",{level:2})} onClick={() => editor.chain().focus().toggleHeading({level:2}).run()} className="rounded"><Heading2 size={16}/></IconBtn>
        <IconBtn title="제목 3" active={isOn("heading",{level:3})} onClick={() => editor.chain().focus().toggleHeading({level:3}).run()} className="rounded"><Heading3 size={16}/></IconBtn>

        {/* 정렬 */}
        <IconBtn title="왼쪽 정렬"   active={editor.isActive({textAlign:"left"})}   onClick={() => withApplyMode((c)=>c.setTextAlign("left"))}   className="rounded"><AlignLeft size={16}/></IconBtn>
        <IconBtn title="가운데 정렬" active={editor.isActive({textAlign:"center"})} onClick={() => withApplyMode((c)=>c.setTextAlign("center"))} className="rounded"><AlignCenter size={16}/></IconBtn>
        <IconBtn title="오른쪽 정렬" active={editor.isActive({textAlign:"right"})}  onClick={() => withApplyMode((c)=>c.setTextAlign("right"))}  className="rounded"><AlignRight size={16}/></IconBtn>
        <IconBtn title="양쪽 정렬"   active={editor.isActive({textAlign:"justify"})}onClick={() => withApplyMode((c)=>c.setTextAlign("justify"))} className="rounded"><AlignJustify size={16}/></IconBtn>

        {/* 리스트 & 들여쓰기 */}
        <IconBtn title="글머리 기호"  active={isOn("bulletList")}  onClick={() => editor.chain().focus().toggleBulletList().run()} className="rounded"><List size={16}/></IconBtn>
        <IconBtn title="번호 매기기"   active={isOn("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} className="rounded"><ListOrdered size={16}/></IconBtn>
        <IconBtn title="들여쓰기"  onClick={handleIndent}  className="rounded"><IndentIncrease size={16}/></IconBtn>
        <IconBtn title="내어쓰기"  onClick={handleOutdent} className="rounded"><IndentDecrease size={16}/></IconBtn>

        {/* 표 */}
        <TableDropdown
          onInsert={(r,c) => insertTable(r,c)}
          onAddRow={() => editor.chain().focus().addRowAfter().run()}
          onAddCol={() => editor.chain().focus().addColumnAfter().run()}
        />
        <IconBtn title="표 삭제" onClick={() => editor.chain().focus().deleteTable().run()} className="rounded">표삭제</IconBtn>

        {/* 페이지 번호 (인쇄용) */}
        <IconBtn title="페이지 번호(인쇄) 토글" active={pageNumOn} onClick={togglePageNumbers} className="rounded">
          #페이지
        </IconBtn>

        {/* 되돌리기 / 다시 실행 */}
        <div className="ml-auto flex items-center">
          <IconBtn title="실행 취소 (Ctrl+Z)" disabled={!canUndo}
                   onClick={() => editor.chain().focus().undo().run()}
                   className="rounded-l-md -mr-px">
            <Undo2 size={16}/>
          </IconBtn>
          <IconBtn title="다시 실행 (Ctrl+Y)" disabled={!canRedo}
                   onClick={() => editor.chain().focus().redo().run()}
                   className="rounded-r-md">
            <Redo2 size={16}/>
          </IconBtn>
        </div>
      </div>
    </div>
  );
}
