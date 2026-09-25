import { describe, expect, it } from 'vitest';
import { applyAction, type Action, type GameState } from '@/lib/game';
import { c, passAll, stateWith } from '@/lib/game/__tests__/helpers';
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
  const next = applyAction(state, action);
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
