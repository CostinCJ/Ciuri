import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine';
import { legalMoves, pendingSeat, publicView, timeoutAction } from '../views';
import type { Card, GameState } from '../types';
import { bid, c, passAll, passFirstStage, play, secondStageBid, stateWith } from './helpers';

const FIRST = {
  1: [c('verde', 3), c('verde', 4), c('rosu', 2)],
  2: [c('ghinda', 11), c('rosu', 10), c('duba', 2)],
  3: [c('verde', 11), c('rosu', 3), c('duba', 3)],
  0: [c('rosu', 4), c('duba', 4), c('ghinda', 2)],
};
const SECOND = {
  1: [c('ghinda', 3), c('ghinda', 4)],
  2: [c('duba', 10), c('duba', 11)],
  3: [c('verde', 10), c('ghinda', 10)],
  0: [c('rosu', 11), c('verde', 2)],
};

describe('pendingSeat / legalMoves', () => {
  it('during bidding only the seat on turn has moves', () => {
    const s = stateWith(0, FIRST, SECOND);
    expect(pendingSeat(s)).toBe(1);
    expect(legalMoves(s, 2)).toEqual({ bids: [], cards: [], declarable: [], canStop: false });
    expect(legalMoves(s, 1).bids.map((b) => b.kind)).toEqual(['pass', 'ciuri', 'adunare']);
  });

  it('in stage 2 only the first player has bids', () => {
    const s = passFirstStage(stateWith(0, FIRST, SECOND));
    expect(pendingSeat(s)).toBe(1);
    expect(legalMoves(s, 1).bids.map((b) => b.kind)).toEqual(['pass', 'mare', 'mica', 'tromf', 'tromf', 'tromf', 'tromf']);
    for (const seat of [0, 2, 3] as const) {
      expect(legalMoves(s, seat)).toEqual({ bids: [], cards: [], declarable: [], canStop: false });
    }
  });

  it('lists playable and declarable cards during play', () => {
    const s = passAll(stateWith(0, FIRST, SECOND));
    const m = legalMoves(s, 1);
    expect(m.cards).toHaveLength(5);
    // seat 1 holds two marriages: verde (trump) and ghinda
    expect(m.declarable).toEqual([c('verde', 3), c('verde', 4), c('ghinda', 3), c('ghinda', 4)]);
    expect(m.canStop).toBe(true);
  });

  it('in a normal game every seat may stop, but only the seat on turn has cards', () => {
    const s = play(passAll(stateWith(0, FIRST, SECOND)), 1, c('verde', 3));
    expect(pendingSeat(s)).toBe(2);
    for (const seat of [0, 1, 3] as const) {
      expect(legalMoves(s, seat)).toEqual({ bids: [], cards: [], declarable: [], canStop: true });
    }
    expect(legalMoves(s, 2).cards.length).toBeGreaterThan(0);
    expect(legalMoves(s, 2).canStop).toBe(true);
  });

  it('offers no Stop in a contract round', () => {
    const s = secondStageBid(stateWith(0, FIRST, SECOND), { kind: 'tromf', suit: 'rosu' });
    for (const seat of [0, 1, 2, 3] as const) expect(legalMoves(s, seat).canStop).toBe(false);
    expect(legalMoves(s, 3)).toEqual({ bids: [], cards: [], declarable: [], canStop: false });
  });

  it('allows Stop after the first trick of a normal game', () => {
    let s = passAll(stateWith(0, FIRST, SECOND));
    s = play(s, 1, c('verde', 3));
    s = play(s, 2, c('ghinda', 11));
    s = play(s, 3, c('verde', 10));
    s = play(s, 0, c('verde', 2));
    expect(pendingSeat(s)).toBe(3);
    expect(legalMoves(s, 3).canStop).toBe(true);
  });

  it('offers no moves after matchOver', () => {
    const s = passAll(stateWith(0, FIRST, SECOND));
    const over = { ...s, phase: 'matchOver' as const };
    expect(pendingSeat(over)).toBeNull();
    expect(legalMoves(over, 1)).toEqual({ bids: [], cards: [], declarable: [], canStop: false });
  });

  it('does not offer the automatic Ciuri trump declaration as a choice', () => {
    let s = stateWith(0, { 1: [c('verde', 3), c('verde', 4), c('rosu', 2)] });
    s = bid(s, 1, { kind: 'ciuri' });
    const m = legalMoves(s, 1);
    expect(m.cards).toEqual([c('verde', 3), c('verde', 4)]);
    expect(m.declarable).toEqual([]);
  });
});

describe('timeoutAction', () => {
  it('passes during bidding', () => {
    expect(timeoutAction(stateWith(0, FIRST, SECOND))).toEqual({ type: 'bid', seat: 1, bid: { kind: 'pass' } });
    const stage2 = passFirstStage(stateWith(0, FIRST, SECOND));
    expect(timeoutAction(stage2)).toEqual({ type: 'bid', seat: 1, bid: { kind: 'pass' } });
    expect(applyAction(stage2, timeoutAction(stage2)!).phase).toBe('playing');
  });

  it('plays the lowest legal card', () => {
    let s = passAll(stateWith(0, FIRST, SECOND));
    s = play(s, 1, c('verde', 3));
    s = play(s, 2, c('ghinda', 11));
    expect(timeoutAction(s)).toEqual({ type: 'play', seat: 3, card: c('verde', 10) });
  });

  it('breaks rank ties by suit order (rosu, verde, ghinda, duba)', () => {
    const s = secondStageBid(
      stateWith(0, { 1: [c('ghinda', 2), c('verde', 2), c('rosu', 2)] }, { 1: [c('duba', 2), c('ghinda', 3)] }),
      { kind: 'mica' },
    );
    expect(timeoutAction(s)).toEqual({ type: 'play', seat: 1, card: c('rosu', 2) });
  });

  it('in Ciuri the automatic first lead is a trump and is auto-declared', () => {
    let s = stateWith(0, {
      1: [c('verde', 3), c('verde', 4), c('rosu', 2)],
      2: [c('verde', 11), c('verde', 10), c('rosu', 11)],
      0: [c('duba', 11), c('duba', 10), c('verde', 2)],
    });
    s = bid(s, 1, { kind: 'ciuri' });
    const action = timeoutAction(s);
    expect(action).toEqual({ type: 'play', seat: 1, card: c('verde', 3) });
    s = applyAction(s, action!);
    expect(s.round.points.B).toBe(40);
  });

  // Dealer 0: seat 1 bids and leads; opponents follow as seat 2, then seat 0.
  const mareMica = (mode: 'mare' | 'mica', seat2: [Card[], Card[]]): GameState => {
    let s = stateWith(
      0,
      { 1: [c('verde', 4), c('rosu', 11), c('ghinda', 11)], 2: seat2[0] },
      { 1: [c('duba', 11), c('rosu', 10)], 2: seat2[1] },
    );
    s = secondStageBid(s, { kind: mode });
    return play(s, 1, c('verde', 4));
  };

  it('in Mica a timed-out opponent plays higher than the lead rather than break the contract', () => {
    const s = mareMica('mica', [[c('verde', 3), c('verde', 10), c('rosu', 2)], [c('ghinda', 2), c('duba', 2)]]);
    const action = timeoutAction(s);
    expect(action).toEqual({ type: 'play', seat: 2, card: c('verde', 10) });
    const after = applyAction(s, action!);
    expect(after.phase).toBe('playing');
    expect(after.round.result).toBeNull();
  });

  it('in Mica a timed-out opponent whose only led-suit card is lower must play it and the contract fails', () => {
    const s = mareMica('mica', [[c('verde', 3), c('rosu', 2), c('rosu', 3)], [c('ghinda', 2), c('duba', 2)]]);
    const action = timeoutAction(s);
    expect(action).toEqual({ type: 'play', seat: 2, card: c('verde', 3) });
    const after = applyAction(s, action!);
    expect(after.phase).toBe('roundOver');
    expect(after.round.result?.reason).toBe('contract-failed');
  });

  it('in Mare a timed-out opponent plays lower than the lead rather than break the contract', () => {
    const s = mareMica('mare', [[c('verde', 10), c('verde', 3), c('rosu', 2)], [c('ghinda', 2), c('duba', 2)]]);
    const action = timeoutAction(s);
    expect(action).toEqual({ type: 'play', seat: 2, card: c('verde', 3) });
    expect(applyAction(s, action!).phase).toBe('playing');
  });

  it('starts the next round after roundOver and does nothing after matchOver', () => {
    let s = stateWith(0, { 1: [c('rosu', 11), c('verde', 11), c('ghinda', 11)] });
    s = bid(s, 1, { kind: 'adunare' });
    expect(timeoutAction(s)).toEqual({ type: 'nextRound' });
    expect(timeoutAction({ ...s, phase: 'matchOver' })).toBeNull();
  });
});

describe('publicView', () => {
  it('hides hands and stock but exposes hand sizes', () => {
    const s = passAll(stateWith(0, FIRST, SECOND));
    const view = publicView(s);
    expect('hands' in view.round).toBe(false);
    expect('stock' in view.round).toBe(false);
    expect(view.round.handCounts).toEqual([5, 5, 5, 5]);
    expect(view.round.trumpCard).toEqual(c('verde', 2));
    expect(JSON.stringify(view)).not.toContain('"ghinda","rank":11');
  });

  it('exposes only hand sizes during bidding', () => {
    const view = publicView(stateWith(0, FIRST, SECOND));
    expect(view.round.handCounts).toEqual([3, 3, 3, 3]);
    expect('hands' in view.round).toBe(false);
  });

  it('leaks no hand card except the public trump card at the start of play', () => {
    const s = passAll(stateWith(0, FIRST, SECOND));
    const json = JSON.stringify(publicView(s));
    const trumpCard = s.round.trumpCard!;
    const hidden = s.round.hands.flat().filter((x) => !(x.suit === trumpCard.suit && x.rank === trumpCard.rank));
    expect(hidden).toHaveLength(19);
    for (const card of hidden) expect(json).not.toContain(JSON.stringify(card));
  });
});
