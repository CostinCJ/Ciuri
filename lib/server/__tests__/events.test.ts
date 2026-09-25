import { describe, expect, it } from 'vitest';
import { applyAction, type Action, type GameState } from '@/lib/game';
import { c, mulberry32, passAll, passFirstStage, stateWith } from '@/lib/game/__tests__/helpers';
import { LOG_LIMIT, appendLog, describeTransition, type GameEvent } from '../events';

// Dealer 0, trump verde (dealer's last card). Seat 1 holds the verde and ghinda marriages.
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

function step(state: GameState, action: Action, automatic = false) {
  const next = applyAction(state, action, mulberry32(9));
  return { next, events: describeTransition(state, next, action, automatic) };
}

describe('describeTransition', () => {
  it('logs a bid, prefixed by a timeout marker when automatic', () => {
    const { events } = step(stateWith(0, FIRST, SECOND), { type: 'bid', seat: 1, bid: { kind: 'pass' } }, true);
    expect(events).toEqual([
      { type: 'timeout', seat: 1 },
      { type: 'bid', seat: 1, bid: { kind: 'pass' } },
    ]);
  });

  it('logs the stage 2 pass that causes a redeal, then the redeal', () => {
    // Dealer 0, trump duba (dealer's 5th card); the dealer's opponents (seats 1 and 3) hold no duba.
    const s = passFirstStage(stateWith(
      0,
      {
        1: [c('rosu', 2), c('rosu', 3), c('rosu', 4)],
        3: [c('verde', 2), c('verde', 3), c('verde', 4)],
        0: [c('duba', 2), c('duba', 3), c('duba', 4)],
      },
      { 1: [c('rosu', 10), c('rosu', 11)], 3: [c('verde', 10), c('verde', 11)], 0: [c('duba', 10), c('duba', 11)] },
    ));
    const { next, events } = step(s, { type: 'bid', seat: 1, bid: { kind: 'pass' } }, true);
    expect(next.round.redeals).toBe(1);
    expect(events).toEqual([
      { type: 'timeout', seat: 1 },
      { type: 'bid', seat: 1, bid: { kind: 'pass' } },
      { type: 'redeal', dealer: 0, redeals: 1 },
    ]);
  });

  it('logs a stage 2 contract bid without a redeal', () => {
    const s = passFirstStage(stateWith(0, FIRST, SECOND));
    const { events } = step(s, { type: 'bid', seat: 1, bid: { kind: 'tromf', suit: 'duba' } });
    expect(events).toEqual([{ type: 'bid', seat: 1, bid: { kind: 'tromf', suit: 'duba' } }]);
  });

  it('logs a Stop called by a seat not on turn before the first trick', () => {
    const s = passAll(stateWith(0, FIRST, SECOND));
    const { next, events } = step(s, { type: 'stop', seat: 0 });
    expect(next.round.result).toMatchObject({ reason: 'stop', stopBy: 0 });
    expect(events).toEqual([{ type: 'roundEnd', result: next.round.result }]);
  });

  it('logs declarations, completed tricks and the round end', () => {
    let s = passAll(stateWith(0, FIRST, SECOND));
    let r = step(s, { type: 'play', seat: 1, card: c('verde', 3), declare: true });
    expect(r.events).toEqual([{ type: 'declare', seat: 1, suit: 'verde', points: 40 }]);
    s = r.next;
    s = applyAction(s, { type: 'play', seat: 2, card: c('ghinda', 11) });
    s = applyAction(s, { type: 'play', seat: 3, card: c('verde', 11) });
    r = step(s, { type: 'play', seat: 0, card: c('verde', 2) });
    expect(r.events).toEqual([{ type: 'trick', winner: 3, points: 27 }]);
    r = step(r.next, { type: 'stop', seat: 3 });
    expect(r.events).toEqual([{ type: 'roundEnd', result: r.next.round.result }]);
  });

  it('logs a new round without a timeout marker', () => {
    let s = passAll(stateWith(0, FIRST, SECOND));
    s = applyAction(s, { type: 'play', seat: 1, card: c('verde', 3), declare: true });
    s = applyAction(s, { type: 'play', seat: 2, card: c('ghinda', 11) });
    s = applyAction(s, { type: 'play', seat: 3, card: c('verde', 11) });
    s = applyAction(s, { type: 'play', seat: 0, card: c('verde', 2) });
    s = applyAction(s, { type: 'stop', seat: 3 });
    const { next, events } = step(s, { type: 'nextRound' }, true);
    expect(events).toEqual([{ type: 'newRound', dealer: next.round.dealer, roundNumber: 2 }]);
  });
});

describe('appendLog', () => {
  it(`keeps only the last ${LOG_LIMIT} events`, () => {
    const many: GameEvent[] = Array.from({ length: LOG_LIMIT + 5 }, (_, i) => ({ type: 'newRound', dealer: 0, roundNumber: i }));
    const log = appendLog([], many);
    expect(log).toHaveLength(LOG_LIMIT);
    expect(log[0]).toEqual({ type: 'newRound', dealer: 0, roundNumber: 5 });
  });
});
