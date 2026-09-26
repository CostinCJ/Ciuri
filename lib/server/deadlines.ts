import { pendingSeat, type GameState, type Seat } from '@/lib/game';
import { BID_SECONDS, BOT_SECONDS, PLAY_SECONDS, SUMMARY_SECONDS } from '@/lib/game-timing';

/**
 * When the automatic move may be applied, or null when nothing is pending. A computer player
 * (`isBot`) on turn moves after BOT_SECONDS; a person gets the full move time.
 */
export function deadlineFor(state: GameState, now: Date, isBot: (seat: Seat) => boolean = () => false): Date | null {
  const seat = pendingSeat(state);
  const seconds =
    seat !== null && isBot(seat) ? BOT_SECONDS
    : state.phase === 'bidding' ? BID_SECONDS
    : state.phase === 'playing' ? PLAY_SECONDS
    : state.phase === 'roundOver' ? SUMMARY_SECONDS
    : null;
  return seconds === null ? null : new Date(now.getTime() + seconds * 1000);
}
