// ✅ 파일: frontend-ui/src/components/FeatureWindow/panels/Docs/Section.jsx
export default function Section({ title, children }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-600">{title}</h2>
      </div>
      {children}
    </div>
  );
}