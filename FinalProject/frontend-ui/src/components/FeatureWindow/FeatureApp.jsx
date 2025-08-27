import React, { useCallback, useEffect, useRef, useState } from "react";
import { streamLLM } from "../services/llmApi";

// Tiptap Editor Imports
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

// API 및 파일 저장
import { exportToDocx } from "../services/documentsApi";
import { saveAs } from "file-saver";

// 기존 패널들 (필요 시 유지)
import FeatureHome from "./panels/FeatureHome";
import FeatureDocs from "./panels/FeatureDocs";
import FeatureCalendar from "./panels/FeatureCalendar";

/**
 * ErrorBoundary
 * - 렌더링 중 발생하는 예외로 전체 앱이 붕괴되는 것을 예방한다.
 * - 개발 단계에서 문제 지점을 명확히 하기 위해 간단한 경고 UI를 노출한다.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // 필요 시 로깅 시스템에 에러를 전송한다.
    console.error("ErrorBoundary caught: ", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-700">
          <p className="font-semibold mb-1">문서 편집기에서 오류가 발생했습니다.</p>
          <p className="text-sm opacity-80">콘솔을 확인해 주세요. (개발 환경에서만 표시)</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * MenuBar
 * - 에디터의 포맷팅 액션을 제공한다.
 * - editor가 준비되지 않은 동안에는 렌더링하지 않는다.
 */
const MenuBar = ({ editor }) => {
  if (!editor) return null;

  const buttonClass = (type, opts) =>
    editor.isActive(type, opts)
      ? "p-2 rounded-md bg-gray-200 text-gray-800 text-sm"
      : "p-2 rounded-md hover:bg-gray-100 text-gray-600 text-sm";

  return (
    <div className="p-2 border-b flex items-center flex-wrap gap-1">
      <button onClick={() => editor.chain().focus().toggleBold().run()} disabled={!editor.can().chain().focus().toggleBold().run()} className={buttonClass("bold")}>Bold</button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} disabled={!editor.can().chain().focus().toggleItalic().run()} className={buttonClass("italic")}>Italic</button>
      <button onClick={() => editor.chain().focus().toggleStrike().run()} disabled={!editor.can().chain().focus().toggleStrike().run()} className={buttonClass("strike")}>Strike</button>
      <button onClick={() => editor.chain().focus().setParagraph().run()} className={buttonClass("paragraph")}>Paragraph</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={buttonClass("heading", { level: 1 })}>H1</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={buttonClass("heading", { level: 2 })}>H2</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={buttonClass("heading", { level: 3 })}>H3</button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={buttonClass("bulletList")}>List</button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={buttonClass("orderedList")}>Num List</button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={buttonClass("blockquote")}>Quote</button>
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={buttonClass("codeBlock")}>Code</button>
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()}>HR</button>
      <div className="w-px h-6 bg-gray-200 mx-2"></div>
      <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().chain().focus().undo().run()}>Undo</button>
      <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().chain().focus().redo().run()}>Redo</button>
    </div>
  );
};

/**
 * 텍스트/마크다운을 간단한 HTML로 변환한다.
 * - markdown 전체 파서는 아니며, 라인 브레이크를 보존하는 수준으로 처리한다.
 */
function toSimpleHTML(text) {
  if (!text) return "";
  // 간단 변환: 줄바꿈 → <br>
  return text.replace(/\n/g, "<br>");
}

/**
 * DocumentEditor
 * - 파일 저장/불러오기, 로컬스토리지 자동 저장, 더티 플래그, 타이틀 관리 포함
 * - 편집기 상태를 외부에서 관리하여 탭 전환 시에도 상태를 유지한다.
 */
function DocumentEditor({
  onCloseEditor,
  initialContent = "",
  initialTitle = "새 문서",
  // 외부에서 관리할 상태들
  editorState,
  onEditorStateChange,
  setEditorRef // New prop
}) {
  const [documentTitle, setDocumentTitle] = useState(initialTitle);
  const [isDirty, setIsDirty] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID()); // Add sessionId state
  
  

  // StrictMode 또는 재마운트로 인한 중복 호출 방지 플래그
  const hasLoadedRef = useRef(false);
  const isLoadingRef = useRef(false);

  const editor = useEditor({
    extensions: [StarterKit],
    // 외부 상태가 있으면 그것을 사용, 없으면 초기 컨텐츠 사용
    content: editorState?.content || initialContent,
    autofocus: true,
    editorProps: {
      attributes: {
        class:
          "prose dark:prose-invert prose-sm sm:prose-base lg:prose-lg xl:prose-2xl m-5 focus:outline-none",
      },
    },
    // onUpdate 한 곳에서만 로컬스토리지와 더티 플래그를 갱신한다.
    onUpdate: ({ editor }) => {
      const content = editor.getHTML();
      
      // 더티 상태 업데이트
      setIsDirty(true);
      
      // 외부 상태 업데이트 (현재 제목 사용)
      onEditorStateChange?.((prevState) => ({
        ...prevState,
        content,
        title: prevState?.title || documentTitle,
        isDirty: true
      }));
      
      try {
        localStorage.setItem("document-editor-content", content);
        localStorage.setItem("document-editor-title", documentTitle);
      } catch (e) {
        console.warn("localStorage 저장 실패", e);
      }
    },
  });

  useEffect(() => {
    if (setEditorRef && editor) {
      setEditorRef(editor);
    }
    window.getTiptapEditorContent = () => {
      return editor.getHTML();
    };
    return () => {
      delete window.getTiptapEditorContent;
    };
  }, [editor, setEditorRef]);

  

  const handleEditDocumentWithAI = useCallback(async () => {
    if (!editor) return;

    const userCommand = prompt("AI에게 문서 편집 명령을 내려주세요:");
    if (!userCommand) return;

    const currentContent = editor.getHTML();
    if (!currentContent || currentContent === "<p></p>") {
      alert("편집할 내용이 없습니다.");
      return;
    }

    // Show a loading indicator or disable buttons
    // For now, just an alert
    alert("AI가 문서를 편집 중입니다. 잠시 기다려주세요...");

    try {
      streamLLM({
        sessionId,
        prompt: userCommand,
        documentContent: currentContent,
        onDelta: (delta, full) => {
          // Optional: Show streaming updates
          // editor.commands.setContent(full, false); // This might be too aggressive for Tiptap
        },
        onToolMessage: (toolMessage) => {
          console.log("Tool Message:", toolMessage);
          // Optional: Display tool messages to the user
        },
        onDone: (fullResponse) => {
          try {
            const parsedResponse = JSON.parse(fullResponse);
            if (parsedResponse.document_update) {
              editor.commands.setContent(parsedResponse.document_update, false);
              setIsDirty(true); // Mark as dirty after AI edit
              alert("AI가 문서를 성공적으로 편집했습니다!");
            } else {
              alert("AI 편집 결과에 문서 업데이트 내용이 없습니다.");
            }
          } catch (e) {
            console.error("Failed to parse AI response:", e);
            alert("AI 응답을 처리하는 중 오류가 발생했습니다.");
          }
        },
        onError: (error) => {
          console.error("AI 편집 중 오류 발생:", error);
          alert("AI 편집 중 오류가 발생했습니다: " + error.message);
        },
      });
    } catch (e) {
      console.error("streamLLM 호출 실패:", e);
      alert("AI 편집 기능을 시작할 수 없습니다.");
    }
  }, [editor, sessionId]);

  // 에디터가 마운트되면 포커스를 주고, 탭 전환 시에도 포커스 복원
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      // 약간의 지연 후 포커스 (DOM이 완전히 렌더링된 후)
      const timer = setTimeout(() => {
        editor.commands.focus();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [editor]);

  // 탭이 활성화될 때마다 에디터에 포커스 복원
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && editor && !editor.isDestroyed) {
        setTimeout(() => {
          editor.commands.focus();
        }, 100);
      }
    };

    const handleFocus = () => {
      if (editor && !editor.isDestroyed) {
        setTimeout(() => {
          editor.commands.focus();
        }, 100);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [editor]);

  // 외부 상태에서 제목과 더티 상태 동기화 (초기 설정 시에만)
  useEffect(() => {
    if (editorState && editorState.title && editorState.title !== documentTitle) {
      setDocumentTitle(editorState.title);
    }
  }, [editorState?.title]);

  useEffect(() => {
    if (editorState && typeof editorState.isDirty === 'boolean') {
      setIsDirty(editorState.isDirty);
    }
  }, [editorState?.isDirty]);

  // LOAD_FILE_PLACEHOLDER는 더 이상 사용하지 않음 - 파일 불러오기는 즉시 실행

  const handleSave = useCallback(async () => {
    if (!editor) return;

    if (!window.fsBridge?.showSaveDialog || !window.fsBridge?.saveDoc) {
      alert("파일 저장 기능을 사용할 수 없습니다.");
      return;
    }

    const defaultName =
      documentTitle.endsWith(".txt") ||
      documentTitle.endsWith(".md") ||
      documentTitle.endsWith(".html")
        ? documentTitle
        : `${documentTitle}.html`;

    const result = await window.fsBridge.showSaveDialog({
      title: "문서 저장",
      defaultPath: defaultName,
      filters: [
        { name: "HTML Files", extensions: ["html"] },
        { name: "Text Files", extensions: ["txt", "md"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    const { canceled, filePath } = result || {};
    if (canceled || !filePath) return;

    const content = editor.getHTML();

    try {
      await window.fsBridge.saveDoc({ filePath, content });
      alert(`'${filePath}'이(가) 성공적으로 저장되었습니다.`);
      const fileName = filePath.split(/[\\/]/).pop();
      const newTitle = fileName || documentTitle;
      
      setDocumentTitle(newTitle);
      setIsDirty(false);
      
      // 외부 상태 업데이트
      onEditorStateChange?.({
        content,
        title: newTitle,
        isDirty: false
      });
    } catch (e) {
      alert(`저장 실패: ${e?.message || "알 수 없는 오류"}`);
    }
  }, [documentTitle, editor, onEditorStateChange]);

  const handleExportDocx = useCallback(async () => {
    if (!editor) return;

    const htmlContent = editor.getHTML();
    const docxFilename = documentTitle.replace(/\.[^/.]+$/, "") + ".docx";

    if (!htmlContent || htmlContent === "<p></p>") {
      alert("내보낼 내용이 없습니다.");
      return;
    }

    try {
      console.log("DOCX 변환을 시작합니다...");
      const blob = await exportToDocx(htmlContent, docxFilename);
      saveAs(blob, docxFilename);
      console.log("성공적으로 DOCX 파일을 다운로드했습니다.");
    } catch (error) {
      console.error("DOCX 내보내기 실패:", error);
      alert("문서를 DOCX로 내보내는 중 오류가 발생했습니다.");
    }
  }, [editor, documentTitle]);

  const handleLoad = useCallback(async () => {
    if (isLoadingRef.current) return; // 다이얼로그 중복 방지
    isLoadingRef.current = true;

    try {
      if (!window.fsBridge?.showOpenDialog || !window.fsBridge?.readDoc) {
        alert("파일 불러오기 기능을 사용할 수 없습니다.");
        return;
      }

      if (isDirty) {
        const proceed = confirm(
          "저장되지 않은 변경 사항이 있습니다. 불러오시겠습니까? (변경 사항은 손실됩니다)"
        );
        if (!proceed) return;
      }

      const result = await window.fsBridge.showOpenDialog({
        title: "문서 열기",
        properties: ["openFile"],
        filters: [
          { name: "HTML Files", extensions: ["html"] },
          { name: "Text Files", extensions: ["txt", "md"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      const { canceled, filePaths } = result || {};
      if (canceled || !filePaths || filePaths.length === 0) return;

      const filePath = filePaths[0];
      const { content, mime } = (await window.fsBridge.readDoc(filePath)) || {};

      if (!mime) {
        alert("파일 형식을 확인할 수 없습니다.");
        return;
      }

      let processedContent = "";
      if (mime === "text/html") {
        processedContent = content || "";
      } else if (mime === "text/plain" || mime === "text/markdown") {
        processedContent = toSimpleHTML(content || "");
      } else {
        alert(`지원하지 않는 파일 형식입니다: ${mime}`);
        return;
      }

      editor?.commands.setContent(processedContent, false);

      alert(`'${filePath}'이(가) 성공적으로 불러와졌습니다.`);
      const fileName = filePath.split(/[\\/]/).pop();
      const newTitle = fileName || "문서";
      
      setDocumentTitle(newTitle);
      setIsDirty(false);

      // 외부 상태 업데이트
      onEditorStateChange?.({
        content: processedContent,
        title: newTitle,
        isDirty: false
      });

      try {
        localStorage.setItem("document-editor-content", processedContent);
        localStorage.setItem("document-editor-title", newTitle);
      } catch {}
    } catch (e) {
      alert(`파일 불러오기 실패: ${e?.message || "알 수 없는 오류"}`);
    } finally {
      isLoadingRef.current = false;
    }
  }, [editor, isDirty, onEditorStateChange]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      const ok = confirm(
        "저장되지 않은 변경 사항이 있습니다. 닫으시겠습니까? (변경 사항은 손실됩니다)"
      );
      if (!ok) return;
    }
    onCloseEditor?.();
  }, [isDirty, onCloseEditor]);

  // 저장/불러오기 단축키 (Ctrl/Cmd+S, Ctrl/Cmd+O)
  useEffect(() => {
    const onKeyDown = (e) => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleLoad();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleLoad, handleSave]);

  return (
    <div className="flex flex-col h-full rounded-xl border border-gray-200 bg-white">
      {/* 상단 바 */}
      <div className="flex-shrink-0 p-2 border-b flex items-center justify-between">
        <span className="font-semibold text-gray-700 ml-2">
          {documentTitle} {isDirty && "*"}
        </span>{/* 제목 옆에 * 표시 */}
        <div>
          <button onClick={handleLoad} className="px-4 py-2 mr-2 text-sm font-semibold rounded-xl bg-gray-500 text-white hover:bg-gray-600">
            불러오기
          </button>
          <button onClick={handleSave} className="px-4 py-2 mr-2 text-sm font-semibold rounded-xl bg-blue-500 text-white hover:bg-blue-600">
            저장
          </button>
          <button onClick={handleExportDocx} className="px-4 py-2 mr-2 text-sm font-semibold rounded-xl bg-green-600 text-white hover:bg-green-700">
            DOCX로 내보내기
          </button>
          <button onClick={handleEditDocumentWithAI} className="px-4 py-2 mr-2 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700">
            AI 편집
          </button>
          <button onClick={handleClose} className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600">
            닫기
          </button>
        </div>
      </div>

      {/* 에디터 툴바 */}
      <MenuBar editor={editor} />

      {/* 에디터 본문 */}
      <div className="flex-1 overflow-y-auto" onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/**
 * FeatureApp
 * - forms 탭에서 문서 편집기를 제공한다.
 * - 편집기 상태를 컴포넌트 레벨에서 관리하여 탭 전환 시에도 상태를 유지한다.
 */
export default function FeatureApp({ defaultTab = "docs", setDocumentEditorRef }) {
  const [isEditorActive, setIsEditorActive] = useState(false);
  const [editorInitialContent, setEditorInitialContent] = useState("");
  const [editorInitialTitle, setEditorInitialTitle] = useState("새 문서");
  
  // 편집기 상태를 상위 컴포넌트에서 관리
  const [editorState, setEditorState] = useState(null);

  // 앱 최초 로드시 로컬스토리지에서 마지막 상태를 복원한다.
  useEffect(() => {
    try {
      const savedContent = localStorage.getItem("document-editor-content");
      const savedTitle = localStorage.getItem("document-editor-title");
      if (savedContent && savedContent !== "<p></p>") {
        const state = {
          content: savedContent,
          title: savedTitle || "이전 문서",
          isDirty: false
        };
        setEditorState(state);
        setIsEditorActive(true);
        setEditorInitialContent(savedContent);
        setEditorInitialTitle(savedTitle || "이전 문서");
      }
    } catch (e) {
      console.warn("로컬스토리지 복원 실패", e);
    }
  }, []);

  const handleNewDocument = useCallback(() => {
    const initialContent = "<p>문서 작성을 시작하세요...</p>";
    const initialTitle = "새 문서";
    
    setEditorInitialContent(initialContent);
    setEditorInitialTitle(initialTitle);
    setEditorState({
      content: initialContent,
      title: initialTitle,
      isDirty: false
    });
    setIsEditorActive(true);
    
    try {
      localStorage.removeItem("document-editor-content");
      localStorage.removeItem("document-editor-title");
    } catch {}
  }, []);

  const handleLoadDocument = useCallback(async () => {
    try {
      if (!window.fsBridge?.showOpenDialog || !window.fsBridge?.readDoc) {
        alert("파일 불러오기 기능을 사용할 수 없습니다.");
        return;
      }

      // 현재 편집 중인 문서가 있고 저장되지 않은 변경사항이 있으면 확인
      if (editorState?.isDirty) {
        const proceed = confirm(
          "저장되지 않은 변경 사항이 있습니다. 불러오시겠습니까? (변경 사항은 손실됩니다)"
        );
        if (!proceed) return;
      }

      const result = await window.fsBridge.showOpenDialog({
        title: "문서 열기",
        properties: ["openFile"],
        filters: [
          { name: "HTML Files", extensions: ["html"] },
          { name: "Text Files", extensions: ["txt", "md"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      const { canceled, filePaths } = result || {};
      if (canceled || !filePaths || filePaths.length === 0) return;

      const filePath = filePaths[0];
      const { content, mime } = (await window.fsBridge.readDoc(filePath)) || {};

      if (!mime) {
        alert("파일 형식을 확인할 수 없습니다.");
        return;
      }

      let processedContent = "";
      if (mime === "text/html") {
        processedContent = content || "";
      } else if (mime === "text/plain" || mime === "text/markdown") {
        processedContent = toSimpleHTML(content || "");
      } else {
        alert(`지원하지 않는 파일 형식입니다: ${mime}`);
        return;
      }

      const fileName = filePath.split(/[\\/]/).pop();
      const newTitle = fileName || "문서";

      // 새로운 문서 상태로 설정
      const newState = {
        content: processedContent,
        title: newTitle,
        isDirty: false
      };

      setEditorState(newState);
      setEditorInitialContent(processedContent);
      setEditorInitialTitle(newTitle);
      setIsEditorActive(true);

      try {
        localStorage.setItem("document-editor-content", processedContent);
        localStorage.setItem("document-editor-title", newTitle);
      } catch {}

      alert(`'${filePath}'이(가) 성공적으로 불러와졌습니다.`);
    } catch (e) {
      alert(`파일 불러오기 실패: ${e?.message || "알 수 없는 오류"}`);
    }
  }, [editorState]);

  const handleCloseEditor = useCallback(() => {
    setIsEditorActive(false);
    setEditorState(null);
    try {
      localStorage.removeItem("document-editor-content");
      localStorage.removeItem("document-editor-title");
    } catch {}
  }, []);

  const handleEditorStateChange = useCallback((newState) => {
    setEditorState(newState);
  }, []);

  // forms 탭에서는 문서 편집기를 보여준다.
  if (defaultTab === "forms") {
    return (
      <ErrorBoundary>
        <div className="h-full">
          {isEditorActive ? (
            <DocumentEditor
              onCloseEditor={handleCloseEditor}
              initialContent={editorInitialContent}
              initialTitle={editorInitialTitle}
              editorState={editorState}
              onEditorStateChange={handleEditorStateChange}
              setEditorRef={setDocumentEditorRef} // Pass the ref setter
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full rounded-xl border border-gray-200 bg-white text-gray-600">
              <p className="text-xl mb-6">시작하려면 새 문서를 만들거나 기존 문서를 불러오세요!</p>
              <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 w-full max-w-md">
                <button
                  onClick={handleNewDocument}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 px-8 rounded-lg text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
                >
                  새 문서
                </button>
                <button
                  onClick={handleLoadDocument}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-6 px-8 rounded-lg text-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
                >
                  문서 불러오기
                </button>
              </div>
            </div>
          )}
        </div>
      </ErrorBoundary>
    );
  }

  // 기존 로직 유지
  if (defaultTab === "docs") return <FeatureDocs />;
  if (defaultTab === "calendar") return <FeatureCalendar />;
  if (defaultTab === "home") return <FeatureHome />;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-gray-600">선택된 탭이 없어요.</p>
    </div>
  );
}
