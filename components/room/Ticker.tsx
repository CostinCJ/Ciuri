'use client';

import { useEffect } from 'react';
import { api } from '@/lib/client/api';

const RETRY_MS = 1500;

/**
 * Asks the server to advance time-based transitions (auto-start, automatic moves, next round)
 * once `dueAt` has passed. Every client runs this; the server accepts only the first.
 */
export function Ticker({ code, dueAt }: { code: string; dueAt: string | null }) {
  useEffect(() => {
    if (!dueAt) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const fire = async () => {
      if (stopped) return;
      try {
        const { changed } = await api.tick(code);
        if (!changed && !stopped) timer = setTimeout(fire, RETRY_MS);
      } catch {
        if (!stopped) timer = setTimeout(fire, RETRY_MS * 2);
      }
    };

    // Small random delay spreads the 4 clients' requests.
    const delay = Math.max(0, new Date(dueAt).getTime() - Date.now()) + 150 + Math.random() * 500;
    timer = setTimeout(fire, delay);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [code, dueAt]);

  return null;
}
