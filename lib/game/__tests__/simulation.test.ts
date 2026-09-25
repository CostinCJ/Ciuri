import { describe, expect, it } from 'vitest';
import {
  applyAction, createMatch, legalMoves, pendingSeat, publicView, sameCard, timeoutAction,
  type Action, type Card, type GameState, type Seat,
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
  if (r.result?.mode === 'mare' || r.result?.mode === 'mica' || r.result?.mode === 'tromf') {
    // Stage 2 contracts are played with 5 cards; the partner's 5 cards stay set aside.
    expect(r.hands[(r.bidder! + 2) % 4]).toHaveLength(5);
    if (r.result.reason === 'contract-made') expect(r.tricksPlayed).toBe(5);
  }
}

interface Stats {
  secondStage: number;
  secondStageContracts: number;
  redeals: number;
  stops: number;
  offTurnStops: number;
  earlyStops: number;
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

function randomAction(s: GameState, rng: () => number, stats: Stats): Action {
  const seat = pendingSeat(s)!;
  const moves = legalMoves(s, seat);
  if (s.phase === 'bidding') {
    // Pass often in stage 1 so that stage 2 (and redeals) happen regularly.
    if (s.round.biddingStage === 'first' && rng() < 0.8) return { type: 'bid', seat, bid: { kind: 'pass' } };
    return { type: 'bid', seat, bid: pick(moves.bids, rng) };
  }
  // Any active seat may stop at any moment of a normal game, not only the seat on turn.
  if (rng() < 0.03) {
    const stopper = pick([0, 1, 2, 3] as Seat[], rng);
    if (legalMoves(s, stopper).canStop) {
      stats.stops += 1;
      if (stopper !== seat) stats.offTurnStops += 1;
      if (s.round.tricksPlayed === 0) stats.earlyStops += 1;
      return { type: 'stop', seat: stopper };
    }
  }
  expect(moves.cards.length).toBeGreaterThan(0);
  const card = pick(moves.cards, rng);
  const declare = moves.declarable.some((d) => sameCard(d, card)) && rng() < 0.7;
  return { type: 'play', seat, card, declare };
}

describe('random full matches', () => {
  it('200 seeded matches finish at 21+ without illegal states', () => {
    const stats: Stats = { secondStage: 0, secondStageContracts: 0, redeals: 0, stops: 0, offTurnStops: 0, earlyStops: 0 };
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
        const action = steps % 10 === 0 ? timeoutAction(s) : randomAction(s, rng, stats);
        expect(action).not.toBeNull();
        const before = s;
        s = applyAction(s, action!, rng);
        if (before.phase === 'bidding' && before.round.biddingStage === 'first' && s.round.biddingStage === 'second') {
          stats.secondStage += 1;
          expect(s.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
          expect(s.round.turn).toBe((s.round.dealer + 1) % 4);
        }
        if (before.round.biddingStage === 'second' && s.phase === 'playing' && s.round.mode !== 'normal') {
          stats.secondStageContracts += 1;
        }
        if (s.round.redeals > before.round.redeals) {
          stats.redeals += 1;
          expect(s.score).toEqual(before.score);
          expect(s.roundNumber).toBe(before.roundNumber);
          expect(s.round.dealer).toBe(before.round.dealer);
        }
        if (action!.type === 'play') played.push(action!.card);
      }
      checkFinishedRound(s);
      expect(Math.max(s.score.A, s.score.B)).toBeGreaterThanOrEqual(21);
    }
    expect(stats.secondStage).toBeGreaterThan(0);
    expect(stats.secondStageContracts).toBeGreaterThan(0);
    expect(stats.redeals).toBeGreaterThan(0);
    expect(stats.offTurnStops).toBeGreaterThan(0);
    expect(stats.earlyStops).toBeGreaterThan(0);
  });
});
