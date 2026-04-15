import { useEffect, useRef, useState } from "react";

type PullToRefreshOptions = {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  enabled?: boolean;
};

export function usePullToRefresh(options: PullToRefreshOptions) {
  const { onRefresh, threshold = 74, enabled = true } = options;
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setPullDistance(0);
      setIsRefreshing(false);
    }
  }, [enabled]);

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (!enabled || window.scrollY > 4 || isRefreshing) {
      return;
    }

    startYRef.current = event.touches[0]?.clientY ?? null;
    pullingRef.current = true;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    if (!enabled || !pullingRef.current || startYRef.current === null) {
      return;
    }

    const currentY = event.touches[0]?.clientY ?? startYRef.current;
    const delta = currentY - startYRef.current;

    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    setPullDistance(Math.min(delta * 0.55, threshold + 28));
  };

  const finishPull = async () => {
    const shouldRefresh = pullDistance >= threshold;
    startYRef.current = null;
    pullingRef.current = false;
    setPullDistance(0);

    if (!shouldRefresh || isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await onRefresh();
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 240);
    }
  };

  return {
    pullDistance,
    isRefreshing,
    bind: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: () => {
        void finishPull();
      },
      onTouchCancel: () => {
        void finishPull();
      }
    }
  };
}
