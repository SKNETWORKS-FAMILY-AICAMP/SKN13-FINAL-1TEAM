import { useEffect, useRef } from "react";

export default function useInfiniteScroll({
    onLoadMore, // () => void | Promise<void>
    hasMore, // 더 불러올 게 있는지
    loading, // 현재 로딩 중인지
    root = null,
    rootMargin = "200px",
    threshold = 0,
    deps = [], // 필터 등 외부 의존성
}) {
    const sentinelRef = useRef(null);

    useEffect(() => {
        if (!sentinelRef.current) return;
        const io = new IntersectionObserver(
            (entries) => {
                const [entry] = entries;
                if (entry.isIntersecting && hasMore && !loading) {
                    onLoadMore(); // ← 커서/페이지는 바깥에서 관리
                }
            },
            { root, rootMargin, threshold }
        );
        io.observe(sentinelRef.current);
        return () => io.disconnect();
    }, [hasMore, loading, root, rootMargin, threshold, onLoadMore, ...deps]);

    return { sentinelRef };
}