// src/components/common/InfiniteScroller.jsx
import useInfiniteScroll from "../../hooks/useInfiniteScroll";

export default function InfiniteScroller({
  items,
  renderItem,
  loadMore,
  hasMore,
  loading,
  deps = [],
}) {
  const { sentinelRef } = useInfiniteScroll({ onLoadMore: loadMore, hasMore, loading, deps });

  return (
    <div className="w-full">
      {items.map((item, idx) => renderItem(item, idx))}
      <div ref={sentinelRef} className="h-10" />
      {loading && <div className="py-4 text-center text-sm text-gray-500">불러오는 중…</div>}
      {!hasMore && items.length > 0 && (
        <div className="py-4 text-center text-sm text-gray-400">모두 불러왔습니다</div>
      )}
      {items.length === 0 && !loading && (
        <div className="py-8 text-center text-sm text-gray-500">데이터가 없습니다</div>
      )}
    </div>
  );
}
