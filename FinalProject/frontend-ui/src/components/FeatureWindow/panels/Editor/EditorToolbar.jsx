/**
 * 에디터 서식 툴바
 * - TipTap editor 인스턴스를 받아 Bold/Italic/Heading/List/Quote/Code/HR/Undo/Redo를 제공한다.
 * - 버튼 활성화/비활성은 editor.can()으로 체크하여 UX 오류를 방지한다.
 */

import React from "react";

export default function EditorToolbar({ editor }) {
  if (!editor) return null;

  const btn = (type, opts) =>
    editor.isActive(type, opts)
      ? "p-2 rounded-md bg-gray-200 text-gray-800 text-sm"
      : "p-2 rounded-md hover:bg-gray-100 text-gray-600 text-sm";

  return (
    <div className="p-2 border-b flex items-center flex-wrap gap-1">
      {/* 기본 서식 */}
      <button onClick={() => editor.chain().focus().toggleBold().run()}
              disabled={!editor.can().chain().focus().toggleBold().run()}
              className={btn("bold")}>Bold</button>

      <button onClick={() => editor.chain().focus().toggleItalic().run()}
              disabled={!editor.can().chain().focus().toggleItalic().run()}
              className={btn("italic")}>Italic</button>

      <button onClick={() => editor.chain().focus().toggleStrike().run()}
              disabled={!editor.can().chain().focus().toggleStrike().run()}
              className={btn("strike")}>Strike</button>

      {/* 문단/헤딩 */}
      <button onClick={() => editor.chain().focus().setParagraph().run()}
              className={btn("paragraph")}>Paragraph</button>

      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={btn("heading", { level: 1 })}>H1</button>

      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={btn("heading", { level: 2 })}>H2</button>

      <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={btn("heading", { level: 3 })}>H3</button>

      {/* 리스트/인용/코드/구분선 */}
      <button onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={btn("bulletList")}>List</button>

      <button onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={btn("orderedList")}>Num List</button>

      <button onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={btn("blockquote")}>Quote</button>

      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={btn("codeBlock")}>Code</button>

      <button onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        HR
      </button>

      {/* 편집 히스토리 */}
      <div className="w-px h-6 bg-gray-200 mx-2" />
      <button onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().chain().focus().undo().run()}>
        Undo
      </button>
      <button onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().chain().focus().redo().run()}>
        Redo
      </button>
    </div>
  );
}
