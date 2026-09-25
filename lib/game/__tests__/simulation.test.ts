import { describe, expect, it } from 'vitest';
import {
  applyAction, createMatch, legalMoves, pendingSeat, publicView, sameCard, type GameState,
} from '../index';
import { mulberry32 } from './helpers';

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function checkFinishedRound(s: GameState): void {
  const r = s.round;
  expect(r.result).not.toBeNull();
  if (r.result?.reason === 'normal') {
    const declared = r.declared.reduce((sum, d) => sum + d.points, 0);
    expect(r.tricksPlayed).toBe(5);
    expect(r.points.A + r.points.B).toBe(120 + declared);
  }
}

describe('random full matches', () => {
  it('200 seeded matches finish at 21+ without illegal states', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      let s = createMatch(rng);
      let steps = 0;
      while (s.phase !== 'matchOver') {
        steps += 1;
        expect(steps).toBeLessThan(5000);
        expect('hands' in publicView(s).round).toBe(false);

        if (s.phase === 'roundOver') {
          checkFinishedRound(s);
          s = applyAction(s, { type: 'nextRound' }, rng);
          continue;
        }
        const seat = pendingSeat(s)!;
        const moves = legalMoves(s, seat);
        if (s.phase === 'bidding') {
          s = applyAction(s, { type: 'bid', seat, bid: pick(moves.bids, rng) });
        } else if (moves.canStop && rng() < 0.05) {
          s = applyAction(s, { type: 'stop', seat });
        } else {
          expect(moves.cards.length).toBeGreaterThan(0);
          const card = pick(moves.cards, rng);
          const declare = moves.declarable.some((d) => sameCard(d, card)) && rng() < 0.7;
          s = applyAction(s, { type: 'play', seat, card, declare });
        }
      }
      checkFinishedRound(s);
      expect(Math.max(s.score.A, s.score.B)).toBeGreaterThanOrEqual(21);
    }
  });
});
