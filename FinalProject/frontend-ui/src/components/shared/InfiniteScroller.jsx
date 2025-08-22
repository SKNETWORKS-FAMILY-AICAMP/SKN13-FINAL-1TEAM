/* 
  파일: src/components/shared/InfiniteScroller.jsx
  역할: IntersectionObserver 기반의 무한 스크롤 컨테이너. 마지막 센티넬이 보이면 loadMore 호출.

  LINKS:
    - 이 파일을 사용하는 곳:
      * 목록/피드 화면(대량 아이템을 페이지네이션 없이 연속 스크롤)
    - 이 파일이 사용하는 것:
      * ../../hooks/useInfiniteScroll → onLoadMore, hasMore, loading, deps를 받아 관찰자 생성

  동작 개요:
    - items를 순차 렌더(renderItem)하고, 하단에 sentinelRef를 둔다.
    - sentinel이 뷰포트에 들어오고(hasMore && !loading) 조건이면 loadMore() 호출.
    - hasMore=false가 되면 "모두 불러왔습니다" 표시.
    - items가 비어 있고 loading=false면 "데이터가 없습니다" 표시.

  계약(Props):
    - items: any[]                      ← 렌더할 데이터 배열
    - renderItem: (item, idx) => React  ← 각 아이템을 렌더하는 함수
    - loadMore: () => void | Promise    ← 더 불러오기를 트리거
    - hasMore: boolean                  ← 더 불러올 수 있는지
    - loading: boolean                  ← 현재 로딩 중인지(중복 호출 방지)
    - deps: any[] = []                  ← 의존성이 바뀌면 옵저버를 재구성(필터/정렬 변경 등)

  주의:
    - renderItem은 key를 내부에서 주지 않으므로 호출 측에서 고유 key를 포함해 렌더하는 것을 권장.
    - useInfiniteScroll 훅은 IntersectionObserver 미지원/SSR 환경에 대한 폴백을 자체 처리해야 함.
*/

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
      {items.map((item, idx) => renderItem(item, idx))} {/* 호출 측에서 key 포함 권장 */}
      <div ref={sentinelRef} className="h-10" /> {/* 관찰 대상(센티넬) */}
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
