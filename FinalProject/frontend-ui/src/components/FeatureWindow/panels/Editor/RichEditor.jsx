// RichEditor.jsx
//
// ────────────────────────────────────────────────────────────────────────────────
// 역할(Role)
//  - TipTap 기반 리치 텍스트 에디터 본체.
//  - 문단/서식/표/이미지 등을 편집하고 HTML을 상위로 전달(onChange).
//  - 표의 모서리(우하단) 리사이즈 핸들을 커스텀으로 제공하여, 외부 컨테이너가
//    제공하는 "페이지 내부 폭(cap)"을 넘지 못하도록 강제(clamp)한다.
//  - 셀 드래그 다중 선택(엑셀 느낌)은 TipTap Table의 기본 기능을 사용하고,
//    시각적 하이라이트 스타일만 주입한다.
//
// 구성(Structure)
//  1) TipTap Extensions 선언(StarterKit, TextStyle, FontFamily, Color, Highlight …)
//  2) Table 확장: tableWidth 속성 + max-width:100% 강제
//  3) Row 확장: rowHeight 속성(현재는 행 높이 표현에 사용 가능; 기본 정책은 셀 자동 높이)
//  4) findParentTable 유틸: 현재 selection이 속한 table node와 시작 위치 계산
//  5) createCornerResizePlugin: 모서리(우하단) 리사이즈 핸들 + 가로폭 cap 적용
//  6) useEditor 초기화 및 라이프사이클 훅: 플러그인 등록/해제, 스타일 주입/정리
//
// 주의(Gotchas)
//  - 폰트/폰트크기: TextStyle/FontFamily 확장이 있어야만 툴바의 설정이 실제로 적용됨.
//  - 표 리사이즈: TipTap 기본 column-resize 는 열별 폭을 조절한다. 여기서는
//    전체 표 폭을 한 번에 늘이는 "모서리 핸들"만 커스텀으로 추가한다.
//  - 폭 상한(cap): 상위(DocumentEditor)에서 getPageInnerWidth()로 현재 페이지 내부 폭을
//    제공해주며, 그 값을 넘지 못하게 Math.min(cap, …)으로 가드한다.
//  - 다중 셀 선택: 기본 기능이라 로직 불필요. 단, 선택이 눈에 띄도록 CSS만 주입.
// ────────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

// Marks / Nodes 확장
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";

import { Table as BaseTable } from "@tiptap/extension-table";
import { TableRow as BaseRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { FontFamily } from "@tiptap/extension-font-family";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";

// ProseMirror 플러그인/데코레이션
import { Plugin, PluginKey } from "prosemirror-state";
import { Extension } from "@tiptap/core";
import { Decoration, DecorationSet } from "prosemirror-view";

/* ──────────────────────────────────────────────────────────────────────────────
 *  FontSize 확장
 *  - TextStyle 마크에 fontSize 속성을 전역 등록.
 *  - 툴바에서 setMark('textStyle', { fontSize: '24px' }) 호출 시 실제로
 *    style="font-size:24px" 이 인라인으로 적용되도록 함.
 * ──────────────────────────────────────────────────────────────────────────── */
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"], // TextStyle 마크에 전역 속성으로 추가
        attributes: {
          fontSize: {
            default: null,
            renderHTML: (attrs) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size:${attrs.fontSize}` };
            },
            parseHTML: (el) => {
              const v = el.style?.fontSize;
              return v ? { fontSize: v } : {};
            },
          },
        },
      },
    ];
  },
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  Table 확장
 * ──────────────────────────────────────────────────────────────────────────── */
const Table = BaseTable.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tableWidth: {
        default: null,
        renderHTML: (attrs) =>
          attrs.tableWidth
            ? { style: `width:${attrs.tableWidth}px; max-width:100%; table-layout:fixed;` }
            : { style: `max-width:100%; table-layout:fixed;` },
        parseHTML: (el) => {
          const w = (el.style && el.style.width) || "";
          const num = parseInt(w.replace("px", ""), 10);
          return Number.isFinite(num) ? { tableWidth: num } : {};
        },
      },
    };
  },
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  Row 확장
 * ──────────────────────────────────────────────────────────────────────────── */
const TableRow = BaseRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: {
        default: null,
        renderHTML: (attrs) =>
          attrs.rowHeight ? { style: `height:${attrs.rowHeight}px;` } : {},
        parseHTML: (el) => {
          const h = (el.style && el.style.height) || "";
          const num = parseInt(h.replace("px", ""), 10);
          return Number.isFinite(num) ? { rowHeight: num } : {};
        },
      },
    };
  },
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  현재 selection이 속한 table 노드 탐색
 * ──────────────────────────────────────────────────────────────────────────── */
function findParentTable($pos, doc) {
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === "table") {
      return { node, depth: d, start: $pos.start(d) };
    }
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────────────
 *  Corner(우하단) Resize 플러그인
 * ──────────────────────────────────────────────────────────────────────────── */
const resizeKey = new PluginKey("corner-resize");

function createCornerResizePlugin(getCap) {
  return new Plugin({
    key: resizeKey,
    props: {
      decorations(state) {
        const info = findParentTable(state.selection.$from, state.doc);
        if (!info) return null;

        const { node: tableNode, start } = info;
        const corner = document.createElement("div");
        corner.className = "pm-corner-resize-handle";

        const deco = Decoration.widget(start + tableNode.nodeSize - 1, corner, {
          key: "corner",
        });

        return DecorationSet.create(state.doc, [deco]);
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;
          if (!target.classList.contains("pm-corner-resize-handle")) return false;

          event.preventDefault();

          const { state, dispatch } = view;
          const info = findParentTable(state.selection.$from, state.doc);
          if (!info) return false;

          const { node: tableNode, start } = info;
          const startX = event.clientX;

          const tableDom = view.nodeDOM(start - 1);
          let baseWidth = tableNode.attrs.tableWidth || 600;
          if (!tableNode.attrs.tableWidth && tableDom && tableDom.getBoundingClientRect) {
            baseWidth = Math.round(tableDom.getBoundingClientRect().width);
          }

          const cap = typeof getCap === "function" ? getCap() : baseWidth;

          const onMove = (e) => {
            const dx = e.clientX - startX;
            const next = Math.min(cap, Math.max(200, Math.round(baseWidth + dx)));

            const tr = state.tr.setNodeMarkup(
              start - 1,
              tableNode.type,
              { ...tableNode.attrs, tableWidth: next },
              tableNode.marks
            );
            dispatch(tr);
          };

          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };

          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
          return true;
        },
      },
    },
  });
}

/* ──────────────────────────────────────────────────────────────────────────────
 *  컴포넌트 본문
 * ──────────────────────────────────────────────────────────────────────────── */
export default function RichEditor({
  initialHTML,
  onChange,
  setEditorRef,
  getPageInnerWidth,
}) {
  /* -------------------------------------------------------------------------
   * TipTap editor 초기화
   * ----------------------------------------------------------------------- */
  const editor = useEditor({
    content: initialHTML || "",
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
        blockquote: false,
        codeBlock: false,
      }),

      // 폰트/폰트크기 제어
      TextStyle,
      FontSize,    // ← 추가: font-size 적용을 위한 커스텀 확장
      FontFamily,

      // 색/하이라이트
      Color,
      Highlight,

      // 기타 마크
      Underline,
      Subscript,
      Superscript,

      // 정렬: heading/paragraph에만 허용
      TextAlign.configure({ types: ["heading", "paragraph"] }),

      // 이미지: 컨테이너 폭 초과 방지
      Image.configure({
        allowBase64: true,
        HTMLAttributes: { style: "max-width:100%;height:auto;display:block;" },
      }),

      // 표: 확장된 Table/Row 사용
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: { style: "border:1px solid #000; padding:6px;" },
      }),
      TableCell.configure({
        HTMLAttributes: { style: "border:1px solid #000; padding:6px;" },
      }),

      // 빈 문서 안내
      Placeholder.configure({ placeholder: "문서 작성을 시작하세요..." }),

      // 글자수 세기(선택 사용)
      CharacterCount,
    ],

    editorProps: {
      attributes: {
        class: "tiptap prose max-w-none outline-none px-4 py-3 leading-relaxed",
      },
    },

    onUpdate: ({ editor }) => {
      try {
        onChange?.(editor.getHTML());
      } catch {}
    },
  });

  /* -------------------------------------------------------------------------
   *  라이프사이클: 플러그인 등록 + 스타일 주입
   * ----------------------------------------------------------------------- */
  useEffect(() => {
    if (!editor) return;

    const plugin = createCornerResizePlugin(() => {
      const cap = typeof getPageInnerWidth === "function" ? getPageInnerWidth() : undefined;
      return cap ?? 800;
    });
    editor.registerPlugin(plugin);

    const style = document.createElement("style");
    style.textContent = `
      .ProseMirror table { position: relative; }
      .ProseMirror .selectedCell {
        background: rgba(33,150,243,.12);
        outline: 2px solid rgba(33,150,243,.6);
        outline-offset: -2px;
      }
      .pm-corner-resize-handle {
        position: absolute;
        width: 12px;
        height: 12px;
        margin-left: -6px;
        margin-top: -6px;
        border: 1px solid rgba(0,0,0,.4);
        background: rgba(0,0,0,.06);
        cursor: se-resize !important;
        z-index: 3;
      }
      .ProseMirror .column-resize-handle {
        cursor: col-resize !important;
        z-index: 3;
      }
    `;
    document.head.appendChild(style);

    if (setEditorRef) setEditorRef(editor);

    return () => {
      try {
        editor.unregisterPlugin(plugin);
      } catch {}
      style.remove();
    };
  }, [editor, setEditorRef, getPageInnerWidth]);

  return <EditorContent editor={editor} />;
}
