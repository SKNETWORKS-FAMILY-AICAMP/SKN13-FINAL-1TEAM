/* 
  파일: src/components/shared/IconButton.jsx
  역할: 간단한 텍스트 아이콘 버튼. 'menu'/'close' 키로 사전에서 심볼을 매핑해 출력.

  LINKS:
    - 이 파일을 사용하는 곳:
      * 헤더나 카드 액션 등 가벼운 아이콘 버튼이 필요한 영역
    - 이 파일이 사용하는 것: (없음)

  사용법:
    <IconButton icon="menu" onClick={...} />
    <IconButton icon="close" onClick={...} />

  확장 팁:
    - 아이콘이 늘어나면 icons 사전에 키를 추가하거나,
      외부 아이콘 라이브러리(lucide-react 등)로 교체해도 됨.
*/

 // ✅ IconButton.jsx
export default function IconButton({ icon, onClick }) {
  const icons = {
    menu: '☰',
    close: '✕'
  };
  return (
    <button
      className="text-xl px-2 py-1 rounded hover:bg-gray-200"
      onClick={onClick}
    >
      {icons[icon] || '?'} {/* 알 수 없는 키는 ? 표시 */}
    </button>
  );
}
