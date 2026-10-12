'use client';

import { useEffect, useRef, useState } from 'react';

const PULL_THRESHOLD_PX = 68;
const MAX_INDICATOR_OFFSET_PX = 96;
const INTERACTIVE_SELECTOR = 'button,a,input,select,textarea,[contenteditable="true"]';

type PullPhase = 'idle' | 'pulling' | 'ready' | 'refreshing';

export function PullToRefresh({ onRefresh }: { onRefresh: () => void }) {
  const refreshRef = useRef(onRefresh);
  const gesture = useRef({ tracking: false, dragging: false, startX: 0, startY: 0, rawDistance: 0 });
  const resetTimer = useRef<number | null>(null);
  const phaseRef = useRef<PullPhase>('idle');
  const offsetRef = useRef(0);
  const [phase, setPhase] = useState<PullPhase>('idle');
  const [offset, setOffset] = useState(0);

  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px) and (pointer: coarse)');
    const blocked = () => Boolean(
      document.body.classList.contains('shell-drawer-open') ||
      document.body.classList.contains('dashboard-period-drawer-open') ||
      document.querySelector('[role="dialog"][aria-modal="true"]')
    );
    const reset = () => {
      gesture.current = { tracking: false, dragging: false, startX: 0, startY: 0, rawDistance: 0 };
      offsetRef.current = 0;
      phaseRef.current = 'idle';
      setOffset(0);
      setPhase('idle');
    };
    const onTouchStart = (event: TouchEvent) => {
      if (!media.matches || phaseRef.current === 'refreshing' || event.touches.length !== 1 || window.scrollY > 0 || blocked()) return;
      const target = event.target as Element;
      if (!target.closest('.topbar') || target.closest(INTERACTIVE_SELECTOR)) return;
      const touch = event.touches[0];
      gesture.current = { tracking: true, dragging: false, startX: touch.clientX, startY: touch.clientY, rawDistance: 0 };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!gesture.current.tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.current.startX;
      const deltaY = touch.clientY - gesture.current.startY;
      if (!gesture.current.dragging) {
        if (deltaY < 10 || deltaY < Math.abs(deltaX) * 1.25) {
          if (Math.abs(deltaX) > 12 || deltaY < -10) gesture.current.tracking = false;
          return;
        }
        gesture.current.dragging = true;
      }
      event.preventDefault();
      gesture.current.rawDistance = deltaY;
      const resistedOffset = Math.min(MAX_INDICATOR_OFFSET_PX, Math.max(0, deltaY * 0.55));
      offsetRef.current = resistedOffset;
      phaseRef.current = resistedOffset >= PULL_THRESHOLD_PX ? 'ready' : 'pulling';
      setOffset(resistedOffset);
      setPhase(phaseRef.current);
    };
    const onTouchEnd = () => {
      if (!gesture.current.tracking) return;
      const shouldRefresh = gesture.current.dragging && offsetRef.current >= PULL_THRESHOLD_PX;
      gesture.current.tracking = false;
      gesture.current.dragging = false;
      if (!shouldRefresh) {
        reset();
        return;
      }
      offsetRef.current = 52;
      phaseRef.current = 'refreshing';
      setOffset(52);
      setPhase('refreshing');
      refreshRef.current();
      resetTimer.current = window.setTimeout(reset, 1100);
    };
    const onTouchCancel = () => reset();
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const label = phase === 'ready' ? 'Thả để cập nhật' : phase === 'refreshing' ? 'Đang cập nhật…' : 'Kéo xuống để cập nhật';
  return <div
    className={`pull-to-refresh-indicator ${phase}`}
    style={{ '--pull-refresh-offset': `${offset}px` } as React.CSSProperties}
    role="status"
    aria-live="polite"
    aria-hidden={phase === 'idle'}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5.3M20 4v7h-7"/></svg>
    <span>{label}</span>
  </div>;
}
