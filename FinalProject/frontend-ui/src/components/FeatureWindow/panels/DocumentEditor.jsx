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
// import { streamLLM } from "../../services/llmApi"; // AI편집 기능 주석처리로 인해 불필요

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

// ✅ [추가] Blob을 Base64 문자열로 변환하는 헬퍼 함수
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // "data:*/*;base64," 접두사 제거
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** 페이지 컨테이너 */
export default function DocEditor({ onClose }) {
  const [documentTitle, setDocumentTitle] = useState("새 문서");
  const [isDirty, setIsDirty] = useState(false);
  const [editorContent, setEditorContent] = useState("<p>문서 작성을 시작하세요...</p>");
  const [isContentLoaded, setIsContentLoaded] = useState(false); // ✅ [추가] 콘텐츠 로드 완료 플래그
  const [isEditingTitle, setIsEditingTitle] = useState(false); // 제목 편집 상태
  const [tempTitle, setTempTitle] = useState(""); // 편집 중인 제목 임시 저장

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

  // ✅ [NEW] 챗봇에서 온 문서 열기 요청 처리
  useEffect(() => {
    if (!window.fsBridge?.onDocumentOpenFromChat) return;

    const handleDocumentOpen = (data) => {
      console.log('📄 [DocEditor] 챗봇에서 문서 열기 요청 받음:', data);

      try {
        // IPC 데이터에서 문서 정보 추출
        const ipc_data = data.ipc_data || data;
        const documentData = ipc_data.document || {};
        const content = documentData.content || "";
        const filename = documentData.filename || "문서";

        console.log('📄 [DocEditor] 추출된 데이터:', { filename, contentLength: content.length });

        // 에디터에 내용 설정
        if (editorRef.current && !editorRef.current.isDestroyed) {
          editorRef.current.commands.setContent(content, false);
        }

        setEditorContent(content);
        setDocumentTitle(filename);
        setIsDirty(false);

        // 로컬스토리지에도 저장
        try {
          localStorage.setItem("document-editor-content", content);
          localStorage.setItem("document-editor-title", filename);
        } catch (e) {
          console.warn('로컬스토리지 저장 실패:', e);
        }

        console.log('✅ [DocEditor] 챗봇 요청 문서 로드 완료');

      } catch (error) {
        console.error('❌ [DocEditor] 챗봇 문서 로드 중 오류:', error);
      }
    };

    const off = window.fsBridge.onDocumentOpenFromChat(handleDocumentOpen);
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
    
    // ✅ [수정] 새로 추가된 fsBridge 함수를 사용하도록 변경
    if (!window.fsBridge?.showOpenDialog || !window.fsBridge?.readFileByPath) {
      alert("파일 불러오기 기능을 사용할 수 없습니다. (Bridge 함수 누락)");
      return;
    }

    if (isDirty) {
      const proceed = confirm("저장되지 않은 변경 사항이 있습니다. 계속하시겠습니까?");
      if (!proceed) return;
    }

    isLoadingRef.current = true;

    try {
      // 1. 파일 열기 대화상자 띄우기
      const result = await window.fsBridge.showOpenDialog({
        title: "문서 열기",
        properties: ["openFile"],
        filters: [
          { name: "HTML Files", extensions: ["html"] },
          { name: "Word Documents", extensions: ["docx"] },
          { name: "Text Files", extensions: ["txt", "md"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      const { canceled, filePaths } = result || {};
      if (canceled || !filePaths || filePaths.length === 0) {
        return; // 사용자가 취소
      }
      const filePath = filePaths[0];

      // 2. 파일 확장자 확인 및 처리
      const fileExtension = filePath.toLowerCase().split('.').pop();
      const fileName = filePath.split(/[\\/]/).pop();
      let processedContent = "";
      let newTitle = fileName || "문서";

      if (fileExtension === 'docx') {
        // DOCX 파일 처리
        try {
          console.log('DOCX 파일 변환 시작:', filePath);
          const docxResult = await window.fsBridge.convertDocxToHtml(filePath);
          
          if (!docxResult.success) {
            alert(`DOCX 파일 변환에 실패했습니다: ${docxResult.error}`);
            return;
          }
          
          let docxHtml = docxResult.html || "";
          console.log('DOCX 변환 완료, HTML 길이:', docxHtml.length);
          
          // DOCX에서 제목과 본문 분리 처리
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = docxHtml;
          
          // 첫 번째 h1 태그를 찾아서 제목으로 사용
          const firstH1 = tempDiv.querySelector('h1');
          let extractedTitle = null;
          
          if (firstH1 && firstH1.textContent && firstH1.textContent.trim()) {
            extractedTitle = firstH1.textContent.trim();
            console.log('DOCX에서 추출한 제목:', extractedTitle);
            
            // 제목을 본문에서 제거
            firstH1.remove();
          }
          
          // 본문만 남김
          processedContent = tempDiv.innerHTML.trim();
          
          // 제목이 추출되었다면 문서 제목으로 설정
          if (extractedTitle) {
            // 파일명에서 확장자 제거한 것과 추출된 제목 중 선택
            const fileBaseName = fileName.replace(/\.[^/.]+$/, "");
            // 추출된 제목을 우선 사용, 없으면 파일명 사용
            newTitle = extractedTitle || fileBaseName;
          }
          
          console.log('제목 분리 후 - 제목:', newTitle, '본문 길이:', processedContent.length);
          
          // 변환 중 발생한 메시지가 있으면 콘솔에 출력
          if (docxResult.messages && docxResult.messages.length > 0) {
            console.log('DOCX 변환 메시지:', docxResult.messages);
          }
        } catch (error) {
          console.error('DOCX 변환 오류:', error);
          alert(`DOCX 파일 처리 중 오류가 발생했습니다: ${error.message}`);
          return;
        }
      } else {
        // 기존 파일 형식 처리 (HTML, TXT, MD)
        const resp = await window.fsBridge.readFileByPath({ filePath });
        const { ok, content, mime, reason } = resp || {};

        if (!ok) {
          alert(`파일을 읽는 중 문제가 발생했습니다: ${reason || "알 수 없는 오류"}`);
          return;
        }

        // 3. 에디터에 내용 적용
        if (mime === "text/html") {
          processedContent = content || "";
        } else if (mime === "text/plain" || mime === "text/markdown") {
          processedContent = toSimpleHTML(content || "");
        } else {
          alert(`지원하지 않는 파일 형식입니다: ${mime}`);
          return;
        }
      }

      editorRef.current?.commands.setContent(processedContent, false);
      setEditorContent(processedContent);
      setIsDirty(false);

      // 4. 상태 업데이트
      setDocumentTitle(newTitle);

      // 로컬스토리지에도 저장 (기존 로직 유지)
      try {
        localStorage.setItem("document-editor-content", processedContent);
        localStorage.setItem("document-editor-title", newTitle);
      } catch {} 
      
      alert(`'${filePath}' 파일을 불러왔습니다.`);

    } catch (e) {
      console.error("File load failed:", e);
      alert(`파일 불러오기 실패: ${e?.message || "알 수 없는 오류"}`);
    } finally {
      isLoadingRef.current = false;
    }
  }, [isDirty]);

  /** DOCX로 내보내기 */
  const handleExportDocx = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    let html = ed.getHTML();
    if (!html || html === "<p></p>") { alert("내보낼 내용이 없습니다."); return; }
    
    const docxFilename = documentTitle.replace(/\.[^/.]+$/, "") + ".docx";
    
    try {
      // 1. DOCX 데이터를 Blob 형태로 생성 (API 또는 클라이언트 라이브러리)
      const blob = await documentsApi.exportToDocx(html, docxFilename, documentTitle);
      if (!blob) {
        throw new Error("DOCX 데이터 생성에 실패했습니다.");
      }

      // 2. Electron의 저장 대화상자 호출
      const result = await window.fsBridge.showSaveDialog({
        title: "DOCX로 내보내기",
        defaultPath: docxFilename,
        filters: [{ name: "Word Documents", extensions: ["docx"] }, { name: "All Files", extensions: ["*"] }],
      });

      const { canceled, filePath } = result || {};
      if (canceled || !filePath) {
        return; // 사용자가 취소
      }
      
      // 3. Blob을 Base64로 변환
      const base64Content = await blobToBase64(blob);

      // 4. Main 프로세스에 파일 저장 요청 (Base64)
      await window.fsBridge.saveFile({
        filePath,
        content: base64Content,
        encoding: 'base64'
      });
      
      // 5. 저장이 완료된 후 알림창 표시
      alert(`'${filePath}'로 문서가 저장되었습니다.`);

    } catch (e) {
      console.error("DOCX 내보내기 실패:", e);
      alert("DOCX 내보내기 중 오류가 발생했습니다.");
    }
  }, [documentTitle]);

  /** 제목 편집 시작 */
  const handleStartEditTitle = useCallback(() => {
    setTempTitle(documentTitle);
    setIsEditingTitle(true);
  }, [documentTitle]);

  /** 제목 편집 완료 */
  const handleFinishEditTitle = useCallback(() => {
    if (tempTitle.trim() && tempTitle.trim() !== documentTitle) {
      setDocumentTitle(tempTitle.trim());
      setIsDirty(true);
      
      // 로컬스토리지에도 저장
      try {
        localStorage.setItem("document-editor-title", tempTitle.trim());
      } catch {}
    }
    setIsEditingTitle(false);
    setTempTitle("");
  }, [tempTitle, documentTitle]);

  /** 제목 편집 취소 */
  const handleCancelEditTitle = useCallback(() => {
    setIsEditingTitle(false);
    setTempTitle("");
  }, []);

  /** 제목 입력 핸들러 */
  const handleTitleInputChange = useCallback((e) => {
    setTempTitle(e.target.value);
  }, []);

  /** 제목 입력 키 핸들러 */
  const handleTitleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFinishEditTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEditTitle();
    }
  }, [handleFinishEditTitle, handleCancelEditTitle]);

  /** 제목 편집 모드 진입 시 텍스트 선택 */
  useEffect(() => {
    if (isEditingTitle) {
      // input이 렌더링된 후 텍스트 선택
      const timer = setTimeout(() => {
        const input = document.querySelector('input[placeholder="문서 제목을 입력하세요"]');
        if (input) {
          input.select();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isEditingTitle]);

  /** AI 편집 - 주석처리 (필요없음) */
  // const handleEditWithAI = useCallback(async () => {
  //   const ed = editorRef.current;
  //   if (!ed) return;
  //   const userCommand = prompt("AI에게 문서 편집 명령을 내려주세요:");
  //   if (!userCommand) return;

  //   const current = ed.getHTML();
  //   if (!current || current === "<p></p>") { alert("편집할 내용이 없습니다."); return; }

  //   alert("AI가 문서를 편집 중입니다...");
  //   try {
  //     streamLLM({
  //       sessionId,
  //       prompt: userCommand,
  //       documentContent: current,
  //       onDelta: () => {}, 
  //       onToolMessage: (msg) => console.log("Tool Message:", msg),
  //       onDone: (full) => {
  //         try {
  //           const parsed = JSON.parse(full);
  //           if (parsed.document_update) {
  //             ed.commands.setContent(parsed.document_update, false);
  //             setEditorContent(parsed.document_update);
  //             setIsDirty(true);
  //             alert("AI 편집 완료!");
  //           } else {
  //             alert("AI 응답에 업데이트가 없습니다.");
  //           }
  //         } catch (e) {
  //           console.error("AI 응답 파싱 실패:", e);
  //           alert("AI 응답 처리 중 오류가 발생했습니다.");
  //         }
  //       },
  //       onError: (err) => {
  //         console.error("AI 편집 오류:", err);
  //         alert("AI 편집 중 오류가 발생했습니다: " + err.message);
  //       },
  //     });
  //   } catch (e) {
  //     console.error("streamLLM 호출 실패:", e);
  //     alert("AI 편집 기능을 시작할 수 없습니다.");
  //   }
  // }, [sessionId]);

  /** 닫기 - 주석처리 (필요없음) */
  // const handleClose = useCallback(() => {
  //   if (isDirty) {
  //     const ok = confirm("저장되지 않은 변경 사항이 있습니다. 닫으시겠습니까?");
  //     if (!ok) return;
  //   }
  //   onClose?.();
  // }, [isDirty, onClose]);

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
        {/* 상단 전체 영역 (헤더 + 툴바) - 고정 및 하얀색 배경 */}
        <div className="fixed z-20 bg-white" style={{ top: '40px', paddingTop: '0px' }}>
          {/* 상단 앱바(파일 불러오기/저장/DOCX/AI/닫기) */}
          <div className="flex-shrink-0 p-2 border-b flex items-center justify-between">
            <div className="flex items-center ml-2 flex-1 mr-4">
              {isEditingTitle ? (
                /* 제목 편집 모드 */
                <input
                  type="text"
                  value={tempTitle}
                  onChange={handleTitleInputChange}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={handleFinishEditTitle}
                  className="font-semibold text-gray-700 bg-transparent border-b-2 border-blue-500 outline-none px-1 py-1 w-full max-w-none"
                  placeholder="문서 제목을 입력하세요"
                  autoFocus
                  style={{ fontSize: 'inherit' }}
                />
              ) : (
                /* 제목 표시 모드 */
                <span 
                  className="font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors duration-200 truncate max-w-full"
                  onClick={handleStartEditTitle}
                  title="클릭하여 제목 편집"
                >
                  {documentTitle} {isDirty && "*"}
                </span>
              )}
            </div>
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
              {/* AI편집 버튼 주석처리 - 필요없음 */}
              {/* <button onClick={handleEditWithAI} className="px-4 py-2 mr-2 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700">
                AI 편집
              </button> */}
              {/* 닫기 버튼 주석처리 - 필요없음 */}
              {/* <button onClick={handleClose} className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600">
                닫기
              </button> */}
            </div>
          </div>

          {/* 서식 툴바 */}
          <div className="flex-shrink-0 border-b">
            {editor ? (
              <EditorToolbar editor={editor} />
            ) : (
              <div className="h-10" />
            )}
          </div>
        </div>

        {/* 본문 에디터 */}
        <div className="flex-1 overflow-y-auto bg-white" style={{ marginTop: '150px' }} onClick={() => editorRef.current?.commands.focus()}>
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