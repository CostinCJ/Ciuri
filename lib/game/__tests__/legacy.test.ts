import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine';
import { legalMoves, publicView } from '../views';
import type { GameState } from '../types';
import { c, passAll, stateWith } from './helpers';

const NO_TRUMP_FIRST = {
  1: [c('rosu', 2), c('rosu', 3), c('rosu', 4)],
  3: [c('verde', 2), c('verde', 3), c('verde', 4)],
  0: [c('duba', 2), c('duba', 3), c('duba', 4)],
};
const NO_TRUMP_SECOND = {
  1: [c('rosu', 10), c('rosu', 11)],
  3: [c('verde', 10), c('verde', 11)],
  0: [c('duba', 10), c('duba', 11)],
};

/** A game as saved before two-stage bidding: the round has no `biddingStage` and no `redeals`. */
function legacy(state: GameState): GameState {
  const round: Partial<GameState['round']> = structuredClone(state.round);
  delete round.biddingStage;
  delete round.redeals;
  return { ...state, round: round as GameState['round'] };
}

const pass = (s: GameState, seat: 0 | 1 | 2 | 3) => applyAction(s, { type: 'bid', seat, bid: { kind: 'pass' } }, () => 0.5);

describe('games saved before two-stage bidding', () => {
  it('a legacy round in bidding is treated as stage 1 and reaches stage 2', () => {
    const s = legacy(stateWith(0, NO_TRUMP_FIRST, NO_TRUMP_SECOND));
    expect(legalMoves(s, 1).bids.map((b) => b.kind)).toEqual(['pass', 'ciuri', 'adunare']);
    expect(publicView(s).round).toMatchObject({ biddingStage: 'first', redeals: 0 });

    const stage2 = pass(pass(pass(pass(s, 1), 2), 3), 0);
    expect(stage2.round.biddingStage).toBe('second');
    expect(stage2.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(legalMoves(stage2, 1).bids.map((b) => b.kind)).toContain('mica');

    // The dealer's opponents hold no trump: the redeal counter starts from 0, never NaN.
    const redealt = pass(stage2, 1);
    expect(redealt.phase).toBe('bidding');
    expect(redealt.round.redeals).toBe(1);
    expect(Number.isNaN(redealt.round.redeals)).toBe(false);
  });

  it('a legacy round in play keeps working (cards and Stop)', () => {
    const s = legacy(passAll(stateWith(0, { 1: [c('verde', 3), c('verde', 4), c('rosu', 2)] }, {})));
    expect(s.phase).toBe('playing');
    const moves = legalMoves(s, 1);
    expect(moves.cards.length).toBeGreaterThan(0);
    expect(legalMoves(s, 2).canStop).toBe(true);
    const next = applyAction(s, { type: 'play', seat: 1, card: moves.cards[0] });
    expect(next.round).toMatchObject({ biddingStage: 'first', redeals: 0 });
    const stopped = applyAction(next, { type: 'stop', seat: 3 });
    expect(stopped.round.result?.reason).toBe('stop');
  });
});
