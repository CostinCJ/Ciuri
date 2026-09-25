import type { GameState } from '@/lib/game';

export const BID_SECONDS = 20;
export const PLAY_SECONDS = 30;
export const SUMMARY_SECONDS = 5;
export const START_COUNTDOWN_SECONDS = 3;

/** When the automatic move (timeoutAction) may be applied, or null when nothing is pending. */
export function deadlineFor(state: GameState, now: Date): Date | null {
  const seconds =
    state.phase === 'bidding' ? BID_SECONDS
    : state.phase === 'playing' ? PLAY_SECONDS
    : state.phase === 'roundOver' ? SUMMARY_SECONDS
    : null;
  return seconds === null ? null : new Date(now.getTime() + seconds * 1000);
}
