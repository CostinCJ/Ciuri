import { describe, expect, it } from 'vitest';
import {
  applyAction, createMatch, legalMoves, pendingSeat, publicView, sameCard, timeoutAction,
  type Action, type Card, type GameState,
} from '../index';
import { mulberry32 } from './helpers';

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function checkFinishedRound(s: GameState): void {
  const r = s.round;
  expect(r.result).not.toBeNull();
  if (r.result?.reason === 'normal') {
    const declared = r.declared.reduce((sum, d) => sum + d.points, 0);
    expect(r.tricksPlayed).toBe(5);
    expect(r.points.A + r.points.B).toBe(120 + declared);
  }
}

const key = (card: Card): string => `${card.suit}-${card.rank}`;

function expectNoDuplicates(cards: Card[]): void {
  const keys = cards.map(key);
  expect(new Set(keys).size).toBe(keys.length);
}

/**
 * Card-conservation invariant. `played` holds every card played this round
 * (completed tricks plus the current trick).
 */
function checkCards(s: GameState, played: Card[]): void {
  const r = s.round;
  for (const hand of r.hands) expect(hand.length).toBeLessThanOrEqual(5);
  const inHands = r.hands.flat();
  expectNoDuplicates([...inHands, ...r.trick.map((p) => p.card)]);
  expectNoDuplicates([...inHands, ...played]);
  for (const p of r.trick) expect(played.some((x) => sameCard(x, p.card))).toBe(true);
  // Every card in play comes from the 20-card deal: the first 3-card hands or the stock.
  expect(inHands.length + played.length).toBeLessThanOrEqual(12 + r.stock.length);
}

function randomAction(s: GameState, rng: () => number): Action {
  const seat = pendingSeat(s)!;
  const moves = legalMoves(s, seat);
  if (s.phase === 'bidding') return { type: 'bid', seat, bid: pick(moves.bids, rng) };
  if (moves.canStop && rng() < 0.05) return { type: 'stop', seat };
  expect(moves.cards.length).toBeGreaterThan(0);
  const card = pick(moves.cards, rng);
  const declare = moves.declarable.some((d) => sameCard(d, card)) && rng() < 0.7;
  return { type: 'play', seat, card, declare };
}

describe('random full matches', () => {
  it('200 seeded matches finish at 21+ without illegal states', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      let s = createMatch(rng);
      let played: Card[] = [];
      let steps = 0;
      while (s.phase !== 'matchOver') {
        steps += 1;
        expect(steps).toBeLessThan(5000);
        // The state must survive serialisation (it is stored as JSON by the server).
        s = JSON.parse(JSON.stringify(s)) as GameState;
        expect('hands' in publicView(s).round).toBe(false);
        checkCards(s, played);

        if (s.phase === 'roundOver') {
          checkFinishedRound(s);
          s = applyAction(s, { type: 'nextRound' }, rng);
          played = [];
          continue;
        }
        // Every ~10th move is the automatic timeout move, which must always be accepted.
        const action = steps % 10 === 0 ? timeoutAction(s) : randomAction(s, rng);
        expect(action).not.toBeNull();
        s = applyAction(s, action!, rng);
        if (action!.type === 'play') played.push(action!.card);
      }
      checkFinishedRound(s);
      expect(Math.max(s.score.A, s.score.B)).toBeGreaterThanOrEqual(21);
    }
  });
});
