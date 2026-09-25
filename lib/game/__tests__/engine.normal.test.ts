import { describe, expect, it } from 'vitest';
import { applyAction, canStop, createMatch, dealRound, scoreNormal } from '../engine';
import { fullDeck } from '../cards';
import type { Action, Bid, Card, GameState } from '../types';
import { autoplay, bid, c, mulberry32, passAll, passFirstStage, play, stateWith } from './helpers';

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
const fresh = (): GameState => passAll(stateWith(0, FIRST, SECOND));

/** Seat 1 leads the verde 3 (declaring 40 if `declare`), seat 3 wins the first trick. */
function afterFirstTrick(declare: boolean): GameState {
  let s = play(fresh(), 1, c('verde', 3), declare);
  s = play(s, 2, c('ghinda', 11));
  s = play(s, 3, c('verde', 11));
  return play(s, 0, c('verde', 2));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('dealing', () => {
  it('deals 3 cards each starting after the dealer', () => {
    const deck = fullDeck();
    const r = dealRound(0, deck);
    expect(r.hands[1]).toEqual(deck.slice(0, 3));
    expect(r.hands[0]).toEqual(deck.slice(9, 12));
    expect(r.stock).toHaveLength(8);
    expect(r.turn).toBe(1);
  });

  it('createMatch starts in bidding with an empty score', () => {
    const s = createMatch(mulberry32(1), 2);
    expect(s.phase).toBe('bidding');
    expect(s.score).toEqual({ A: 0, B: 0 });
    expect(s.round.dealer).toBe(2);
    expect(s.round.turn).toBe(3);
  });
});

describe('normal game (everyone passes both stages)', () => {
  it('deals 2 more cards; trump is the dealer’s last card; first player leads', () => {
    const s = fresh();
    expect(s.phase).toBe('playing');
    expect(s.round.mode).toBe('normal');
    expect(s.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(s.round.trumpCard).toEqual(c('verde', 2));
    expect(s.round.trump).toBe('verde');
    expect(s.round.turn).toBe(1);
    expect(s.round.bids.map((b) => b.seat)).toEqual([1, 2, 3, 0, 1]);
    expect(s.round.redeals).toBe(0);
  });

  it('rejects playing out of turn and cards not in hand', () => {
    const s = fresh();
    expect(() => play(s, 2, c('duba', 2))).toThrow('Nu e rândul tău');
    expect(() => play(s, 1, c('duba', 2))).toThrow('Carte nepermisă');
  });

  it('declaring a trump marriage gives 40 and only the played card leaves the hand', () => {
    const s = play(fresh(), 1, c('verde', 3), true);
    expect(s.round.points.B).toBe(40);
    expect(s.round.declared).toEqual([{ seat: 1, suit: 'verde', points: 40 }]);
    expect(s.round.hands[1]).toContainEqual(c('verde', 4));
    expect(s.round.hands[1]).toHaveLength(4);
  });

  it('rejects invalid declarations', () => {
    expect(() => play(fresh(), 1, c('rosu', 2), true)).toThrow('Nu poți striga');
    const afterLead = play(fresh(), 1, c('verde', 3));
    expect(() => play(afterLead, 2, c('ghinda', 11), true)).toThrow('Nu poți striga');
  });

  it('enforces follow-suit and resolves the trick to the highest trump', () => {
    let s = play(fresh(), 1, c('verde', 3), true);
    s = play(s, 2, c('ghinda', 11));
    expect(() => play(s, 3, c('rosu', 3))).toThrow('Carte nepermisă');
    s = play(s, 3, c('verde', 11));
    s = play(s, 0, c('verde', 2));
    expect(s.round.tricksPlayed).toBe(1);
    expect(s.round.lastTrickWinner).toBe(3);
    expect(s.round.tricksTaken).toEqual({ A: 0, B: 1 });
    expect(s.round.points.B).toBe(40 + 3 + 11 + 11 + 2);
    expect(s.round.turn).toBe(3);
  });
});

describe('Stop', () => {
  it('any active seat may stop in a normal game, even before the first trick', () => {
    const s = fresh();
    for (const seat of [0, 1, 2, 3] as const) expect(canStop(s, seat)).toBe(true);
  });

  it('before the first trick, a seat not on turn stops without 66: the other team gets 3', () => {
    const s = fresh();
    expect(s.round.turn).toBe(1);
    const out = applyAction(s, { type: 'stop', seat: 2 });
    expect(out.phase).toBe('roundOver');
    expect(out.round.result).toMatchObject({ winner: 'B', points: 3, reason: 'stop', stopBy: 2, mode: 'normal' });
    expect(out.score).toEqual({ A: 0, B: 3 });
  });

  it('mid-trick, before the first trick is complete, after a 40 declaration', () => {
    const s = play(fresh(), 1, c('verde', 3), true);
    expect(s.round.tricksPlayed).toBe(0);
    expect(s.round.turn).toBe(2);
    const out = applyAction(s, { type: 'stop', seat: 3 });
    expect(out.round.result).toMatchObject({ winner: 'A', points: 3, reason: 'stop', stopBy: 3 });
  });

  it('with 66 or more the stopping team gets 3 points', () => {
    const s = applyAction(afterFirstTrick(true), { type: 'stop', seat: 3 });
    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'B', points: 3, reason: 'stop', stopBy: 3 });
    expect(s.score).toEqual({ A: 0, B: 3 });
  });

  it('with less than 66 the other team gets 3 points', () => {
    const s = applyAction(afterFirstTrick(false), { type: 'stop', seat: 3 });
    expect(s.round.result).toMatchObject({ winner: 'A', points: 3, reason: 'stop' });
    expect(s.score).toEqual({ A: 3, B: 0 });
  });

  it('a seat not on turn may stop: its team’s points count', () => {
    const s = afterFirstTrick(true);
    expect(s.round.turn).toBe(3);
    const out = applyAction(s, { type: 'stop', seat: 1 });
    expect(out.round.result).toMatchObject({ winner: 'B', points: 3, reason: 'stop', stopBy: 1 });
    const wrong = applyAction(s, { type: 'stop', seat: 0 });
    expect(wrong.round.result).toMatchObject({ winner: 'B', points: 3, reason: 'stop', stopBy: 0 });
  });

  it('can be called mid-trick on your turn', () => {
    let s = play(afterFirstTrick(true), 3, c('rosu', 3));
    s = play(s, 0, c('rosu', 4));
    expect(s.round.turn).toBe(1);
    expect(canStop(s, 1)).toBe(true);
    const out = applyAction(s, { type: 'stop', seat: 1 });
    expect(out.round.result).toMatchObject({ winner: 'B', points: 3, reason: 'stop', stopBy: 1 });
    expect(out.score).toEqual({ A: 0, B: 3 });
  });

  it('is not allowed during bidding (either stage) or after the round ended', () => {
    const start = stateWith(0, FIRST, SECOND);
    const stage2 = passFirstStage(start);
    const over = applyAction(fresh(), { type: 'stop', seat: 1 });
    for (const s of [start, stage2, over]) {
      for (const seat of [0, 1, 2, 3] as const) {
        expect(canStop(s, seat)).toBe(false);
        expect(() => applyAction(s, { type: 'stop', seat })).toThrow('Nu poți opri acum');
      }
    }
  });

  it('reaching 21 ends the match', () => {
    const s = { ...afterFirstTrick(true), score: { A: 0, B: 19 } };
    const out = applyAction(s, { type: 'stop', seat: 3 });
    expect(out.phase).toBe('matchOver');
    expect(out.score.B).toBe(22);
  });
});

describe('redeal when the dealer’s opponents hold no trump', () => {
  // Dealer 0: opponents are seats 1 and 3. The dealer's 5th card is duba 11, so duba is trump.
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

  it('redeals with the same dealer, score and round number, back to stage 1', () => {
    const start = { ...stateWith(0, NO_TRUMP_FIRST, NO_TRUMP_SECOND), score: { A: 5, B: 7 }, roundNumber: 4 };
    const stage2 = passFirstStage(start);
    expect(stage2.round.trumpCard).toEqual(c('duba', 11));
    const s = applyAction(stage2, { type: 'bid', seat: 1, bid: { kind: 'pass' } }, mulberry32(5));
    expect(s.phase).toBe('bidding');
    expect(s.score).toEqual({ A: 5, B: 7 });
    expect(s.roundNumber).toBe(4);
    expect(s.round).toMatchObject({
      dealer: 0, biddingStage: 'first', redeals: 1, bids: [], turn: 1, trump: null, trumpCard: null, mode: 'normal',
    });
    expect(s.round.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(s.round.stock).toHaveLength(8);
    expect(new Set([...s.round.hands.flat(), ...s.round.stock].map((x) => `${x.suit}-${x.rank}`)).size).toBe(20);
  });

  it('counts consecutive redeals and resets the counter on the next round', () => {
    const once = passAll(stateWith(0, NO_TRUMP_FIRST, NO_TRUMP_SECOND), mulberry32(5));
    const again = { ...once, round: { ...stateWith(0, NO_TRUMP_FIRST, NO_TRUMP_SECOND).round, redeals: 1 } };
    const twice = passAll(again, mulberry32(6));
    expect(twice.round.redeals).toBe(2);
    const over = applyAction(fresh(), { type: 'stop', seat: 1 });
    expect(fresh().round.redeals).toBe(0);
    expect(applyAction(over, { type: 'nextRound' }, mulberry32(1)).round.redeals).toBe(0);
  });

  it('the dealer’s partner holding trump does not prevent the redeal', () => {
    const s = passAll(
      stateWith(0, { ...NO_TRUMP_FIRST, 2: [c('ghinda', 2), c('ghinda', 3), c('ghinda', 4)] }, {
        ...NO_TRUMP_SECOND,
        0: [c('ghinda', 10), c('duba', 11)],
      }),
      mulberry32(5),
    );
    expect(s.round.redeals).toBe(1);
  });

  it('no redeal when one of the dealer’s opponents holds a trump', () => {
    const s = passAll(stateWith(0, NO_TRUMP_FIRST, { ...NO_TRUMP_SECOND, 3: [c('verde', 10), c('duba', 11)], 0: [c('duba', 10), c('verde', 11)] }));
    expect(s.round.trump).toBe('verde');
    expect(s.phase).toBe('playing');
    expect(s.round.redeals).toBe(0);
    const t = passAll(stateWith(0, NO_TRUMP_FIRST, { ...NO_TRUMP_SECOND, 1: [c('rosu', 10), c('duba', 10)], 0: [c('rosu', 11), c('duba', 11)] }));
    expect(t.round.trump).toBe('duba');
    expect(t.phase).toBe('playing');
  });

  it('no redeal in a contract round', () => {
    const stage2 = passFirstStage(stateWith(0, NO_TRUMP_FIRST, NO_TRUMP_SECOND));
    const s = bid(stage2, 1, { kind: 'mare' });
    expect(s.phase).toBe('playing');
    expect(s.round).toMatchObject({ mode: 'mare', redeals: 0 });
  });
});

describe('normal game scoring', () => {
  it('3 when opponents took no trick, 2 below 33, 1 from 33 up', () => {
    expect(scoreNormal(0, 0)).toBe(3);
    expect(scoreNormal(0, 20)).toBe(3);
    expect(scoreNormal(1, 32)).toBe(2);
    expect(scoreNormal(2, 33)).toBe(1);
  });

  it('the team taking the last trick wins the round', () => {
    const r = autoplay(fresh()).round;
    expect(r.tricksPlayed).toBe(5);
    expect(r.points.A + r.points.B).toBe(120);
    const winnerTeam = r.lastTrickWinner! % 2 === 0 ? 'A' : 'B';
    expect(r.result?.winner).toBe(winnerTeam);
    expect(r.result?.reason).toBe('normal');
  });
});

describe('next round', () => {
  it('rotates the dealer and deals a new round', () => {
    const over = applyAction(afterFirstTrick(true), { type: 'stop', seat: 3 });
    const next = applyAction(over, { type: 'nextRound' }, mulberry32(7));
    expect(next.phase).toBe('bidding');
    expect(next.roundNumber).toBe(2);
    expect(next.round.dealer).toBe(1);
    expect(next.round.turn).toBe(2);
    expect(next.round.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(next.score).toEqual(over.score);
  });

  it('wraps the dealer from seat 3 to seat 0', () => {
    const over = autoplay(passAll(stateWith(3, {})));
    expect(over.phase).toBe('roundOver');
    const next = applyAction(over, { type: 'nextRound' }, mulberry32(3));
    expect(next.round.dealer).toBe(0);
    expect(next.round.turn).toBe(1);
  });

  it('is rejected while a round is in progress', () => {
    expect(() => applyAction(fresh(), { type: 'nextRound' })).toThrow('Acțiunea nu e permisă acum');
  });
});

describe('engine-level bidding', () => {
  it('rejects bidding out of turn', () => {
    const s = stateWith(0, FIRST, SECOND);
    expect(() => applyAction(s, { type: 'bid', seat: 2, bid: { kind: 'pass' } })).toThrow('Nu e rândul tău');
  });

  it('rejects a bid after bidding has ended', () => {
    expect(() => applyAction(fresh(), { type: 'bid', seat: 1, bid: { kind: 'pass' } })).toThrow(
      'Acțiunea nu e permisă acum',
    );
  });
});

describe('declarations', () => {
  it('a marriage in a non-trump suit is worth 20', () => {
    const s = play(fresh(), 1, c('ghinda', 3), true);
    expect(s.round.points.B).toBe(20);
    expect(s.round.declared).toEqual([{ seat: 1, suit: 'ghinda', points: 20 }]);
  });

  it('a marriage cannot be declared a second time', () => {
    // Trump = duba (dealer's 5th card). Seat 1 holds all rosu but the 2, which seat 0 holds.
    let s = passAll(
      stateWith(
        0,
        { 1: [c('rosu', 3), c('rosu', 4), c('rosu', 11)], 0: [c('rosu', 2), c('duba', 3), c('duba', 4)] },
        { 1: [c('rosu', 10), c('duba', 10)], 0: [c('duba', 11), c('duba', 2)] },
      ),
    );
    expect(s.round.trump).toBe('duba');
    s = play(s, 1, c('rosu', 4), true);
    expect(s.round.points.B).toBe(20);
    s = play(s, 2, s.round.hands[2][0]);
    s = play(s, 3, s.round.hands[3][0]);
    s = play(s, 0, c('rosu', 2));
    expect(s.round.lastTrickWinner).toBe(1);
    expect(() => play(s, 1, c('rosu', 3), true)).toThrow('Nu poți striga');
    const after = play(s, 1, c('rosu', 3));
    expect(after.round.declared).toHaveLength(1);
  });
});

describe('normal game full round with a fixed deal', () => {
  it('awards 2 when the losers took a trick but less than 33', () => {
    let s = play(fresh(), 1, c('verde', 3), true);
    s = play(s, 2, c('ghinda', 11));
    s = play(s, 3, c('verde', 11));
    s = play(s, 0, c('verde', 2));
    expect(s.round.points).toEqual({ A: 0, B: 67 });

    s = play(s, 3, c('rosu', 3));
    s = play(s, 0, c('rosu', 11));
    s = play(s, 1, c('rosu', 2));
    s = play(s, 2, c('rosu', 10));
    expect(s.round.lastTrickWinner).toBe(0);
    expect(s.round.points).toEqual({ A: 26, B: 67 });

    s = play(s, 0, c('duba', 4));
    s = play(s, 1, c('verde', 4)); // must cut with trump
    s = play(s, 2, c('duba', 2));
    s = play(s, 3, c('duba', 3));
    expect(s.round.lastTrickWinner).toBe(1);

    s = play(s, 1, c('ghinda', 4), true); // plain 20
    s = play(s, 2, c('duba', 10));
    s = play(s, 3, c('ghinda', 10));
    s = play(s, 0, c('ghinda', 2));
    expect(s.round.lastTrickWinner).toBe(3);

    s = play(s, 3, c('verde', 10));
    s = play(s, 0, c('rosu', 4));
    s = play(s, 1, c('ghinda', 3));
    s = play(s, 2, c('duba', 11));

    expect(s.phase).toBe('roundOver');
    expect(s.round.points).toEqual({ A: 26, B: 154 });
    expect(s.round.tricksTaken).toEqual({ A: 1, B: 4 });
    expect(s.round.result).toMatchObject({ winner: 'B', points: 2, reason: 'normal', mode: 'normal' });
    expect(s.score).toEqual({ A: 0, B: 2 });
  });
});

describe('applyAction hardening', () => {
  it('does not mutate its input state', () => {
    const bidding = deepFreeze(stateWith(0, FIRST, SECOND));
    const snapshot = JSON.stringify(bidding);
    expect(() => passAll(bidding)).not.toThrow();
    const playing = deepFreeze(afterFirstTrick(true));
    const playingSnapshot = JSON.stringify(playing);
    expect(() => play(playing, 3, c('rosu', 3))).not.toThrow();
    const over = deepFreeze(applyAction(playing, { type: 'stop', seat: 3 }));
    expect(() => applyAction(over, { type: 'nextRound' }, mulberry32(1))).not.toThrow();
    expect(JSON.stringify(bidding)).toBe(snapshot);
    expect(JSON.stringify(playing)).toBe(playingSnapshot);
  });

  it('a JSON round-trip mid-round does not change the outcome', () => {
    const mid = play(afterFirstTrick(true), 3, c('rosu', 3));
    const copy = JSON.parse(JSON.stringify(mid)) as GameState;
    expect(autoplay(copy)).toEqual(autoplay(mid));
  });

  it('stores the canonical card and bid, not extra fields from the action', () => {
    const card = { ...c('verde', 3), hack: 'x' } as Card;
    const played = play(fresh(), 1, card, true);
    expect(JSON.stringify(played)).not.toContain('hack');

    const passBid = { kind: 'pass', hack: 'x' } as Bid;
    const tromfBid = { kind: 'tromf', suit: 'rosu', hack: 'x' } as Bid;
    expect(JSON.stringify(bid(stateWith(0, FIRST, SECOND), 1, passBid))).not.toContain('hack');
    expect(JSON.stringify(bid(passFirstStage(stateWith(0, FIRST, SECOND)), 1, tromfBid))).not.toContain('hack');
  });

  it('rejects an unknown action type', () => {
    const unknown = { type: 'cheat', seat: 1 } as unknown as Action;
    expect(() => applyAction(fresh(), unknown)).toThrow('Acțiune necunoscută');
  });
});
