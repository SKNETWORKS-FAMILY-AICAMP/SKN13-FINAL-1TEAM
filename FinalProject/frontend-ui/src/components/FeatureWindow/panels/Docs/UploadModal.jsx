/* 
===============================================================================
📦 UploadModal.jsx — S3 업로드 모달 (✅ 프리사인드 전용으로 일원화)
-------------------------------------------------------------------------------
[변경 요약]
- ⛔️ window.s3Shared.uploadFromPath(브릿지 직행) 전부 제거
- ✅ 모든 업로드는 services/uploadPresigned의 uploadFileWithDedup(File, {...}) 사용
- ✅ 파일 추가는 "드래그&드롭" + "네이티브 파일 선택기(input[type=file])"로만 수행
  → 항상 File 객체로 처리되어 프리사인드 경로를 탈 수 있음
- ✅ 업로드 중단(AbortSignal) 연동, UI 락/중복방어(클릭락) 유지

[참고]
- 과거 "내장 문서 선택기(listDocs → 경로 문자열 추가)" 방식을 계속 쓰려면,
  Electron preload에 "경로→바이트 읽기(readBytes)"를 제공하고, 그 바이트로
  Blob/File을 만들어 프리사인드 업로드를 호출해야 함(현재는 미사용).
===============================================================================
*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadFileWithDedup } from "../../../services/uploadPresigned"; // ✅ 프리사인드 업로드 유틸

export default function UploadModal({
  open,
  onClose,
  onUploaded,
  pathHint,     // ✅ 공유폴더 등 저장 대상 경로 힌트(백엔드가 지원하면 presigned key 생성에 사용)
  sessionId,    // 선택: 세션/소유자 메타 전달용
}) {
  /* ----------------------------- State & Refs ----------------------------- */
  const [files, setFiles] = useState([]);        // ✅ 항상 File 객체만 보관
  const [uploading, setUploading] = useState(false);
  const uploadLockRef = useRef(false);           // 🔒 더블클릭/연속 호출 락
  const abortRef = useRef(null);                 // 업로드 중단용 AbortController
  const fileInputRef = useRef(null);             // 네이티브 파일 선택기

  /* --------------------------- Helpers / Utils ---------------------------- */
  const normalizePath = (p) => (p || "").replaceAll("\\", "/");

  // 파일 병합(중복 제거: 동일 path/name은 덮어씀)
  const addFiles = useCallback((newFiles = []) => {
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [normalizePath(f.path || f.name), f]));
      for (const f of newFiles) {
        if (!(f instanceof File)) continue;
        const key = normalizePath(f.path || f.name);
        map.set(key, f);
      }
      return Array.from(map.values());
    });
  }, []);

  const clearAll = () => setFiles([]);
  const removeAt = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  /* ------------------------- Drag & Drop (Global) ------------------------- */
  useEffect(() => {
    if (!open) return;

    const preventAll = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    const onWindowDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dropped = Array.from(e.dataTransfer?.files || []);
      if (dropped.length) addFiles(dropped);
    };

    window.addEventListener("dragover", preventAll, { passive: false });
    window.addEventListener("drop", onWindowDrop, { passive: false });
    document.addEventListener("dragover", preventAll, { passive: false });
    document.addEventListener("drop", preventAll, { passive: false });

    return () => {
      window.removeEventListener("dragover", preventAll);
      window.removeEventListener("drop", onWindowDrop);
      document.removeEventListener("dragover", preventAll);
      document.removeEventListener("drop", preventAll);
    };
  }, [open, addFiles]);

  /* ----------------------- Drag & Drop (Local Zone) ----------------------- */
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dropped = Array.from(e.dataTransfer?.files || []);
    if (dropped.length) addFiles(dropped);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  /* --------------------------- File Picker(open) -------------------------- */
  const openNativePicker = () => {
    fileInputRef.current?.click?.();
  };
  const onInputFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) addFiles(picked);
    // 같은 파일 재선택 가능하게 value 초기화
    e.target.value = "";
  };

  /* ------------------------------- Upload --------------------------------- */
  const handleUpload = async () => {
    if (!files.length) return;
    if (uploadLockRef.current || uploading) return; // 🔒 락
    uploadLockRef.current = true;
    setUploading(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      // 순차 업로드(네트워크/서명 TTL 고려). 병렬 원하면 Promise.all로 교체 가능.
      for (const f of files) {
        await uploadFileWithDedup(f, {
          signal: ac.signal,
          sessionId,
          pathHint: pathHint || "", // 백엔드에서 지원 시 presigned key 생성에 반영
        });
      }
      onUploaded?.();
      onClose?.();
    } catch (err) {
      if (err?.name === "AbortError") {
        console.warn("[UploadModal] 업로드가 중단되었습니다.");
      } else {
        console.error("[UploadModal] 업로드 실패:", err);
        alert("업로드 중 오류가 발생했습니다.");
      }
    } finally {
      setUploading(false);
      uploadLockRef.current = false; // 🔓 락 해제
      abortRef.current = null;
    }
  };

  // 모달 닫힘/언마운트 시 업로드 중이면 중단
  useEffect(() => {
    if (!open && abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
  }, [open]);

  /* ----------------------------- Render Guard ----------------------------- */
  if (!open) return null;

  /* --------------------------------- JSX ---------------------------------- */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-[720px] max-w-[95vw]">
        {/* Header */}
        <div className="px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">S3에 파일 업로드</h3>
          <p className="text-xs text-gray-500 mt-1">
            “파일 선택” 또는 아래 영역으로 드래그해서 업로드할 파일을 추가하세요.
            (프리사인드 전용 · 브릿지 직행 업로드는 지원하지 않습니다)
          </p>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* 드롭존 */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            className="border-2 border-dashed rounded-xl p-6 text-center text-sm text-gray-500"
          >
            여기에 파일을 끌어다 놓으세요
            <div className="mt-2 text-xs text-gray-400">
              모달이 열려 있는 동안 창 전역 드롭도 활성화됩니다.
            </div>
          </div>

          {/* 선택된 파일 목록 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-gray-600">선택한 파일</label>
              {files.length > 0 && (
                <button className="text-xs text-gray-500 underline" onClick={clearAll}>
                  모두 비우기
                </button>
              )}
            </div>

            {files.length === 0 ? (
              <div className="text-sm text-gray-400">아직 선택된 파일이 없습니다.</div>
            ) : (
              <ul className="max-h-44 overflow-auto text-sm divide-y border rounded-lg">
                {files.map((f, i) => (
                  <li key={(f.path || f.name) + i} className="flex items-center justify-between px-3 py-2">
                    <span className="truncate mr-3">{f.name || f.path}</span>
                    <button
                      className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                      onClick={() => removeAt(i)}
                    >
                      제거
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-between">
          {/* 네이티브 파일 선택 버튼 */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onInputFiles}
            />
            <button className="px-3 py-2 rounded-lg border hover:bg-gray-50" onClick={openNativePicker}>
              파일 선택
            </button>
          </div>

          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-lg border hover:bg-gray-50" onClick={onClose}>
              취소
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
              disabled={uploading || files.length === 0}
              onClick={handleUpload}
            >
              {uploading ? "업로드 중…" : "업로드"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
