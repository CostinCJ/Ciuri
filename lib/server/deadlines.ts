import type { GameState } from '@/lib/game';
import { BID_SECONDS, PLAY_SECONDS, SUMMARY_SECONDS } from '@/lib/game-timing';

/** When the automatic move (timeoutAction) may be applied, or null when nothing is pending. */
export function deadlineFor(state: GameState, now: Date): Date | null {
  const seconds =
    state.phase === 'bidding' ? BID_SECONDS
    : state.phase === 'playing' ? PLAY_SECONDS
    : state.phase === 'roundOver' ? SUMMARY_SECONDS
    : null;
  return seconds === null ? null : new Date(now.getTime() + seconds * 1000);
}
