'use client';

import { useEffect, useRef, useState } from 'react';
import type { TouchEventHandler } from 'react';

type SwipeDismissOptions = {
  active?: boolean;
  direction?: 'down' | 'right';
  disabled?: boolean;
  onDismiss: () => void;
  threshold?: number;
};

const INTERACTIVE_SELECTOR = 'input,select,textarea,button,a,[contenteditable="true"],[data-no-swipe-dismiss]';
const CLOSE_DURATION_MS = 190;
const FLING_VELOCITY_PX_MS = 0.45;
const MIN_FLING_DISTANCE_PX = 24;

export function useSwipeDismiss({
  active = true,
  direction = 'down',
  disabled = false,
  onDismiss,
  threshold = 72,
}: SwipeDismissOptions) {
  const start = useRef({ x: 0, y: 0 });
  const latest = useRef({ position: 0, time: 0 });
  const velocity = useRef(0);
  const tracking = useRef(false);
  const dragging = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const dragFrame = useRef<number | null>(null);
  const pendingOffset = useRef(0);
  const pendingSurface = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);

  const writeOffset = (surface: HTMLElement, value: number) => {
    surface.style.setProperty('--drawer-swipe-offset', `${value}px`);
  };

  const scheduleOffset = (surface: HTMLElement, value: number) => {
    pendingSurface.current = surface;
    pendingOffset.current = value;
    if (dragFrame.current !== null) return;
    dragFrame.current = window.requestAnimationFrame(() => {
      if (pendingSurface.current) writeOffset(pendingSurface.current, pendingOffset.current);
      dragFrame.current = null;
    });
  };

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    if (dragFrame.current !== null) window.cancelAnimationFrame(dragFrame.current);
  }, []);

  const finishClose = () => {
    if (disabled || closing) return;
    tracking.current = false;
    dragging.current = false;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      onDismiss();
      setClosing(false);
      closeTimer.current = null;
    }, CLOSE_DURATION_MS);
  };

  const onTouchStart: TouchEventHandler<HTMLElement> = (event) => {
    if (!active || disabled || closing || event.touches.length !== 1) return;
    const target = event.target as Element;
    const startedOnHandle = Boolean(target.closest('[data-swipe-dismiss-handle]'));
    const startedAtEdge = event.touches[0].clientX <= 36;
    const canStartAwayFromHandle = direction === 'right' && startedAtEdge;
    const scrollRegion = target.closest<HTMLElement>('[data-overlay-scroll]');
    const startedOnBlankContent = direction === 'down'
      && !target.closest(INTERACTIVE_SELECTOR)
      && (!scrollRegion || scrollRegion.scrollTop <= 0);
    if (!startedOnHandle && !canStartAwayFromHandle && !startedOnBlankContent) return;
    if (!startedOnHandle && target.closest(INTERACTIVE_SELECTOR)) return;
    const now = performance.now();
    const touch = event.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
    latest.current = { position: direction === 'down' ? touch.clientY : touch.clientX, time: now };
    velocity.current = 0;
    tracking.current = true;
    dragging.current = false;
  };

  const onTouchMove: TouchEventHandler<HTMLElement> = (event) => {
    if (!tracking.current || event.touches.length !== 1) return;
    const deltaX = event.touches[0].clientX - start.current.x;
    const deltaY = event.touches[0].clientY - start.current.y;
    const primaryDelta = direction === 'down' ? deltaY : deltaX;
    const crossDelta = direction === 'down' ? deltaX : deltaY;
    if (!dragging.current) {
      if (primaryDelta < 10 || primaryDelta < Math.abs(crossDelta) * 1.2) {
        if (Math.abs(crossDelta) > 10 || primaryDelta < -10) tracking.current = false;
        return;
      }
      dragging.current = true;
      event.currentTarget.classList.add('dragging');
    }
    event.preventDefault();
    const now = performance.now();
    const position = direction === 'down' ? event.touches[0].clientY : event.touches[0].clientX;
    const elapsed = Math.max(1, now - latest.current.time);
    velocity.current = (position - latest.current.position) / elapsed;
    latest.current = { position, time: now };
    scheduleOffset(event.currentTarget, Math.max(0, primaryDelta));
  };

  const onTouchEnd: TouchEventHandler<HTMLElement> = (event) => {
    if (!tracking.current) return;
    const touch = event.changedTouches[0];
    const endPosition = touch ? (direction === 'down' ? touch.clientY : touch.clientX) : latest.current.position;
    const startPosition = direction === 'down' ? start.current.y : start.current.x;
    const finalOffset = Math.max(0, endPosition - startPosition);
    const finalVelocity = Math.max(0, velocity.current);
    if (dragFrame.current !== null) {
      window.cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
    }
    writeOffset(event.currentTarget, finalOffset);
    tracking.current = false;
    dragging.current = false;
    event.currentTarget.classList.remove('dragging');
    if (finalOffset >= threshold || (finalOffset >= MIN_FLING_DISTANCE_PX && finalVelocity >= FLING_VELOCITY_PX_MS)) {
      finishClose();
    } else {
      writeOffset(event.currentTarget, 0);
    }
  };

  const onTouchCancel: TouchEventHandler<HTMLElement> = (event) => {
    tracking.current = false;
    dragging.current = false;
    event.currentTarget.classList.remove('dragging');
    writeOffset(event.currentTarget, 0);
  };

  return {
    close: finishClose,
    closing,
    direction,
    gestureProps: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
  };
}
