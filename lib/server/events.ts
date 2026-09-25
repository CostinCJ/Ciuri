import { sumPoints, type Action, type Bid, type GameState, type RoundResult, type Seat, type Suit } from '@/lib/game';

export type GameEvent =
  | { type: 'matchStart'; dealer: Seat }
  | { type: 'timeout'; seat: Seat }
  | { type: 'bid'; seat: Seat; bid: Bid }
  | { type: 'declare'; seat: Seat; suit: Suit; points: number }
  | { type: 'trick'; winner: Seat | null; points: number }
  | { type: 'roundEnd'; result: RoundResult }
  | { type: 'newRound'; dealer: Seat; roundNumber: number };

export const LOG_LIMIT = 50;

/** Events caused by `action` turning `prev` into `next`. `automatic` marks moves made by the timeout. */
export function describeTransition(prev: GameState, next: GameState, action: Action, automatic: boolean): GameEvent[] {
  if (action.type === 'nextRound') {
    return [{ type: 'newRound', dealer: next.round.dealer, roundNumber: next.roundNumber }];
  }
  const events: GameEvent[] = [];
  if (automatic) events.push({ type: 'timeout', seat: action.seat });

  const before = prev.round;
  const after = next.round;
  if (action.type === 'bid') events.push({ type: 'bid', seat: action.seat, bid: after.bids[after.bids.length - 1].bid });
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
