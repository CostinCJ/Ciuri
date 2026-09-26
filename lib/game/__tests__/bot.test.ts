import { describe, expect, it } from 'vitest';
import { applyAction, botAction, createMatch, pendingSeat, type GameState } from '../index';
import { c, mulberry32, passAll, play, stateWith } from './helpers';

/** Plays a whole match with four bots; every bot move must be legal. */
function botMatch(seed: number): GameState {
  const rng = mulberry32(seed);
  let s = createMatch(rng);
  for (let step = 0; step < 5000 && s.phase !== 'matchOver'; step++) {
    if (s.phase === 'roundOver') {
      s = applyAction(s, { type: 'nextRound' }, rng);
      continue;
    }
    const seat = pendingSeat(s);
    if (seat === null) throw new Error('nobody on turn');
    const action = botAction(s, seat);
    if (!action) throw new Error(`bot at seat ${seat} found no move`);
    s = applyAction(s, action, rng);
  }
  return s;
}

describe('botAction', () => {
  it('plays whole matches to the end with legal moves only', () => {
    for (let seed = 1; seed <= 40; seed++) expect(botMatch(seed).phase).toBe('matchOver');
  });

  it('does nothing when it is not the seat on turn', () => {
    const s = stateWith(0, {});
    expect(botAction(s, 2)).toBeNull();
  });

  it('declares a marriage when leading', () => {
    const s = passAll(stateWith(0, { 1: [c('verde', 3), c('verde', 4), c('rosu', 2)] }));
    expect(botAction(s, 1)).toEqual({ type: 'play', seat: 1, card: c('verde', 3), declare: true });
  });

  it('calls Stop once its team has 66', () => {
    let s = passAll(stateWith(0, {}));
    s = { ...s, round: { ...s.round, points: { A: 10, B: 66 } } };
    expect(botAction(s, 1)).toEqual({ type: 'stop', seat: 1 });
  });

  it('takes a trick it can win as the last player', () => {
    let s = passAll(stateWith(0, {
      1: [c('rosu', 2), c('verde', 2), c('verde', 3)],
      2: [c('rosu', 3), c('verde', 4), c('ghinda', 2)],
      3: [c('rosu', 4), c('ghinda', 3), c('ghinda', 4)],
      0: [c('rosu', 10), c('rosu', 11), c('duba', 2)],
    }));
    s = play(s, 1, c('rosu', 2));
    s = play(s, 2, c('rosu', 3));
    s = play(s, 3, c('rosu', 4));
    expect(botAction(s, 0)).toMatchObject({ type: 'play', card: c('rosu', 10) });
  });
});
