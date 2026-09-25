'use client';

import { useNow } from '@/lib/client/use-now';

function msUntil(deadline: string, now: number): number {
  return Math.max(0, new Date(deadline).getTime() - now);
}

/** Whole seconds left until `deadline`. Only this small component re-renders on each tick. */
export function SecondsLeft({ deadline }: { deadline: string }) {
  const now = useNow();
  return <>{Math.ceil(msUntil(deadline, now) / 1000)}</>;
}

/** Progress bar plus seconds for a move that lasts `totalSeconds`. */
export function TimerBar({ deadline, totalSeconds }: { deadline: string; totalSeconds: number }) {
  const now = useNow();
  const ms = msUntil(deadline, now);
  const fraction = Math.min(1, ms / (totalSeconds * 1000));
  return (
    <span className="flex w-full items-center gap-1 text-xs tabular-nums short:col-start-1">
      <span className="h-1 flex-1 overflow-hidden rounded bg-stone-700">
        <span className="block h-full bg-amber-400" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </span>
      {Math.ceil(ms / 1000)}s
    </span>
  );
}
