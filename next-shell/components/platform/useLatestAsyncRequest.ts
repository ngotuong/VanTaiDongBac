'use client';

import { useCallback, useEffect, useRef } from 'react';

export type LatestAsyncRequest = {
  signal: AbortSignal;
  isCurrent: () => boolean;
};

/**
 * Shared async-filter contract: a new selection cancels the previous request,
 * and only the latest request may update the visible result.
 */
export function useLatestAsyncRequest() {
  const sequenceRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const begin = useCallback((): LatestAsyncRequest => {
    controllerRef.current?.abort();
    const sequence = ++sequenceRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    return {
      signal: controller.signal,
      isCurrent: () => sequence === sequenceRef.current && !controller.signal.aborted
    };
  }, []);

  const cancel = useCallback(() => {
    sequenceRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return { begin, cancel };
}
