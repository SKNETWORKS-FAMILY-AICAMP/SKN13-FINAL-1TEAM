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
//  - editor        : TipTap 에디터 인스턴스 (✅ ref → state로 승격해 리렌더 보장)
//  - editorRef     : TipTap 에디터 인스턴스 참조(기존 호환용)
//  - sessionId     : AI 편집 세션 식별용 (UUID)
//
// 변경 사항 요약(툴바 표시 복구)
//  - ref 값으로 조건 렌더링하던 툴바를 state(editor) 기준으로 렌더하도록 수정
//  - RichEditor의 setEditorRef에서 setEditor(...) 호출해 최초 마운트 시 리렌더 유도
// ────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import EditorToolbar from "./Editor/EditorToolbar";
import RichEditor from "./Editor/RichEditor";
import * as documentsApi from "../../services/documentsApi";
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
  const [isContentLoaded, setIsContentLoaded] = useState(false); // ✅ [추가] 콘텐츠 로드 완료 플래그

  // ✅ ref는 유지하되,
  const editorRef = useRef(null);
  // ✅ 툴바 표시/리렌더를 위한 state 추가
  const [editor, setEditor] = useState(null);

  const isLoadingRef = useRef(false);
  const [sessionId] = useState(() => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-sess`));

  // 다른 창에서 오는 문서 업데이트 반영 (preload의 onEditorUpdate 사용)
  useEffect(() => {
    if (!window.electron?.onEditorUpdate) return;
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

  // ✅ [수정] 메인 프로세스에서 문서 내용 불러오고 로드 플래그 설정
  useEffect(() => {
    const loadFromMain = async () => {
      try {
        if (window.fsBridge?.getCurrentDocumentContent) {
          console.log("🔄 [DocEditor] 메인 프로세스에서 문서 내용 로딩 시도...");
          const contentFromMain = await window.fsBridge.getCurrentDocumentContent();
          if (contentFromMain) {
            console.log("✅ [DocEditor] 메인 프로세스에서 내용 로드 성공. 에디터에 적용합니다.");
            setEditorContent(contentFromMain);
            if (editorRef.current && !editorRef.current.isDestroyed) {
              editorRef.current.commands.setContent(contentFromMain, false);
            }
            setIsDirty(false);
          } else {
            console.log("ℹ️ [DocEditor] 메인 프로세스에 저장된 내용이 없습니다.");
          }
        }
      } catch (e) {
        console.error("❌ [DocEditor] 메인 프로세스에서 문서 내용 로딩 중 오류:", e);
      } finally {
        // ✅ 로드가 성공하든 실패하든, 초기 로드 시도가 끝났음을 표시
        setIsContentLoaded(true);
      }
    };

    loadFromMain();
  }, []); // 마운트 시 1회만 실행

  /** 저장 */
  const handleSave = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;

    // ✅ [수정] 새로 추가된 fsBridge.saveFile 함수를 사용하도록 변경
    if (!window.fsBridge?.showSaveDialog || !window.fsBridge?.saveFile) {
      alert("파일 저장 기능을 사용할 수 없습니다. (Bridge 함수 누락)");
      return;
    }
    const defaultName =
      documentTitle.match(/\.(txt|md|html)$/i) ? documentTitle : `${documentTitle}.html`;

    // 1. 저장 대화상자 띄우기
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
    if (canceled || !filePath) {
      return; // 사용자가 취소
    }

    // 2. 파일 내용 저장
    const content = ed.getHTML();
    try {
      // ✅ [수정] 새로운 saveFile IPC 핸들러 호출
      await window.fsBridge.saveFile({ filePath, content });

      alert(`'${filePath}'에 문서가 저장되었습니다.`);
      
      // 3. 상태 업데이트
      const fileName = filePath.split(/[\\/]/).pop();
      const newTitle = fileName || documentTitle;
      setDocumentTitle(newTitle);
      setIsDirty(false);
      setEditorContent(content); // 현재 컨텐츠를 저장된 컨텐츠로 동기화
      
      // 로컬스토리지에도 저장 (기존 로직 유지)
      try {
        localStorage.setItem("document-editor-content", content);
        localStorage.setItem("document-editor-title", newTitle);
      } catch {}
    } catch (e) {
      console.error("File save failed:", e);
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

      // ✅ 웹/미주입 환경 가드
      if (!window.electron?.ipcRenderer?.invoke) {
        alert("이 환경에서는 파일 읽기를 지원하지 않습니다.");
        return;
      }

      // 파일 경로 기반으로 메인 프로세스에 직접 요청
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
    const ed = editorRef.current;
    if (!ed) return;
    const html = ed.getHTML();
    if (!html || html === "<p></p>") { alert("내보낼 내용이 없습니다."); return; }
    const docxFilename = documentTitle.replace(/\.[^/.]+$/, "") + ".docx";
    try {
      const fn =
        documentsApi.exportToDocx ||
        documentsApi.exportDocx ||
        documentsApi.htmlToDocx ||
        documentsApi.default;
      if (!fn) {
        alert("DOCX 내보내기 함수가 없습니다. services/documentsApi.js를 확인하세요.");
        return;
      }
      const blob = await fn(html, docxFilename);
      saveAs(blob, docxFilename);
    } catch (e) {
      console.error("DOCX 내보내기 실패:", e);
      alert("DOCX 내보내기 중 오류가 발생했습니다.");
    }
  }, [documentTitle]);

  /** AI 편집 */
  const handleEditWithAI = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    const userCommand = prompt("AI에게 문서 편집 명령을 내려주세요:");
    if (!userCommand) return;

    const current = ed.getHTML();
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
              ed.commands.setContent(parsed.document_update, false);
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

  /** 현재 문서 내용을 IPC를 통해 main process에 저장 (ChatWindow에서 접근 가능하도록) */
  useEffect(() => {
    // ✅ [수정] 콘텐츠가 로드된 이후에만 저장 로직 실행
    if (!isContentLoaded) {
      return;
    }
    if (window.fsBridge?.setCurrentDocumentContent) {
      window.fsBridge.setCurrentDocumentContent(editorContent);
      console.log('📝 DocumentEditor: IPC로 문서 내용 저장됨:', editorContent.substring(0, 100) + '...');
    } else {
      console.warn('📝 DocumentEditor: fsBridge.setCurrentDocumentContent가 없습니다.');
    }
  }, [editorContent, isContentLoaded]); // ✅ 의존성 배열에 isContentLoaded 추가

  /** 챗봇에서 문서 업데이트 수신 - 전역 리스너로 중복 등록 방지 */
  useEffect(() => {
    if (window.__documentListenerRegistered) {
      console.log('📡 DocumentEditor: IPC 리스너 이미 등록됨, 스킵');
      return;
    }

    console.log('📡 DocumentEditor: IPC 리스너 등록 시도...');

    const handleDocumentUpdate = (updatedContent) => {
      console.log('📨 DocumentEditor: IPC 이벤트 수신됨!', updatedContent ? updatedContent.substring(0, 100) + '...' : 'null');
      const currentEditorElement = document.querySelector('.tiptap');
      if (!currentEditorElement || !updatedContent) {
        console.warn('📨 에디터 요소 또는 업데이트 내용이 없습니다');
        return;
      }
      try {
        if (window.__currentDocumentEditor) {
          const ed = window.__currentDocumentEditor;
          ed.commands.setContent(updatedContent, false);
          console.log('✅ 챗봇으로부터 문서가 업데이트되었습니다.');
          window.dispatchEvent(new CustomEvent('documentUpdated', { detail: updatedContent }));
        }
      } catch (error) {
        console.error('❌ 문서 업데이트 적용 중 오류:', error);
      }
    };

    if (window.fsBridge?.onDocumentUpdate && !window.__documentListenerRegistered) {
      console.log('✅ fsBridge.onDocumentUpdate 사용 가능, 리스너 등록 중...');
      const removeListener = window.fsBridge.onDocumentUpdate(handleDocumentUpdate);
      window.__documentListenerRegistered = true;
      window.__removeDocumentListener = removeListener;
      console.log('✅ IPC 리스너 전역 등록 완료');
    } else {
      console.warn('❌ fsBridge.onDocumentUpdate가 없거나 이미 등록됨');
    }
  }, []);

  // 현재 에디터를 전역에 저장 (IPC 핸들러에서 접근할 수 있도록)
  useEffect(() => {
    if (editorRef.current) {
      window.__currentDocumentEditor = editorRef.current;
    }
  }, [editorRef.current]);

  // 커스텀 이벤트로 상태 업데이트 처리
  useEffect(() => {
    const handleDocumentUpdated = (event) => {
      const updatedContent = event.detail;
      setEditorContent(updatedContent);
      setIsDirty(true);
    };

    window.addEventListener('documentUpdated', handleDocumentUpdated);
    return () => window.removeEventListener('documentUpdated', handleDocumentUpdated);
  }, []);

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

        {/* 서식 툴바 — ✅ editor state 기준으로 렌더 */}
        {editor ? (
          <EditorToolbar editor={editor} />
        ) : (
          <div className="h-10 border-b bg-white" />
        )}

        {/* 본문 에디터 */}
        <div className="flex-1 overflow-y-auto" onClick={() => editorRef.current?.commands.focus()}>
          <RichEditor
            initialHTML={editorContent}
            setEditorRef={(inst) => {
              // 기존 ref 유지
              editorRef.current = inst;
              // ✅ 최초 생성 시 state로도 보관 → 리렌더 발생 → 툴바 표시
              setEditor(inst);
              // 디버그/호환
              window.getTiptapEditorContent = () => inst.getHTML();
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