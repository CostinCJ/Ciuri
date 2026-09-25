import { redealsOf, sumPoints, type Action, type Bid, type GameState, type RoundResult, type Seat, type Suit } from '@/lib/game';

export type GameEvent =
  | { type: 'matchStart'; dealer: Seat }
  | { type: 'timeout'; seat: Seat }
  | { type: 'bid'; seat: Seat; bid: Bid }
  /** Nobody passed a trump to the dealer's opponents: same dealer, fresh cards, bidding restarts. */
  | { type: 'redeal'; dealer: Seat; redeals: number }
  | { type: 'declare'; seat: Seat; suit: Suit; points: number }
  | { type: 'trick'; winner: Seat | null; points: number }
  | { type: 'roundEnd'; result: RoundResult }
  | { type: 'newRound'; dealer: Seat; roundNumber: number };

export const LOG_LIMIT = 50;

/** The bid without any extra fields the caller may have sent along. */
function canonicalBid(bid: Bid): Bid {
  return bid.kind === 'tromf' ? { kind: 'tromf', suit: bid.suit } : { kind: bid.kind };
}

/** Events caused by `action` turning `prev` into `next`. `automatic` marks moves made by the timeout. */
export function describeTransition(prev: GameState, next: GameState, action: Action, automatic: boolean): GameEvent[] {
  if (action.type === 'nextRound') {
    return [{ type: 'newRound', dealer: next.round.dealer, roundNumber: next.roundNumber }];
  }
  const events: GameEvent[] = [];
  if (automatic) events.push({ type: 'timeout', seat: action.seat });

  const before = prev.round;
  const after = next.round;
  // A redeal empties the bid list, so the logged bid comes from the (already accepted) action.
  if (action.type === 'bid') events.push({ type: 'bid', seat: action.seat, bid: canonicalBid(action.bid) });
  if (redealsOf(after) > redealsOf(before)) {
    events.push({ type: 'redeal', dealer: after.dealer, redeals: redealsOf(after) });
    return events;
  }
  for (const d of after.declared.slice(before.declared.length)) events.push({ type: 'declare', ...d });
  if (after.tricksPlayed > before.tricksPlayed && after.lastTrick) {
    const followOnly = after.mode === 'mare' || after.mode === 'mica';
    events.push({
      type: 'trick',
      winner: followOnly ? null : after.lastTrickWinner,
      points: sumPoints(after.lastTrick.map((p) => p.card)),
    });
  }
  if (after.result && !before.result) events.push({ type: 'roundEnd', result: after.result });
  return events;
}

export function appendLog(log: GameEvent[], events: GameEvent[]): GameEvent[] {
  return [...log, ...events].slice(-LOG_LIMIT);
}
