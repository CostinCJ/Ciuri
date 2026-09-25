import { describe, expect, it } from 'vitest';
import { applyAction, legalCardsFor } from '../engine';
import type { GameState } from '../types';
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

  it('first lead may be any card when the third card is also trump', () => {
    let s = stateWith(0, { 1: [c('verde', 3), c('verde', 4), c('verde', 11)] });
    s = bid(s, 1, { kind: 'ciuri' });
    expect(legalCardsFor(s.round, 1)).toEqual([c('verde', 3), c('verde', 4), c('verde', 11)]);
    s = play(s, 1, c('verde', 11));
    expect(s.round.declared).toEqual([]);
    expect(s.round.points.B).toBe(0);
  });

  it('no 40 when the bidder plays the 3 or 4 while following instead of leading', () => {
    let s = stateWith(0, {
      1: [c('verde', 3), c('verde', 4), c('verde', 10)],
      2: [c('verde', 11), c('verde', 2), c('rosu', 11)],
      0: [c('duba', 11), c('duba', 10), c('rosu', 2)],
    });
    s = bid(s, 1, { kind: 'ciuri' });
    s = play(s, 1, c('verde', 10));
    s = play(s, 2, c('verde', 11));
    s = play(s, 0, c('duba', 11));
    expect(s.round.lastTrickWinner).toBe(2);
    expect(s.round.points).toEqual({ A: 32, B: 0 });

    s = play(s, 2, c('verde', 2));
    s = play(s, 0, c('duba', 10));
    s = play(s, 1, c('verde', 4)); // following: no declaration
    expect(s.round.lastTrickWinner).toBe(1);
    expect(s.round.declared).toEqual([]);
    expect(s.round.points).toEqual({ A: 32, B: 16 });

    s = play(s, 1, c('verde', 3)); // leading, but the pair is broken
    s = play(s, 2, c('rosu', 11));
    s = play(s, 0, c('rosu', 2));
    expect(s.round.declared).toEqual([]);
    expect(s.round.points).toEqual({ A: 32, B: 32 });
    expect(s.round.result).toMatchObject({ winner: 'A', points: 12, reason: 'contract-failed', mode: 'ciuri' });
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

  it('can end the match; nextRound is then rejected', () => {
    const start = stateWith(0, { 1: bidder, 2: opp2, 0: [c('rosu', 4), c('verde', 4), c('rosu', 3)] });
    const s = bid({ ...start, score: { A: 0, B: 10 } }, 1, { kind: 'adunare' });
    expect(s.phase).toBe('matchOver');
    expect(s.score).toEqual({ A: 0, B: 22 });
    expect(() => applyAction(s, { type: 'nextRound' })).toThrow('Acțiunea nu e permisă acum');
  });

  it('bidding ends immediately after the first player bids Mica', () => {
    let s = stateWith(0, { 2: bidder });
    s = bid(s, 1, { kind: 'mica' });
    expect(s.phase).toBe('playing');
    expect(s.round.bidder).toBe(1);
    expect(s.round.mode).toBe('mica');
    expect(() => bid(s, 2, { kind: 'adunare' })).toThrow('Acțiunea nu e permisă acum');
  });
});

describe('Mare', () => {
  it('made when nobody plays a higher card of the led suit: +6', () => {
    let s = stateWith(0, { 1: [c('rosu', 11), c('verde', 11), c('ghinda', 11)] });
    s = bid(s, 1, { kind: 'mare' });
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
    s = play(s, 1, c('rosu', 10));
    s = play(s, 2, c('rosu', 11));
    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'A', points: 6, reason: 'contract-failed' });
  });

  it('fails when the second opponent plays higher after the first followed safely', () => {
    let s = stateWith(0, {
      1: [c('rosu', 10), c('verde', 11), c('ghinda', 11)],
      2: [c('rosu', 2), c('duba', 2), c('duba', 3)],
      0: [c('rosu', 11), c('duba', 4), c('duba', 10)],
    });
    s = bid(s, 1, { kind: 'mare' });
    s = play(s, 1, c('rosu', 10));
    s = play(s, 2, c('rosu', 2));
    expect(s.phase).toBe('playing');
    expect(s.round.turn).toBe(0);
    s = play(s, 0, c('rosu', 11));
    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'A', points: 6, reason: 'contract-failed', mode: 'mare' });
    expect(s.score).toEqual({ A: 6, B: 0 });
  });

  it('declarations are rejected', () => {
    let s = stateWith(0, { 1: [c('rosu', 3), c('rosu', 4), c('verde', 11)] });
    s = bid(s, 1, { kind: 'mare' });
    expect(() => play(s, 1, c('rosu', 3), true)).toThrow('Nu poți striga');
  });

  it('opponents must follow suit but are not forced to beat', () => {
    let s = stateWith(0, {
      1: [c('rosu', 3), c('verde', 11), c('ghinda', 11)],
      2: [c('rosu', 11), c('rosu', 2), c('duba', 3)],
    });
    s = bid(s, 1, { kind: 'mare' });
    s = play(s, 1, c('rosu', 3));
    expect(legalCardsFor(s.round, 2)).toEqual([c('rosu', 11), c('rosu', 2)]);
  });
});

describe('Mica', () => {
  it('made with only twos: +4', () => {
    let s = stateWith(0, { 1: [c('rosu', 2), c('verde', 2), c('ghinda', 2)] });
    s = bid(s, 1, { kind: 'mica' });
    s = autoplay(s);
    expect(s.round.result).toMatchObject({ winner: 'B', points: 4, reason: 'contract-made', mode: 'mica' });
  });

  it('declarations are rejected', () => {
    let s = stateWith(0, { 1: [c('rosu', 3), c('rosu', 4), c('verde', 2)] });
    s = bid(s, 1, { kind: 'mica' });
    expect(() => play(s, 1, c('rosu', 4), true)).toThrow('Nu poți striga');
  });

  it('fails immediately when an opponent plays lower of the led suit', () => {
    let s = stateWith(0, {
      1: [c('rosu', 3), c('verde', 2), c('ghinda', 2)],
      2: [c('rosu', 2), c('duba', 3), c('duba', 4)],
    });
    s = bid(s, 1, { kind: 'mica' });
    s = play(s, 1, c('rosu', 3));
    s = play(s, 2, c('rosu', 2));
    expect(s.round.result).toMatchObject({ winner: 'A', points: 4, reason: 'contract-failed' });
  });
});

describe('Tromful tău', () => {
  it('bidder picks trump; bidder and opponents get 5 cards; partner sits out', () => {
    let s = stateWith(0, {});
    s = bid(s, 1, { kind: 'tromf', suit: 'ghinda' });
    expect(s.phase).toBe('playing');
    expect(s.round.mode).toBe('tromf');
    expect(s.round.trump).toBe('ghinda');
    expect(s.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 3]);
    expect(s.round.turn).toBe(1);
  });

  function tromfRosu(first: Parameters<typeof stateWith>[1], second: Parameters<typeof stateWith>[2]): GameState {
    return bid(stateWith(0, first, second), 1, { kind: 'tromf', suit: 'rosu' });
  }

  const strongBidder = (): GameState =>
    tromfRosu(
      {
        1: [c('rosu', 11), c('rosu', 10), c('rosu', 4)],
        2: [c('verde', 11), c('verde', 10), c('verde', 4)],
        0: [c('ghinda', 11), c('ghinda', 10), c('ghinda', 4)],
      },
      {
        1: [c('rosu', 3), c('rosu', 2)],
        2: [c('verde', 3), c('verde', 2)],
        0: [c('ghinda', 3), c('ghinda', 2)],
      },
    );

  it('made: bidder team reaches 66+ at the end and gets 6', () => {
    const s = autoplay(strongBidder());
    expect(s.round.tricksPlayed).toBe(5);
    expect(s.round.tricksTaken).toEqual({ A: 0, B: 5 });
    expect(s.round.points).toEqual({ A: 0, B: 90 });
    expect(s.round.result).toMatchObject({ winner: 'B', points: 6, reason: 'contract-made', mode: 'tromf', bidder: 1 });
    expect(s.score).toEqual({ A: 0, B: 6 });
  });

  it('failed: bidder team under 66 gives 6 to the opponents', () => {
    let s = tromfRosu(
      {
        1: [c('rosu', 2), c('verde', 2), c('ghinda', 2)],
        2: [c('rosu', 11), c('rosu', 10), c('rosu', 4)],
        0: [c('ghinda', 11), c('ghinda', 10), c('ghinda', 4)],
      },
      {
        1: [c('duba', 2), c('verde', 3)],
        2: [c('rosu', 3), c('verde', 11)],
        0: [c('ghinda', 3), c('verde', 10)],
      },
    );
    s = autoplay(s);
    expect(s.round.tricksPlayed).toBe(5);
    expect(s.round.tricksTaken).toEqual({ A: 5, B: 0 });
    expect(s.round.points).toEqual({ A: 88, B: 0 });
    expect(s.round.result).toMatchObject({ winner: 'A', points: 6, reason: 'contract-failed', mode: 'tromf' });
    expect(s.score).toEqual({ A: 6, B: 0 });
  });

  it('allows declarations: 40 for the trump marriage', () => {
    let s = tromfRosu({ 1: [c('rosu', 3), c('rosu', 4), c('verde', 11)] }, {});
    s = play(s, 1, c('rosu', 4), true);
    expect(s.round.declared).toEqual([{ seat: 1, suit: 'rosu', points: 40 }]);
    expect(s.round.points).toEqual({ A: 0, B: 40 });
    expect(s.round.hands[1]).toContainEqual(c('rosu', 3));
  });

  it('Stop is not allowed in a contract round', () => {
    let s = strongBidder();
    for (let k = 0; k < 3; k++) s = play(s, s.round.turn, legalCardsFor(s.round, s.round.turn)[0]);
    expect(s.round.tricksPlayed).toBe(1);
    expect(s.round.turn).toBe(1);
    expect(() => applyAction(s, { type: 'stop', seat: 1 })).toThrow('Nu poți opri acum');
  });

  it('only the first player may bid it', () => {
    let s = stateWith(0, {});
    s = bid(s, 1, { kind: 'pass' });
    expect(() => bid(s, 2, { kind: 'tromf', suit: 'rosu' })).toThrow('Licitație nepermisă');
    expect(() => bid(s, 2, { kind: 'mare' })).toThrow('Licitație nepermisă');
  });
});
