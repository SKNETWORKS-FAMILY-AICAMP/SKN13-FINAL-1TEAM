# inline AI 애플리케이션 분석 보고서

## 1. 일반 정보

*   **애플리케이션 이름:** inline AI
*   **버전:** 0.1.2
*   **개발사:** Elements Corp.
*   **설명:** 내 자료를 알고 있는 AI 문서 편집기
*   **라이선스:** MIT
*   **프레임워크:** Electron

## 2. 파일 구조 분석 (asar 압축 해제 후)

`resources/app/` 디렉토리 내에서 다음과 같은 주요 구조를 확인했습니다:

*   `dist/`: 컴파일된 메인 프로세스 및 렌더러 프로세스 코드.
*   `node_modules/`: Node.js 의존성 모듈.
*   `package.json`: 애플리케이션 메타데이터 및 의존성 정보.

## 3. `package.json` 분석

`package.json` 파일은 애플리케이션의 기본 정보와 사용된 주요 라이브러리를 보여줍니다.

*   **메인 스크립트:** `dist/main.js` (Electron 메인 프로세스의 시작점)
*   **주요 의존성:**
    *   `electron-updater`, `electron-log`, `electron-store`: Electron 관련 유틸리티.
    *   `react`, `react-dom`: React 기반의 프론트엔드 사용.
    *   `@tiptap/core` 및 다수의 `@tiptap/extension-*`: Tiptap 리치 텍스트 에디터 프레임워크 사용.
    *   `@react-pdf-viewer/core`, `pdfjs-dist`: PDF 보기 기능.
    *   `docx-preview`, `html-docx-js-typescript`: DOCX 미리보기 및 변환 기능.
    *   `hwp.js`: **한글(HWP) 문서 형식 지원.**
    *   `axios`: HTTP 클라이언트 (API 호출용).
    *   `tailwindcss`: CSS 프레임워크.
    *   `fs-extra`: 파일 시스템 작업용.
    *   `jsdom`: Node.js 환경에서 DOM 조작용.
    *   `jszip`: ZIP 파일 처리용.
    *   `dotenv`: 환경 변수 로딩용.
    *   `mixpanel-browser`: 분석(Analytics) 도구.
    *   `uuid`: 고유 ID 생성용.
    *   `win-ca`: Windows CA 인증서 처리용.

## 4. `dist` 디렉토리 분석

`dist` 디렉토리는 컴파일된 애플리케이션 코드를 포함하며, 다음과 같은 주요 파일들을 확인했습니다:

*   `main.js`: Electron 메인 프로세스의 실제 구현 코드.
*   `preload.js`: 렌더러 프로세스에 Node.js API를 안전하게 노출하는 스크립트.
*   `index.html`: React 프론트엔드의 메인 HTML 파일.
*   `assets/`: 컴파일된 CSS, JavaScript 번들 및 기타 정적 자산.
*   `api.js`: 백엔드/AI 통신 및 핵심 비즈니스 로직을 포함할 것으로 예상되는 파일.
*   `autoUpdate.js`: 자동 업데이트 관련 로직.

## 5. `main.js` 분석 (Electron 메인 프로세스)

`main.js`는 Electron 애플리케이션의 핵심적인 동작을 정의합니다.

*   **환경 설정:**
    *   `.env` 파일에서 환경 변수를 로드하고 `electron-log`를 사용하여 로깅을 수행합니다.
    *   `win-ca`를 통해 Windows CA 인증서를 가져와 보안 통신에 활용합니다.
    *   `electron-store`를 초기화하여 GPU 관련 충돌을 추적하고, 문제가 지속될 경우 하드웨어 가속을 비활성화하는 견고한 오류 처리 메커니즘을 갖추고 있습니다.
    *   프로덕션 환경에서는 Sentry를 통합하여 오류를 추적합니다.
*   **창 관리:**
    *   `createWindow()` 함수는 메인 `BrowserWindow`를 설정합니다 (기본 크기 1280x720, 최소 너비 900).
    *   `preload.js`를 프리로드 스크립트로 로드합니다.
    *   `webSecurity`가 `false`로 설정되어 있습니다 (보안상 주의 필요).
    *   `unresponsive` 및 `render-process-gone` 이벤트를 처리하여 사용자에게 대화 상자를 표시하고 렌더러 프로세스를 다시 로드하거나 종료를 시도하여 충돌 시 사용자 경험을 개선합니다.
    *   창은 시작 시 최대화됩니다 (`mainWindow.maximize()`).
    *   창 닫기 버튼 클릭 시 앱이 종료되는 대신 창을 숨깁니다 (백그라운드 실행).
*   **자동 업데이트:**
    *   `autoUpdate.js`의 `initAutoUpdate` 및 `checkForUpdates` 함수를 사용하여 자동 업데이트를 관리합니다.
    *   창 표시, 포커스, 웹 콘텐츠 로드 완료 시점 및 주기적으로 업데이트를 확인하여 앱이 항상 최신 상태를 유지하도록 합니다.
*   **메뉴 바:**
    *   표준 "파일", "편집", "보기", "윈도우", "도움말" 옵션으로 구성된 사용자 정의 메뉴 바를 제공합니다.
    *   개발 모드에서만 "개발자 도구" 옵션을 표시합니다.
    *   "inline AI 고객센터" 메뉴는 카카오톡 채널(`http://pf.kakao.com/_NxmMxfn`)로 연결됩니다.
*   **트레이 아이콘:**
    *   `createTray()` 함수를 통해 시스템 트레이 아이콘을 설정합니다.
    *   트레이 아이콘 클릭 시 메인 창을 표시/숨기며, 마우스 오른쪽 버튼 클릭 시 "종료" 옵션을 제공합니다.
*   **딥 링크:**
    *   `inline://` 프로토콜을 기본 프로토콜 클라이언트로 등록합니다.
    *   `inline://auth?token=...`, `inline://subscribe` 등과 같은 URL을 처리하여 인증 흐름이나 구독 관리와 같은 외부 통합을 지원합니다.
*   **단일 인스턴스:**
    *   `requestSingleInstanceLock()`을 사용하여 애플리케이션의 단일 인스턴스만 실행되도록 보장합니다.
*   **PDF 내보내기 글꼴:**
    *   `copyFontsForPdfExport_1.default()` 함수를 호출하여 PDF 내보내기 기능을 위한 사용자 정의 글꼴을 처리합니다.

## 6. `preload.js` 분석 (프론트엔드 API 노출)

`preload.js`는 `contextBridge.exposeInMainWorld`를 사용하여 `backend`와 `eventToClient` 두 가지 객체를 프론트엔드(React 앱)에 노출합니다. 이는 웹 UI가 Electron 메인 프로세스 및 기본 시스템과 상호 작용하는 안전한 방법을 제공합니다.

*   **`backend` 객체 (프론트엔드 -> 메인 프로세스 호출):**
    *   **볼트/파일 관리:** `getVaultPath`, `createVault`, `clearAllVaultFiles`, `showFileDialog`, `uploadFilesToRemote` (파일 경로만 전달, 실제 업로드는 프론트엔드에서 처리), `getDocumentContent`, `saveDocument`, `createFolder`, `renameFolderOrFile`, `copyFile`, `moveFileOrFolder`, `deleteFileOrFolderByPath`, `saveFileBuffer`, `getFileByPath`, `readFileBuffer`.
    *   **문서 내보내기:** `exportDocument`, `exportFile`, `saveFileBufferByDialog`.
    *   **글꼴:** `getSystemFonts` (시스템 글꼴 목록 가져오기).
    *   **앱 시스템 제어:** `hideApp`, `closeApp`, `reloadApp`.
    *   **로그인/구독:** `login`, `subscribePlus`, `changePaymentMethod`.
    *   **외부 링크:** `openHelpCenter`.
    *   **업데이트:** `implementUpdate`.
    *   **사용자 해시:** `generateUserHash`.
    *   **GPU 충돌 추적:** `resetGpuCrashTracking`, `getGpuCrashStatus`.
*   **`eventToClient` 객체 (메인 프로세스 -> 프론트엔드 이벤트 전달):**
    *   `onAuth`, `onAuthFailed`, `onSubscribeSuccess`, `onOpenMyPage`, `onChangePaymentMethod`, `onUpdateAvailable`.

## 7. `index.html` 분석 (React 프론트엔드 진입점)

`index.html`은 일반적인 React 애플리케이션의 진입점 역할을 합니다.

*   **제목 및 설명:** `package.json`과 동일한 "inline AI - 내 자료를 알고 있는 AI 문서 편집기"를 사용합니다.
*   **`id="root"` div:** React 애플리케이션이 마운트되는 지점입니다.
*   **JavaScript/CSS 번들:** 해시된 파일 이름(`index-UMBokwCR.js`, `index-zF8m5L3e.css`)을 가진 메인 JavaScript 및 CSS 번들을 로드합니다. 이는 프로덕션 빌드이며 Vite를 사용했을 가능성이 높습니다.
*   **Featurebase SDK 통합:**
    *   `https://do.featurebase.app/js/sdk.js`에서 Featurebase SDK를 로드하는 스크립트가 포함되어 있습니다.
    *   `Featurebase("initialize_feedback_widget", ...)`를 사용하여 피드백 위젯을 초기화합니다 (`organization: 'inlineai'`, `theme: "dark"`, `locale: "ko"`). 이는 사용자 피드백 및 제품 개선을 위한 통합 시스템이 있음을 의미합니다.

## 8. `api.js` 분석 (핵심 비즈니스 로직 및 IPC 구현)

`api.js`는 `preload.js`를 통해 프론트엔드에 노출된 IPC 핸들러의 실제 구현을 포함하며, 애플리케이션의 핵심 비즈니스 로직과 시스템 상호 작용이 이루어지는 곳입니다.

*   **외부 통합 구현:**
    *   `open-help-center`, `login`, `subscribe-plus`, `change-payment-method`와 같은 외부 서비스 연동 로직을 구현합니다.
    *   `generate-user-hash`는 `FEATUREBASE_SECRET_KEY`를 사용한 HMAC-SHA256 방식으로 사용자 해시를 생성하여 Featurebase 통합에 활용됩니다.
*   **경로 정규화 (`normalizePath` 유틸리티):**
    *   렌더러(웹 스타일의 `/` 구분자)와 OS 파일 시스템(Windows `\` 또는 Linux `/`) 간의 경로 차이를 처리하는 중요한 유틸리티입니다.
*   **볼트 관리 구현:**
    *   `get-vault-path`, `create-vault` (사용자 데이터 디렉토리에 생성), `clear-all-vault-files` (`.recycle-bin` 제외)와 같은 볼트 관련 기능을 구현합니다.
*   **파일 시스템 작업 구현:**
    *   `copy-file`, `save-file-buffer`, `show-file-dialog`, `upload-files-to-remote` (파일 경로를 프론트엔드로 전달하여 실제 업로드를 준비), `get-document-content`, `get-file-by-path` (경로가 없을 시 파일 이름으로 검색 폴백 포함), `save-document`, `create-folder`, `delete-file-or-folder-by-path`, `rename-folder-or-file`, `move-file-or-folder`, `read-file-buffer` 등 포괄적인 파일 시스템 조작 기능을 제공합니다.
*   **시스템 글꼴:**
    *   `get-system-fonts`를 구현하여 일반적인 OS 글꼴 경로에서 시스템 글꼴을 읽어옵니다.
*   **문서 내보내기 구현:**
    *   `export-document`는 HTML을 PDF 또는 DOCX로 내보내는 복잡한 로직을 포함합니다.
        *   **PDF 내보내기:** 숨겨진 `BrowserWindow`를 사용하여 HTML을 렌더링하고 `printToPDF`를 호출합니다. 글꼴 처리를 위해 HTML 내 `{{FONT_DIR}}` 플레이스홀더를 임시 글꼴 디렉토리의 절대 `file://` URL로 대체하는 영리한 방식을 사용합니다.
        *   **DOCX 내보내기:** `html-docx-js-typescript` 라이브러리를 사용하여 HTML을 DOCX로 변환하고 페이지 여백을 처리합니다.
    *   `save-file-buffer-by-dialog`는 주어진 버퍼를 파일로 저장하기 위한 네이티브 저장 대화 상자를 표시합니다.
*   **앱 제어 구현:**
    *   `hide-app`, `close-app`, `reload-app` 등 앱 제어 기능을 구현합니다.
*   **휴지통 구현:**
    *   `move-to-recycle-bin`은 삭제된 항목을 볼트 내의 `.recycle-bin` 폴더로 이동시키고, 고유 ID 및 메타데이터(원본 경로, 삭제 시간, 폴더 여부)를 기록하는 사용자 정의 휴지통 기능을 제공합니다.
    *   `restore-from-recycle-bin`은 사용자 정의 휴지통에서 가장 최근에 삭제된 항목을 복원합니다.

## 9. 전체 애플리케이션 아키텍처 및 기능 요약

"inline AI"는 Elements Corp.에서 개발한 Electron 기반의 AI 문서 편집기입니다.

*   **로컬 우선 문서 관리:** 사용자 문서를 로컬 "볼트" 폴더에 저장하고 관리하며, 강력한 오프라인 기능을 제공합니다.
*   **리치 문서 편집기:** Tiptap 프레임워크를 사용하여 텍스트 편집 기능을 제공하며, PDF, DOCX, 그리고 특히 한국어 문서 형식인 HWP 파일에 대한 보기 및 내보내기 기능을 지원합니다.
*   **웹 기반 백엔드 통합:** 인증, 구독 관리, 그리고 "AI" 기능은 웹 백엔드 서비스와 연동됩니다. 문서는 프론트엔드에서 원격 AI 서비스로 전송되어 처리될 가능성이 높습니다.
*   **강력한 안정성 및 사용자 경험:**
    *   GPU 관련 충돌을 추적하고 하드웨어 가속을 비활성화하는 등 견고한 오류 처리 메커니즘을 갖추고 있습니다.
    *   자동 업데이트 기능을 통해 항상 최신 버전을 유지합니다.
    *   앱 종료 시 창을 숨겨 백그라운드에서 실행되도록 하여 사용자 편의성을 높입니다.
    *   사용자 정의 휴지통 기능을 통해 삭제된 파일을 복원할 수 있습니다.
*   **외부 통합:** 딥 링크를 통해 외부 웹 서비스(인증, 구독)와 원활하게 연동됩니다.
*   **사용자 참여:** Featurebase SDK를 통합하여 사용자 피드백 및 기능 요청을 수집합니다.
*   **한국어 특화:** HWP 파일 지원 및 한국어 UI 요소를 통해 한국 사용자를 주요 대상으로 합니다.

## 10. 기술 스택

*   **프론트엔드:** React, Tailwind CSS, Tiptap
*   **데스크톱 프레임워크:** Electron
*   **백엔드 통신:** IPC (Electron 메인 프로세스와 렌더러 프로세스 간 통신), `axios` (웹 백엔드 통신)
*   **파일 시스템:** `fs-extra`
*   **기타 주요 라이브러리:** `electron-updater`, `electron-log`, `electron-store`, `html-docx-js-typescript`, `mime-types`, `crypto`, `dotenv`, `win-ca`, `Featurebase SDK`.
