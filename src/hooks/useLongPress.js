import { useRef, useCallback } from 'react';

/**
 * useLongPress — fires callback after holding for `delay` ms
 * Cancels if user moves finger/mouse more than 10px
 */
export function useLongPress(onLongPress, delay = 500) {
  const timerRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isTriggeredRef = useRef(false);

  const start = useCallback((e) => {
    isTriggeredRef.current = false;
    const touch = e.touches ? e.touches[0] : e;
    startPosRef.current = { x: touch.clientX, y: touch.clientY };

    timerRef.current = setTimeout(() => {
      isTriggeredRef.current = true;
      onLongPress(e);
    }, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const move = useCallback((e) => {
    const touch = e.touches ? e.touches[0] : e;
    const dx = Math.abs(touch.clientX - startPosRef.current.x);
    const dy = Math.abs(touch.clientY - startPosRef.current.y);
    if (dx > 10 || dy > 10) cancel();
  }, [cancel]);

  const end = useCallback(() => {
    cancel();
  }, [cancel]);

  return {
    isTriggeredRef,
    handlers: {
      onMouseDown: start,
      onMouseUp: end,
      onMouseMove: move,
      onMouseLeave: cancel,
      onTouchStart: start,
      onTouchEnd: end,
      onTouchMove: move,
    }
  };
}
