/* 
  파일: src/components/Sidebar/ChatSummaryItem.jsx
  역할: 사이드바에서 채팅 요약(제목) 한 줄을 렌더하는 리스트 아이템 컴포넌트.

  LINKS:
    - 이 파일을 사용하는 곳:
      * Sidebar.jsx → 세션 목록을 렌더할 때 각 행으로 사용
    - 이 파일이 사용하는 것:
      * (없음) — 순수 프레젠테이션 컴포넌트

  상하위 연결(데이터 흐름):
    - props.title: 세션 제목 표시(긴 텍스트는 truncate)
    - props.onClick(): 선택 시 상위에서 해당 세션을 로드/전환

  접근성/UX:
    - 전체 영역 클릭 가능(cursor-pointer, hover:bg)
    - 아이콘 영역(📄)은 시각적 구분용
*/

 // ✅ ChatSummaryItem.jsx
export default function ChatSummaryItem({ title, onClick }) {
  return (
    <div
      className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-100 cursor-pointer"
      onClick={onClick}
    >
      <div className="text-gray-400">📄</div>
      <div className="text-sm font-medium truncate">{title}</div>
    </div>
  );
}
