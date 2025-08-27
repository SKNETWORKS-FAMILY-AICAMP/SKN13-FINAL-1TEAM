/**
 * 본문 에디터(RichEditor)
 * - TipTap 에디터 인스턴스를 생성/관리한다.
 * - onReady(editor)로 상위에 인스턴스를 전달하여 컨테이너가 파일/AI 기능에 접근할 수 있게 한다.
 * - onChange(html)로 본문 변경을 상위에 통지한다(Dirty 관리·로컬 저장 등).
 * - ChatWindow에서 문서 본문을 조회할 수 있도록 window.getTiptapEditorContent를 등록한다.
 * - 이미지/표 등 추가 확장은 TipTap Extension을 설치 후 아래 extensions 배열에 추가하면 된다.
 */

import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
// (옵션) 이미지/표를 쓰려면 아래 확장을 설치 후 주석 해제해 extensions에 추가하세요.
// import Image from "@tiptap/extension-image";
// import Table from "@tiptap/extension-table";
// import TableRow from "@tiptap/extension-table-row";
// import TableCell from "@tiptap/extension-table-cell";
// import TableHeader from "@tiptap/extension-table-header";

export default function RichEditor({
  initialContent = "<p>문서 작성을 시작하세요...</p>",
  onReady,   // editor 인스턴스 전달
  onChange,  // html 변경 콜백
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      // Image,
      // Table.configure({ resizable: true }),
      // TableRow, TableHeader, TableCell,
    ],
    content: initialContent,
    autofocus: true,
    editorProps: {
      attributes: {
        class:
          "prose dark:prose-invert prose-sm sm:prose-base lg:prose-lg xl:prose-2xl m-5 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  /** 에디터 준비 시 상위에 인스턴스 전달 + 외부 접근 훅 등록 */
  useEffect(() => {
    if (!editor) return;

    onReady?.(editor);

    // ChatWindow나 다른 모듈이 현재 본문을 필요로 할 때 사용할 수 있는 전역 함수
    window.getTiptapEditorContent = () => editor.getHTML();

    return () => {
      delete window.getTiptapEditorContent;
    };
  }, [editor, onReady]);

  /** 포커스 편의 처리: 처음 마운트/탭 복귀/윈도 포커스 시 커서 복원 */
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const t = setTimeout(() => editor.commands.focus(), 120);
    const onVis = () => { if (!document.hidden) setTimeout(() => editor.commands.focus(), 80); };
    const onWin = () => { setTimeout(() => editor.commands.focus(), 80); };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onWin);

    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onWin);
    };
  }, [editor]);

  return <EditorContent editor={editor} />;
}
