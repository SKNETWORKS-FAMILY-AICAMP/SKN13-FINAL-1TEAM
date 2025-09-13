// ✅ IconButton.jsx
export default function IconButton({ icon, onClick }) {
  const icons = {
    menu: '☰',
    close: '✕'
  };
  return (
    <button
      className="text-[20px] px-2 py-1 rounded hover:bg-gray-200"
      onClick={onClick}
    >
      {icons[icon] || '?'}
    </button>
  );
}