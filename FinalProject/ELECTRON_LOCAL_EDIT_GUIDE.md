# Electron 로컬 파일 편집 기능 구현 가이드

이 문서는 Electron 애플리케이션에서 별도의 로컬 서버 없이, Electron의 내장 IPC 통신을 사용하여 사용자의 로컬 파일을 편집하고 저장하는 기능의 구현 방법을 설명합니다.

## 핵심 아키텍처

핵심은 **Electron의 IPC (Inter-Process Communication)** 입니다. 렌더러 프로세스(프론트엔드, React)와 메인 프로세스(Node.js 백그라운드)가 서로 안전하게 통신하여 로컬 파일 시스템에 접근합니다.

- **렌더러 프로세스 (Frontend):** 사용자 인터랙션 담당. 파일 편집 요청 및 저장 요청을 보냅니다.
- **메인 프로세스 (Main Process):** 실제 Node.js 환경. 렌더러의 요청을 받아 로컬 파일을 읽고 쓰는 실제 작업을 수행합니다.
- **Preload Script:** 둘 사이의 안전한 다리 역할. 메인 프로세스의 기능 중 필요한 것만 선별하여 렌더러의 `window` 객체에 노출시킵니다.

---

## 구현 단계

### STEP 1: `preload.js` - 통신 브릿지 설정

보안을 위해 렌더러 프로세스가 직접 Node.js API를 호출하지 못하게 막고, `contextBridge`를 통해 필요한 기능만 안전하게 노출시킵니다.

**`preload.js` 수정:**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // (인자) -> Promise<결과> 형태의 비동기 함수를 노출시킵니다.
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
});
```

- **`exposeInMainWorld('electronAPI', ...)`**: 프론트엔드의 `window.electronAPI` 객체를 통해 여기에 정의된 함수들을 사용할 수 있게 됩니다.
- **`ipcRenderer.invoke(...)`**: 지정된 채널(`'read-file'`, `'write-file'`)로 메인 프로세스에 비동기 메시지를 보내고, 응답을 `Promise`로 받습니다.

---

### STEP 2: `main.js` - 파일 시스템 작업 처리

메인 프로세스에서 `ipcMain`을 사용하여 프론트엔드로부터 온 요청을 수신하고, Node.js의 `fs` 모듈로 실제 파일 작업을 처리합니다.

**`main.js` 수정:**

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'); // Node.js의 파일 시스템 모듈

// 파일 읽기 요청 처리 핸들러
function handleFileRead(event, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error('File read error:', error);
    return null;
  }
}

// 파일 쓰기 요청 처리 핸들러
function handleFileWrite(event, filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('File write error:', error);
    return { success: false, error: error.message };
  }
}

// 앱이 준비되면 IPC 핸들러를 등록합니다.
app.whenReady().then(() => {
  ipcMain.handle('read-file', handleFileRead);
  ipcMain.handle('write-file', handleFileWrite);

  createWindow(); // 기존 윈도우 생성 함수
  // ...
});
```

- **`ipcMain.handle(...)`**: `invoke`에 대응하여 요청을 처리하는 리스너입니다. 여기서 반환된 값은 프론트엔드의 `await` 구문으로 전달됩니다.
- **`fs.readFileSync/writeFileSync`**: Node.js의 내장 모듈을 사용하여 로컬 파일을 직접 동기적으로 읽고 씁니다.

---

### STEP 3: 프론트엔드 (React Component) - 기능 호출

프론트엔드 컴포넌트에서는 `preload.js`를 통해 노출된 `window.electronAPI`를 사용하여 메인 프로세스의 기능을 간단하게 호출할 수 있습니다.

**예시: `DocumentEditor.jsx`**

```jsx
import React, { useState } from 'react';
// Tiptap 에디터를 사용한다고 가정
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

function DocumentEditor() {
  const [filePath, setFilePath] = useState('C:\Users\YourUser\Documents\test.html'); // 예시 경로

  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Load a document to start editing...</p>',
  });

  const loadFile = async () => {
    if (!editor) return;
    console.log('Requesting to read file...');
    const fileContent = await window.electronAPI.readFile(filePath);
    if (fileContent !== null) {
      editor.commands.setContent(fileContent); // Tiptap 에디터에 내용 설정
      console.log('File loaded!');
    } else {
      console.error('Failed to load file.');
    }
  };

  const saveFile = async () => {
    if (!editor) return;
    console.log('Requesting to save file...');
    const htmlContent = editor.getHTML(); // Tiptap 에디터의 내용을 HTML로 추출
    const result = await window.electronAPI.writeFile(filePath, htmlContent);
    if (result.success) {
      console.log('File saved successfully!');
    } else {
      console.error('Failed to save file:', result.error);
    }
  };

  return (
    <div>
      <button onClick={loadFile}>Load Document</button>
      <button onClick={saveFile}>Save Document</button>
      <EditorContent editor={editor} />
    </div>
  );
}

export default DocumentEditor;
```

- **`window.electronAPI.readFile`**: `async/await`를 사용하여 메인 프로세스로부터 파일 내용을 비동기적으로 받아옵니다.
- **Tiptap 연동**: 받아온 파일 내용(`fileContent`)을 `editor.commands.setContent`를 통해 Tiptap 에디터에 로드합니다. 저장 시에는 `editor.getHTML()`로 에디터의 현재 내용을 HTML 문자열로 가져와 `writeFile` 함수로 전달합니다.
