import { describe, expect, it } from 'vitest';
import { applyAction, legalCardsFor } from '../engine';
import type { GameState } from '../types';
import { autoplay, bid, c, passFirstStage, play, secondStageBid, stateWith } from './helpers';

// Dealer is seat 0 everywhere: first player = seat 1 (team B), partner = seat 3,
// opponents = seats 2 and 0 (team A). Play order among active seats: 1 → 2 → 0.
// Stage 1 (3 cards): Pas, Ciuri, Adunare. Stage 2 (5 cards, first player only): Pas, Mare, Mica, Tromful tău.

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

  it('the first Adunare ends bidding: the next seats do not speak', () => {
    let s = stateWith(0, { 1: bidder });
    s = bid(s, 1, { kind: 'adunare' });
    expect(s.phase).toBe('roundOver');
    expect(() => bid(s, 2, { kind: 'pass' })).toThrow('Acțiunea nu e permisă acum');
  });

  it('a later seat may bid it in stage 1', () => {
    let s = stateWith(0, { 2: bidder, 3: opp2, 1: [c('rosu', 4), c('verde', 4), c('rosu', 3)] });
    s = bid(s, 1, { kind: 'pass' });
    s = bid(s, 2, { kind: 'adunare' });
    expect(s.round.result).toMatchObject({ winner: 'A', points: 12, reason: 'contract-made', bidder: 2, adunareSum: 66 });
    expect(s.round.result?.revealed?.map((x) => x.seat)).toEqual([2, 3, 1]);
  });
});

describe('Ciuri by a later seat', () => {
  it('seat 2 bids it after the first player passed; seat 2 leads and seat 0 sits out', () => {
    let s = stateWith(0, { 2: [c('rosu', 3), c('rosu', 4), c('rosu', 11)] });
    s = bid(s, 1, { kind: 'pass' });
    s = bid(s, 2, { kind: 'ciuri' });
    expect(s.phase).toBe('playing');
    expect(s.round.biddingStage).toBe('first');
    expect(s.round).toMatchObject({ mode: 'ciuri', bidder: 2, trump: 'rosu', turn: 2, active: [2, 3, 1] });
    expect(s.round.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
  });
});

describe('two-stage bidding', () => {
  it('stage 1 rejects Mare, Mica and Tromful tău', () => {
    const s = stateWith(0, {});
    expect(() => bid(s, 1, { kind: 'mare' })).toThrow('Licitație nepermisă');
    expect(() => bid(s, 1, { kind: 'mica' })).toThrow('Licitație nepermisă');
    expect(() => bid(s, 1, { kind: 'tromf', suit: 'rosu' })).toThrow('Licitație nepermisă');
  });

  it('after four passes everyone has 5 cards, the trump card stays hidden and the first player speaks again', () => {
    const s = passFirstStage(stateWith(0, {}, { 0: [c('rosu', 2), c('duba', 11)] }));
    expect(s.phase).toBe('bidding');
    expect(s.round.biddingStage).toBe('second');
    expect(s.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(s.round.trumpCard).toBeNull();
    expect(s.round.trump).toBeNull();
    expect(s.round.turn).toBe(1);
    expect(s.round.bids).toHaveLength(4);
  });

  it('stage 2: only the first player speaks, and Ciuri/Adunare are no longer allowed', () => {
    const s = passFirstStage(stateWith(0, { 1: [c('verde', 3), c('verde', 4), c('rosu', 2)] }));
    expect(() => bid(s, 2, { kind: 'pass' })).toThrow('Nu e rândul tău');
    expect(() => bid(s, 1, { kind: 'ciuri' })).toThrow('Licitație nepermisă');
    expect(() => bid(s, 1, { kind: 'adunare' })).toThrow('Licitație nepermisă');
  });

  it('stage 2 with dealer 3: seat 0 speaks and plays against seats 1 and 3', () => {
    const s = passFirstStage(stateWith(3, {}));
    expect(s.round.biddingStage).toBe('second');
    expect(s.round.turn).toBe(0);
    const out = bid(s, 0, { kind: 'mare' });
    expect(out.round).toMatchObject({ mode: 'mare', bidder: 0, active: [0, 1, 3], turn: 0 });
  });
});

describe('Mare (5 cards)', () => {
  const aces = { 1: [c('rosu', 11), c('verde', 11), c('ghinda', 11)] };

  it('made after 5 tricks when nobody plays a higher card of the led suit: +6', () => {
    let s = secondStageBid(stateWith(0, aces, { 1: [c('duba', 11), c('rosu', 10)] }), { kind: 'mare' });
    expect(s.phase).toBe('playing');
    expect(s.round).toMatchObject({ mode: 'mare', bidder: 1, trump: null, trumpCard: null, turn: 1, active: [1, 2, 0] });
    expect(s.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    const partnerCards = s.round.hands[3];
    s = autoplay(s);
    expect(s.round.tricksPlayed).toBe(5);
    expect(s.round.result).toMatchObject({ winner: 'B', points: 6, reason: 'contract-made', mode: 'mare', bidder: 1 });
    expect(s.score).toEqual({ A: 0, B: 6 });
    // the partner sat out with their 5 cards set aside
    expect(s.round.hands[3]).toEqual(partnerCards);
  });

  it('the bidder leads every trick', () => {
    let s = secondStageBid(stateWith(0, aces, { 1: [c('duba', 11), c('rosu', 10)] }), { kind: 'mare' });
    for (let k = 0; k < 3; k++) s = play(s, s.round.turn, legalCardsFor(s.round, s.round.turn)[0]);
    expect(s.round.tricksPlayed).toBe(1);
    expect(s.round.turn).toBe(1);
    expect(s.round.leader).toBe(1);
  });

  it('fails immediately in the 4th trick when an opponent must play higher: +6 for the opponents', () => {
    let s = secondStageBid(
      stateWith(
        0,
        { ...aces, 2: [c('rosu', 2), c('verde', 2), c('ghinda', 2)] },
        { 1: [c('duba', 10), c('duba', 2)], 2: [c('duba', 11), c('rosu', 3)] },
      ),
      { kind: 'mare' },
    );
    s = autoplay(s);
    expect(s.round.tricksPlayed).toBe(3);
    expect(s.round.lastTrick).toEqual([{ seat: 1, card: c('duba', 10) }, { seat: 2, card: c('duba', 11) }]);
    expect(s.round.result).toMatchObject({ winner: 'A', points: 6, reason: 'contract-failed', mode: 'mare' });
    expect(s.score).toEqual({ A: 6, B: 0 });
  });

  it('fails when the second opponent plays higher after the first followed safely', () => {
    let s = secondStageBid(
      stateWith(0, {
        1: [c('rosu', 10), c('verde', 11), c('ghinda', 11)],
        2: [c('rosu', 2), c('duba', 2), c('duba', 3)],
        0: [c('rosu', 11), c('duba', 4), c('duba', 10)],
      }),
      { kind: 'mare' },
    );
    s = play(s, 1, c('rosu', 10));
    s = play(s, 2, c('rosu', 2));
    expect(s.phase).toBe('playing');
    expect(s.round.turn).toBe(0);
    s = play(s, 0, c('rosu', 11));
    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'A', points: 6, reason: 'contract-failed', mode: 'mare' });
  });

  it('declarations are rejected', () => {
    const s = secondStageBid(stateWith(0, { 1: [c('rosu', 3), c('rosu', 4), c('verde', 11)] }), { kind: 'mare' });
    expect(() => play(s, 1, c('rosu', 3), true)).toThrow('Nu poți striga');
  });

  it('opponents must follow suit but are not forced to beat', () => {
    let s = secondStageBid(
      stateWith(
        0,
        { 1: [c('rosu', 3), c('verde', 11), c('ghinda', 11)], 2: [c('rosu', 11), c('rosu', 2), c('duba', 3)] },
        { 2: [c('duba', 4), c('duba', 10)] },
      ),
      { kind: 'mare' },
    );
    s = play(s, 1, c('rosu', 3));
    expect(legalCardsFor(s.round, 2)).toEqual([c('rosu', 11), c('rosu', 2)]);
  });
});

describe('Mica (5 cards)', () => {
  it('made after 5 tricks: +4', () => {
    let s = secondStageBid(
      stateWith(0, { 1: [c('rosu', 2), c('verde', 2), c('ghinda', 2)] }, { 1: [c('duba', 2), c('rosu', 3)] }),
      { kind: 'mica' },
    );
    expect(s.round).toMatchObject({ mode: 'mica', trump: null, trumpCard: null, active: [1, 2, 0] });
    s = autoplay(s);
    expect(s.round.tricksPlayed).toBe(5);
    expect(s.round.result).toMatchObject({ winner: 'B', points: 4, reason: 'contract-made', mode: 'mica' });
    expect(s.score).toEqual({ A: 0, B: 4 });
  });

  it('fails in the 5th trick when an opponent must play lower: +4 for the opponents', () => {
    let s = secondStageBid(
      stateWith(
        0,
        {
          1: [c('rosu', 2), c('verde', 2), c('ghinda', 2)],
          2: [c('rosu', 11), c('verde', 11), c('ghinda', 11)],
          0: [c('rosu', 3), c('verde', 3), c('ghinda', 3)],
        },
        { 1: [c('duba', 2), c('verde', 10)], 2: [c('duba', 11), c('rosu', 10)], 0: [c('duba', 3), c('verde', 4)] },
      ),
      { kind: 'mica' },
    );
    s = autoplay(s);
    expect(s.round.tricksPlayed).toBe(4);
    expect(s.round.lastTrick?.at(-1)).toEqual({ seat: 0, card: c('verde', 4) });
    expect(s.round.result).toMatchObject({ winner: 'A', points: 4, reason: 'contract-failed', mode: 'mica' });
    expect(s.score).toEqual({ A: 4, B: 0 });
  });

  it('declarations are rejected', () => {
    const s = secondStageBid(stateWith(0, { 1: [c('rosu', 3), c('rosu', 4), c('verde', 2)] }), { kind: 'mica' });
    expect(() => play(s, 1, c('rosu', 4), true)).toThrow('Nu poți striga');
  });

  it('fails immediately when an opponent plays lower of the led suit', () => {
    let s = secondStageBid(
      stateWith(0, { 1: [c('rosu', 3), c('verde', 2), c('ghinda', 2)], 2: [c('rosu', 2), c('duba', 3), c('duba', 4)] }),
      { kind: 'mica' },
    );
    s = play(s, 1, c('rosu', 3));
    s = play(s, 2, c('rosu', 2));
    expect(s.round.result).toMatchObject({ winner: 'A', points: 4, reason: 'contract-failed' });
  });
});

describe('Tromful tău (5 cards)', () => {
  it('bidder picks trump after seeing 5 cards; partner sits out with 5 cards set aside', () => {
    const s = secondStageBid(stateWith(0, {}), { kind: 'tromf', suit: 'ghinda' });
    expect(s.phase).toBe('playing');
    expect(s.round).toMatchObject({ mode: 'tromf', trump: 'ghinda', trumpCard: null, turn: 1, active: [1, 2, 0] });
    expect(s.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
  });

  function tromfRosu(first: Parameters<typeof stateWith>[1], second: Parameters<typeof stateWith>[2]): GameState {
    return secondStageBid(stateWith(0, first, second), { kind: 'tromf', suit: 'rosu' });
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
    expect(s.round.hands[3]).toHaveLength(5);
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

  it('plays to the end even after 66 is reached', () => {
    let s = strongBidder();
    for (let k = 0; k < 9; k++) s = play(s, s.round.turn, legalCardsFor(s.round, s.round.turn)[0]);
    expect(s.round.points.B).toBeGreaterThanOrEqual(66);
    expect(s.phase).toBe('playing');
  });

  it('allows declarations: 40 for the trump marriage, including one completed by the 2 extra cards', () => {
    let s = tromfRosu({ 1: [c('rosu', 3), c('verde', 11), c('verde', 10)] }, { 1: [c('rosu', 4), c('ghinda', 11)] });
    s = play(s, 1, c('rosu', 4), true);
    expect(s.round.declared).toEqual([{ seat: 1, suit: 'rosu', points: 40 }]);
    expect(s.round.points).toEqual({ A: 0, B: 40 });
    expect(s.round.hands[1]).toContainEqual(c('rosu', 3));
  });

  it('Stop is not allowed in a contract round', () => {
    let s = strongBidder();
    expect(() => applyAction(s, { type: 'stop', seat: 1 })).toThrow('Nu poți opri acum');
    for (let k = 0; k < 3; k++) s = play(s, s.round.turn, legalCardsFor(s.round, s.round.turn)[0]);
    expect(s.round.tricksPlayed).toBe(1);
    for (const seat of [0, 1, 2, 3] as const) {
      expect(() => applyAction(s, { type: 'stop', seat })).toThrow('Nu poți opri acum');
    }
  });

  it('can only be bid in stage 2, by the first player', () => {
    let s = stateWith(0, {});
    expect(() => bid(s, 1, { kind: 'tromf', suit: 'rosu' })).toThrow('Licitație nepermisă');
    s = bid(s, 1, { kind: 'pass' });
    expect(() => bid(s, 2, { kind: 'tromf', suit: 'rosu' })).toThrow('Licitație nepermisă');
    expect(() => bid(s, 2, { kind: 'mare' })).toThrow('Licitație nepermisă');
  });
});
