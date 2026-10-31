'use client';

import { useEffect, useRef } from 'react';

const DEFAULT_INTERVAL_MS = 30_000;
const MIN_VISIBLE_RETRY_MS = 15_000;

export function useVisibleRevalidation(revalidate: () => void | Promise<void>, enabled = true, intervalMs = DEFAULT_INTERVAL_MS) {
  const callbackRef = useRef(revalidate);
  const runningRef = useRef(false);
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    callbackRef.current = revalidate;
  }, [revalidate]);

  useEffect(() => {
    lastRunAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    const run = async () => {
      if (!active || document.visibilityState !== 'visible' || runningRef.current) return;
      runningRef.current = true;
      lastRunAtRef.current = Date.now();
      try {
        await callbackRef.current();
      } catch {
        // Revalidation is best-effort. Existing data stays visible and the next tick retries.
      } finally {
        runningRef.current = false;
      }
    };

    const timer = window.setInterval(() => void run(), Math.max(MIN_VISIBLE_RETRY_MS, intervalMs));
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunAtRef.current >= MIN_VISIBLE_RETRY_MS) void run();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
