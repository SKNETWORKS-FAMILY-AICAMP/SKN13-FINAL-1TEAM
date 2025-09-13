// DocumentButtons.jsx - 문서 선택 버튼 컴포넌트

import React from 'react';

export default function DocumentButtons({ documentSelection, sessionId, onDocumentClick }) {
  if (!documentSelection || !documentSelection.documents) {
    return null;
  }

  const { documents, query } = documentSelection;

  const handleButtonClick = async (document) => {
    try {
      console.log('📄 문서 버튼 클릭:', document.filename);
      
      // 액션 타입에 따른 처리
      const actionType = document.action_type || 'open_editor';
      
      if (actionType === 'download') {
        // 직접 다운로드 처리
        await handleDirectDownload(document);
      } else if (actionType === 'open_editor') {
        // 지원하는 파일: 문서편집창에서 열기
        const response = await fetch('/api/v1/chat/document/open', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('userToken')}`
          },
          body: JSON.stringify({
            document_id: document.id,
            document_data: document.document_data || document,
            session_id: sessionId
          })
        });

        const result = await response.json();

        if (result.success && result.ipc_data) {
          // IPC를 통해 문서편집창에 문서 전송
          console.log('📄 [FRONTEND] IPC 데이터 받음:', result.ipc_data);

          if (window.electron?.openDocumentInEditor) {
            try {
              const ipcResult = await window.electron.openDocumentInEditor({ ipc_data: result.ipc_data });
              console.log('📄 [FRONTEND] IPC 전송 결과:', ipcResult);

              if (ipcResult.success) {
                console.log('✅ 문서편집창에 문서 전송 완료');
              } else {
                console.error('❌ IPC 전송 실패:', ipcResult.message);
              }
            } catch (ipcError) {
              console.error('❌ IPC 호출 오류:', ipcError);
            }
          } else {
            console.error('❌ IPC 통신 함수(openDocumentInEditor)를 찾을 수 없습니다');
          }

          // 콜백 호출 (성공 메시지 표시)
          if (onDocumentClick) {
            onDocumentClick(result.message);
          }
        } else {
          console.error('❌ 문서 열기 실패:', result.error);
          if (onDocumentClick) {
            onDocumentClick(`문서 열기 실패: ${result.error}`);
          }
        }
      } else {
        // 지원하지 않는 파일: 다운로드 진행
        await handleFileDownload(document);
      }
    } catch (error) {
      console.error('❌ 문서 버튼 클릭 오류:', error);
      if (onDocumentClick) {
        onDocumentClick(`오류: ${error.message}`);
      }
    }
  };

  const handleDirectDownload = async (document) => {
    try {
      console.log('⬇️ 직접 다운로드 시작:', document.filename);
      
      const downloadUrl = document.download_url;
      if (!downloadUrl) {
        console.error('❌ 다운로드 URL이 없습니다');
        if (onDocumentClick) {
          onDocumentClick('다운로드 URL을 찾을 수 없습니다.');
        }
        return;
      }

      // 링크 생성 및 클릭으로 다운로드 트리거
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = document.filename || 'download';
      link.target = '_blank';
      
      // 일시적으로 DOM에 추가
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log('✅ 다운로드 완료:', document.filename);
      if (onDocumentClick) {
        onDocumentClick(`"${document.filename}" 다운로드가 시작되었습니다.`);
      }
      
    } catch (error) {
      console.error('❌ 직접 다운로드 오류:', error);
      if (onDocumentClick) {
        onDocumentClick(`다운로드 오류: ${error.message}`);
      }
    }
  };

  const handleFileDownload = async (document) => {
    try {
      console.log('⬇️ 파일 다운로드 시작:', document.filename);
      
      // Human-in-the-loop: 다운로드 확인 대화상자
      const userConfirmed = window.confirm(
        `"${document.filename}" 파일은 문서편집창에서 지원하지 않는 형식입니다.\n\n다운로드하시겠습니까?`
      );
      
      if (!userConfirmed) {
        if (onDocumentClick) {
          onDocumentClick('다운로드가 취소되었습니다.');
        }
        return;
      }

      // 다운로드 API 호출
      const response = await fetch('/api/v1/chat/document/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        },
        body: JSON.stringify({
          document_id: document.id,
          document_data: document.document_data || document,
          session_id: sessionId
        })
      });

      const result = await response.json();

      if (result.success && result.download_url) {
        // 다운로드 링크로 파일 다운로드
        const link = document.createElement('a');
        link.href = result.download_url;
        link.download = document.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('⬇️ 파일 다운로드 완료');
        if (onDocumentClick) {
          onDocumentClick(`✅ "${document.filename}" 파일이 다운로드되었습니다.`);
        }
      } else {
        console.error('❌ 다운로드 실패:', result.error);
        if (onDocumentClick) {
          onDocumentClick(`다운로드 실패: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('❌ 파일 다운로드 오류:', error);
      if (onDocumentClick) {
        onDocumentClick(`다운로드 오류: ${error.message}`);
      }
    }
  };

  return (
    <div className="document-buttons-container bg-gray-50 rounded-lg p-4 my-2">
      <div className="text-sm text-gray-600 mb-3">
        '{query}' 관련 문서 {documents.length}개를 찾았습니다:
      </div>
      
      <div className="space-y-2">
        {documents.map((doc, index) => {
          const isSupported = doc.action_type === 'open_editor';
          const buttonClass = isSupported 
            ? "w-full text-left bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-md p-3 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            : "w-full text-left bg-white hover:bg-orange-50 border border-gray-200 hover:border-orange-300 rounded-md p-3 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500";
          
          return (
            <button
              key={doc.id || index}
              onClick={() => handleButtonClick(doc)}
              className={buttonClass}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 mb-1 flex items-center gap-2">
                    {doc.icon} {doc.filename}
                    {!isSupported && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                        다운로드
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {doc.subtitle}
                  </div>
                </div>
                <div className={`text-xs font-medium ${isSupported ? 'text-blue-600' : 'text-orange-600'}`}>
                  {isSupported ? '클릭하여 열기' : '클릭하여 다운로드'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      
      <div className="text-xs text-gray-500 mt-3 text-center">
        💡 지원되는 파일은 문서편집창에서 열리고, 기타 파일은 다운로드됩니다
      </div>
    </div>
  );
}