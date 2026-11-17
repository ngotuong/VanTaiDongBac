'use client';

import { useEffect, useRef } from 'react';

export type PublicationInvalidation = {
  id: number;
  year: string;
  reportMonth: string;
  generationId: string;
  sourceDataVersion: string;
  cacheVersion: string;
  publishedAt: string;
};

export function usePublicationInvalidation(
  year: string,
  publicationId: number | undefined,
  onInvalidate: (event: PublicationInvalidation) => void | Promise<void>,
  enabled = true
) {
  const callbackRef = useRef(onInvalidate);
  const cursorRef = useRef(Math.max(0, Number(publicationId) || 0));
  const runningRef = useRef(false);

  useEffect(() => { callbackRef.current = onInvalidate; }, [onInvalidate]);
  useEffect(() => {
    cursorRef.current = Math.max(cursorRef.current, Math.max(0, Number(publicationId) || 0));
  }, [publicationId]);

  useEffect(() => {
    if (!enabled || !year || typeof EventSource === 'undefined') return;
    let active = true;
    let source: EventSource | null = null;
    let reconnectTimer = 0;

    const reconnect = (delayMs: number) => {
      if (!active) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, delayMs);
    };
    const connect = () => {
      if (!active || document.visibilityState !== 'visible') return reconnect(1_000);
      const url = new URL('/publication-events/', window.location.origin);
      url.searchParams.set('year', year);
      url.searchParams.set('after', String(cursorRef.current));
      source = new EventSource(url, { withCredentials: true });
      source.addEventListener('publication', (message) => {
        let event: PublicationInvalidation;
        try { event = JSON.parse((message as MessageEvent<string>).data) as PublicationInvalidation; }
        catch { return; }
        if (!event.id || event.id <= cursorRef.current || event.year !== year) return;
        cursorRef.current = event.id;
        source?.close();
        if (runningRef.current) return reconnect(250);
        runningRef.current = true;
        Promise.resolve(callbackRef.current(event))
          .catch(() => undefined)
          .finally(() => { runningRef.current = false; reconnect(250); });
      });
      source.onerror = () => { source?.close(); reconnect(1_000); };
    };

    connect();
    return () => {
      active = false;
      source?.close();
      window.clearTimeout(reconnectTimer);
    };
  }, [enabled, year]);
}
