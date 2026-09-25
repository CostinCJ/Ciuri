import { describe, expect, it } from 'vitest';
import { legalCardsFor } from '../engine';
import { autoplay, bid, c, play, stateWith } from './helpers';

// Dealer is seat 0 everywhere: first player = seat 1 (team B), partner = seat 3,
// opponents = seats 2 and 0 (team A). Play order among active seats: 1 → 2 → 0.

describe('Ciuri', () => {
  it('made: trump = marriage suit, 3 cards, partner out, auto 40, +12', () => {
    let s = stateWith(0, {
      1: [c('verde', 3), c('verde', 4), c('verde', 11)],
      2: [c('rosu', 11), c('rosu', 10), c('rosu', 2)],
      0: [c('duba', 11), c('duba', 10), c('duba', 2)],
    });
    s = bid(s, 1, { kind: 'ciuri' });
    expect(s.phase).toBe('playing');
    expect(s.round.mode).toBe('ciuri');
    expect(s.round.trump).toBe('verde');
    expect(s.round.active).toEqual([1, 2, 0]);
    expect(s.round.hands[1]).toHaveLength(3);
    expect(s.round.turn).toBe(1);

    s = play(s, 1, c('verde', 11));
    s = play(s, 2, c('rosu', 11));
    expect(s.round.turn).toBe(0); // partner (seat 3) is skipped
    s = play(s, 0, c('duba', 11));
    expect(s.round.points.B).toBe(33);

    s = play(s, 1, c('verde', 4)); // automatic declaration
    expect(s.round.points.B).toBe(73);
    s = play(s, 2, c('rosu', 10));
    s = play(s, 0, c('duba', 10));

    // play continues to the end even though 66 is already reached
    expect(s.phase).toBe('playing');
    s = play(s, 1, c('verde', 3));
    s = play(s, 2, c('rosu', 2));
    s = play(s, 0, c('duba', 2));

    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'B', points: 12, reason: 'contract-made', mode: 'ciuri' });
    expect(s.score).toEqual({ A: 0, B: 12 });
  });

  it('first lead must be a trump when the third card is another suit', () => {
    let s = stateWith(0, {
      1: [c('verde', 3), c('verde', 4), c('rosu', 2)],
      2: [c('verde', 11), c('verde', 10), c('rosu', 11)],
      0: [c('duba', 11), c('duba', 10), c('verde', 2)],
    });
    s = bid(s, 1, { kind: 'ciuri' });
    expect(legalCardsFor(s.round, 1)).toEqual([c('verde', 3), c('verde', 4)]);
    expect(() => play(s, 1, c('rosu', 2))).toThrow('Carte nepermisă');
  });

  it('failed: under 66 gives 12 to the opponents', () => {
    let s = stateWith(0, {
      1: [c('verde', 3), c('verde', 4), c('rosu', 2)],
      2: [c('verde', 11), c('verde', 10), c('rosu', 11)],
      0: [c('duba', 11), c('duba', 10), c('verde', 2)],
    });
    s = bid(s, 1, { kind: 'ciuri' });
    s = play(s, 1, c('verde', 4));
    expect(s.round.points.B).toBe(40);
    s = play(s, 2, c('verde', 11));
    s = play(s, 0, c('verde', 2));
    expect(s.round.turn).toBe(2);
    s = play(s, 2, c('rosu', 11));
    s = play(s, 0, c('duba', 10));
    s = play(s, 1, c('rosu', 2));
    s = play(s, 2, c('verde', 10));
    s = play(s, 0, c('duba', 11));
    s = play(s, 1, c('verde', 3));
    expect(s.round.result).toMatchObject({ winner: 'A', points: 12, reason: 'contract-failed' });
    expect(s.score).toEqual({ A: 12, B: 0 });
  });
});

describe('Adunare', () => {
  const bidder = [c('rosu', 11), c('verde', 11), c('ghinda', 11)]; // 33
  const opp2 = [c('rosu', 10), c('verde', 10), c('duba', 2)]; // 22

  it('66 or more wins 12 immediately, partner cards are not revealed', () => {
    let s = stateWith(0, { 1: bidder, 2: opp2, 0: [c('rosu', 4), c('verde', 4), c('rosu', 3)] }); // 11
    s = bid(s, 1, { kind: 'adunare' });
    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'B', points: 12, reason: 'contract-made', adunareSum: 66 });
    expect(s.round.result?.revealed?.map((x) => x.seat)).toEqual([1, 2, 0]);
    expect(s.score).toEqual({ A: 0, B: 12 });
  });

  it('65 gives 12 to the opponents', () => {
    let s = stateWith(0, { 1: bidder, 2: opp2, 0: [c('rosu', 4), c('verde', 4), c('rosu', 2)] }); // 10
    s = bid(s, 1, { kind: 'adunare' });
    expect(s.round.result).toMatchObject({ winner: 'A', points: 12, adunareSum: 65 });
  });

  it('a later player can outbid the first player’s small contract', () => {
    let s = stateWith(0, { 2: bidder });
    s = bid(s, 1, { kind: 'mica' });
    s = bid(s, 2, { kind: 'adunare' });
    expect(s.phase).toBe('roundOver');
    expect(s.round.bidder).toBe(2);
    expect(s.round.mode).toBe('adunare');
  });
});

describe('Mare', () => {
  it('made when nobody plays a higher card of the led suit: +6', () => {
    let s = stateWith(0, { 1: [c('rosu', 11), c('verde', 11), c('ghinda', 11)] });
    s = bid(s, 1, { kind: 'mare' });
    for (const seat of [2, 3, 0] as const) s = bid(s, seat, { kind: 'pass' });
    expect(s.round.trump).toBeNull();
    s = autoplay(s);
    expect(s.round.result).toMatchObject({ winner: 'B', points: 6, reason: 'contract-made', mode: 'mare' });
    expect(s.round.tricksPlayed).toBe(3);
  });

  it('fails immediately when an opponent plays higher of the led suit', () => {
    let s = stateWith(0, {
      1: [c('rosu', 10), c('verde', 11), c('ghinda', 11)],
      2: [c('rosu', 11), c('duba', 2), c('duba', 3)],
    });
    s = bid(s, 1, { kind: 'mare' });
    for (const seat of [2, 3, 0] as const) s = bid(s, seat, { kind: 'pass' });
    s = play(s, 1, c('rosu', 10));
    s = play(s, 2, c('rosu', 11));
    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'A', points: 6, reason: 'contract-failed' });
  });

  it('opponents must follow suit but are not forced to beat', () => {
    let s = stateWith(0, {
      1: [c('rosu', 3), c('verde', 11), c('ghinda', 11)],
      2: [c('rosu', 11), c('rosu', 2), c('duba', 3)],
    });
    s = bid(s, 1, { kind: 'mare' });
    for (const seat of [2, 3, 0] as const) s = bid(s, seat, { kind: 'pass' });
    s = play(s, 1, c('rosu', 3));
    expect(legalCardsFor(s.round, 2)).toEqual([c('rosu', 11), c('rosu', 2)]);
  });
});

describe('Mica', () => {
  it('made with only twos: +4', () => {
    let s = stateWith(0, { 1: [c('rosu', 2), c('verde', 2), c('ghinda', 2)] });
    s = bid(s, 1, { kind: 'mica' });
    for (const seat of [2, 3, 0] as const) s = bid(s, seat, { kind: 'pass' });
    s = autoplay(s);
    expect(s.round.result).toMatchObject({ winner: 'B', points: 4, reason: 'contract-made', mode: 'mica' });
  });

  it('fails immediately when an opponent plays lower of the led suit', () => {
    let s = stateWith(0, {
      1: [c('rosu', 3), c('verde', 2), c('ghinda', 2)],
      2: [c('rosu', 2), c('duba', 3), c('duba', 4)],
    });
    s = bid(s, 1, { kind: 'mica' });
    for (const seat of [2, 3, 0] as const) s = bid(s, seat, { kind: 'pass' });
    s = play(s, 1, c('rosu', 3));
    s = play(s, 2, c('rosu', 2));
    expect(s.round.result).toMatchObject({ winner: 'A', points: 4, reason: 'contract-failed' });
  });
});

describe('Tromful tău', () => {
  it('bidder picks trump; bidder and opponents get 5 cards; partner sits out', () => {
    let s = stateWith(0, {});
    s = bid(s, 1, { kind: 'tromf', suit: 'ghinda' });
    for (const seat of [2, 3, 0] as const) s = bid(s, seat, { kind: 'pass' });
    expect(s.phase).toBe('playing');
    expect(s.round.mode).toBe('tromf');
    expect(s.round.trump).toBe('ghinda');
    expect(s.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 3]);
    expect(s.round.turn).toBe(1);
  });

  it('is scored at the end: 66+ for the bidder team gives 6, otherwise 6 to opponents', () => {
    let s = stateWith(0, {});
    s = bid(s, 1, { kind: 'tromf', suit: 'ghinda' });
    for (const seat of [2, 3, 0] as const) s = bid(s, seat, { kind: 'pass' });
    s = autoplay(s);
    expect(s.round.tricksPlayed).toBe(5);
    const made = s.round.points.B >= 66;
    expect(s.round.result).toMatchObject({ winner: made ? 'B' : 'A', points: 6, mode: 'tromf' });
  });

  it('only the first player may bid it', () => {
    let s = stateWith(0, {});
    s = bid(s, 1, { kind: 'pass' });
    expect(() => bid(s, 2, { kind: 'tromf', suit: 'rosu' })).toThrow('Licitație nepermisă');
    expect(() => bid(s, 2, { kind: 'mare' })).toThrow('Licitație nepermisă');
  });
});
