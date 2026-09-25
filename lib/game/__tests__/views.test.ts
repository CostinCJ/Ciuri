import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine';
import { legalMoves, pendingSeat, publicView, timeoutAction } from '../views';
import { bid, c, passAll, passRest, play, stateWith } from './helpers';

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
  it('only the seat on turn has moves', () => {
    const s = stateWith(0, FIRST, SECOND);
    expect(pendingSeat(s)).toBe(1);
    expect(legalMoves(s, 2)).toEqual({ bids: [], cards: [], declarable: [], canStop: false });
    expect(legalMoves(s, 1).bids.map((b) => b.kind)).toContain('ciuri');
  });

  it('lists playable and declarable cards during play', () => {
    const s = passAll(stateWith(0, FIRST, SECOND));
    const m = legalMoves(s, 1);
    expect(m.cards).toHaveLength(5);
    // seat 1 holds two marriages: verde (trump) and ghinda
    expect(m.declarable).toEqual([c('verde', 3), c('verde', 4), c('ghinda', 3), c('ghinda', 4)]);
    expect(m.canStop).toBe(false);
  });
});

describe('timeoutAction', () => {
  it('passes during bidding', () => {
    expect(timeoutAction(stateWith(0, FIRST, SECOND))).toEqual({ type: 'bid', seat: 1, bid: { kind: 'pass' } });
  });

  it('plays the lowest legal card', () => {
    let s = passAll(stateWith(0, FIRST, SECOND));
    s = play(s, 1, c('verde', 3));
    s = play(s, 2, c('ghinda', 11));
    expect(timeoutAction(s)).toEqual({ type: 'play', seat: 3, card: c('verde', 10) });
  });

  it('breaks rank ties by suit order (rosu, verde, ghinda, duba)', () => {
    let s = stateWith(0, { 1: [c('ghinda', 2), c('verde', 2), c('rosu', 2)] });
    s = bid(s, 1, { kind: 'mica' });
    s = passRest(s, [2, 3, 0]);
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
});
