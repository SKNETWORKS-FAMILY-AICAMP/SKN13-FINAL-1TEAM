// ✅ 파일 위치: src/components/DocumentEditor.jsx
//
// ────────────────────────────────────────────────────────────────
// 역할(Role)
//  - 문서 편집기 페이지 전체를 구성하는 컨테이너 컴포넌트.
//  - TipTap 기반 RichEditor + EditorToolbar(툴바) + 상단 앱바(저장/불러오기/AI 등).
//  - 파일 저장/불러오기, DOCX 내보내기, AI 편집, 로컬스토리지 자동 저장/복원,
//    단축키(Ctrl+S, Ctrl+O) 지원.
//  - 문서 제목 관리 및 Dirty 상태(*) 표시.
//
// 사용처(Expected Usage)
//  - 기능부/관리자 페이지에서 문서를 작성, 수정, 불러오기 할 때 사용.
//  - `RichEditor` (본문 편집기)와 `EditorToolbar` (서식 툴바)를 포함.
//  - 파일 시스템 연결: window.fsBridge (Electron preload.js)
//  - AI 편집 연결: streamLLM (services/llmApi.js)
//
// 주요 State
//  - documentTitle : 현재 문서 제목
//  - editorContent : HTML 형태의 본문 내용
//  - isDirty       : 저장되지 않은 변경 여부 (true일 때 제목에 * 붙음)
//  - editorRef     : TipTap 에디터 인스턴스 참조
//  - sessionId     : AI 편집 세션 식별용 (UUID)
//
// 함수 설명
//  - ErrorBoundary   : 에디터 내부에서 JS 오류 발생 시 안전하게 감싸주는 UI
//  - toSimpleHTML() : TXT/MD 불러올 때 줄바꿈 → <br> 변환
//  - handleSave()   : 현재 내용을 로컬 파일(html/txt/md)로 저장
//  - handleLoad()   : 파일 불러오기 (html/txt/md → HTML 변환 후 반영)
//  - handleExportDocx() : 현재 문서를 .docx 형식으로 내보내기
//  - handleEditWithAI(): LLM API(streamLLM) 호출해 자동 편집 실행
//  - handleClose()  : 닫기 버튼 → 미저장 확인 후 부모의 onClose 실행
//  - useEffect(keydown): Ctrl+S / Ctrl+O 단축키 바인딩
//
// 외부 연결(Dependency)
//  - RichEditor: 실제 본문 입력/렌더링
//  - EditorToolbar: 글꼴, 정렬, 표 삽입 등 서식 조작 툴바
//  - documentsApi.exportToDocx(): HTML → DOCX 변환
//  - llmApi.streamLLM(): 문서 내용 기반 AI 편집 호출
//  - window.fsBridge.showSaveDialog/saveDoc/showOpenDialog
//    → Electron preload에서 파일 입출력 연결
// ────────────────────────────────────────────────────────────────────────────────


import React, { useCallback, useEffect, useRef, useState } from "react";
import EditorToolbar from "./Editor/EditorToolbar";
import RichEditor from "./Editor/RichEditor";
import { exportToDocx } from "../../services/documentsApi";
import { saveAs } from "file-saver";
import { streamLLM } from "../../services/llmApi";

/** 간단 ErrorBoundary */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={hasError:false,error:null}; }
  static getDerivedStateFromError(error){ return {hasError:true,error}; }
  componentDidCatch(error, info){ console.error("DocEditor ErrorBoundary:", error, info); }
  render(){
    if(this.state.hasError){
      return (
        <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-700">
          <p className="font-semibold mb-1">문서 편집기에서 오류가 발생했습니다.</p>
          <p className="text-sm opacity-80">콘솔을 확인해 주세요.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// 간단 텍스트→HTML (txt/md 불러오기 변환)
function toSimpleHTML(text) {
  if (!text) return "";
  return text.replace(/\n/g, "<br>");
}

/** 페이지 컨테이너 */
export default function DocEditor({ onClose }) {
  const [documentTitle, setDocumentTitle] = useState("새 문서");
  const [isDirty, setIsDirty] = useState(false);
  const [editorContent, setEditorContent] = useState("<p>문서 작성을 시작하세요...</p>");
  const editorRef = useRef(null);
  const isLoadingRef = useRef(false);
  const [sessionId] = useState(() => crypto.randomUUID());

  // 다른 창에서 오는 문서 업데이트 반영 (preload의 onEditorUpdate 사용)
  useEffect(() => {
    const off = window.electron.onEditorUpdate((html) => {
      if (editorRef.current && !editorRef.current.isDestroyed) {
        editorRef.current.commands.setContent(html || "", false);
        setEditorContent(html || "");
        setIsDirty(true);
      }
    });
    return () => { typeof off === "function" && off(); };
  }, []);

  // 로컬 저장 복원
  useEffect(() => {
    try {
      const savedContent = localStorage.getItem("document-editor-content");
      const savedTitle = localStorage.getItem("document-editor-title");
      if (savedContent && savedContent !== "<p></p>") {
        setEditorContent(savedContent);
        setDocumentTitle(savedTitle || "이전 문서");
      }
    } catch {}
  }, []);

  /** 저장 */
  const handleSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    if (!window.fsBridge?.showSaveDialog || !window.fsBridge?.saveDoc) {
      alert("파일 저장 기능을 사용할 수 없습니다.");
      return;
    }
    const defaultName =
      documentTitle.match(/\.(txt|md|html)$/i) ? documentTitle : `${documentTitle}.html`;

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
      alert(`'${filePath}'이(가) 저장되었습니다.`);
      const fileName = filePath.split(/[\\/]/).pop();
      const newTitle = fileName || documentTitle;
      setDocumentTitle(newTitle);
      setIsDirty(false);
      setEditorContent(content);
      try {
        localStorage.setItem("document-editor-content", content);
        localStorage.setItem("document-editor-title", newTitle);
      } catch {}
    } catch (e) {
      alert(`저장 실패: ${e?.message || "알 수 없는 오류"}`);
    }
  }, [documentTitle]);

  /** 불러오기 */
  const handleLoad = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      if (!window.fsBridge?.showOpenDialog) {
        alert("파일 불러오기 기능을 사용할 수 없습니다.");
        return;
      }
      if (isDirty) {
        const proceed = confirm("저장되지 않은 변경 사항이 있습니다. 불러오시겠습니까?");
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
      // 파일 경로 기반으로 메인 프로세스에 직접 요청 (겸용 핸들러 가정)
      const resp = await window.electron.ipcRenderer.invoke("fs:readDoc", { filePath });
      const { ok, content, mime } = resp || {};
      if (!ok || !mime) { alert("파일을 읽는 중 문제가 발생했습니다."); return; }

      let processed = "";
      if (mime === "text/html") processed = content || "";
      else if (mime === "text/plain" || mime === "text/markdown") processed = toSimpleHTML(content || "");
      else { alert(`지원하지 않는 형식: ${mime}`); return; }

      editorRef.current?.commands.setContent(processed, false);
      setEditorContent(processed);
      setIsDirty(false);

      const fileName = filePath.split(/[\\/]/).pop();
      const newTitle = fileName || "문서";
      setDocumentTitle(newTitle);

      try {
        localStorage.setItem("document-editor-content", processed);
        localStorage.setItem("document-editor-title", newTitle);
      } catch {}
      alert(`'${filePath}' 불러오기 완료`);
    } catch (e) {
      alert(`파일 불러오기 실패: ${e?.message || "알 수 없는 오류"}`);
    } finally {
      isLoadingRef.current = false;
    }
  }, [isDirty]);

  /** DOCX로 내보내기 */
  const handleExportDocx = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.getHTML();
    if (!html || html === "<p></p>") { alert("내보낼 내용이 없습니다."); return; }
    const docxFilename = documentTitle.replace(/\.[^/.]+$/, "") + ".docx";
    try {
      const blob = await exportToDocx(html, docxFilename);
      saveAs(blob, docxFilename);
    } catch (e) {
      console.error("DOCX 내보내기 실패:", e);
      alert("DOCX 내보내기 중 오류가 발생했습니다.");
    }
  }, [documentTitle]);

  /** AI 편집 */
  const handleEditWithAI = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const userCommand = prompt("AI에게 문서 편집 명령을 내려주세요:");
    if (!userCommand) return;

    const current = editor.getHTML();
    if (!current || current === "<p></p>") { alert("편집할 내용이 없습니다."); return; }

    alert("AI가 문서를 편집 중입니다...");
    try {
      streamLLM({
        sessionId,
        prompt: userCommand,
        documentContent: current,
        onDelta: () => {},
        onToolMessage: (msg) => console.log("Tool Message:", msg),
        onDone: (full) => {
          try {
            const parsed = JSON.parse(full);
            if (parsed.document_update) {
              editor.commands.setContent(parsed.document_update, false);
              setEditorContent(parsed.document_update);
              setIsDirty(true);
              alert("AI 편집 완료!");
            } else {
              alert("AI 응답에 업데이트가 없습니다.");
            }
          } catch (e) {
            console.error("AI 응답 파싱 실패:", e);
            alert("AI 응답 처리 중 오류가 발생했습니다.");
          }
        },
        onError: (err) => {
          console.error("AI 편집 오류:", err);
          alert("AI 편집 중 오류가 발생했습니다: " + err.message);
        },
      });
    } catch (e) {
      console.error("streamLLM 호출 실패:", e);
      alert("AI 편집 기능을 시작할 수 없습니다.");
    }
  }, [sessionId]);

  /** 닫기 */
  const handleClose = useCallback(() => {
    if (isDirty) {
      const ok = confirm("저장되지 않은 변경 사항이 있습니다. 닫으시겠습니까?");
      if (!ok) return;
    }
    onClose?.();
  }, [isDirty, onClose]);

  /** 단축키 (Ctrl/Cmd+S, Ctrl/Cmd+O) */
  useEffect(() => {
    const onKeyDown = (e) => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); handleSave(); }
      if (k === "o") { e.preventDefault(); handleLoad(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, handleLoad]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-full rounded-xl border border-gray-200 bg-white">
        {/* 상단 앱바(파일 불러오기/저장/DOCX/AI/닫기) */}
        <div className="flex-shrink-0 p-2 border-b flex items-center justify-between">
          <span className="font-semibold text-gray-700 ml-2">
            {documentTitle} {isDirty && "*"}
          </span>
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
            <button onClick={handleEditWithAI} className="px-4 py-2 mr-2 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700">
              AI 편집
            </button>
            <button onClick={handleClose} className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600">
              닫기
            </button>
          </div>
        </div>

        {/* 서식 툴바 */}
        <EditorToolbar editor={editorRef.current} />

        {/* 본문 에디터 */}
        <div className="flex-1 overflow-y-auto" onClick={() => editorRef.current?.commands.focus()}>
          <RichEditor
            initialHTML={editorContent}              // ✅ prop 이름 맞춤
            setEditorRef={(editorInstance) => {      // ✅ setEditorRef로 인스턴스 전달
              editorRef.current = editorInstance;
              window.getTiptapEditorContent = () => editorInstance.getHTML();
            }}
            onChange={(html) => {
              setEditorContent(html);
              setIsDirty(true);
              try {
                localStorage.setItem("document-editor-content", html);
                localStorage.setItem("document-editor-title", documentTitle);
              } catch {}
            }}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}
