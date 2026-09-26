import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@/lib/server/events';
import { appendLog, LOG_LIMIT } from '@/lib/server/events';
import { logKeys } from '../log';

const pass = (seat: 0 | 1 | 2 | 3): GameEvent => ({ type: 'bid', seat, bid: { kind: 'pass' } });
const trick: GameEvent = { type: 'trick', winner: 0 };

function roundEvents(roundNumber: number): GameEvent[] {
  return [{ type: 'newRound', dealer: 0, roundNumber }, pass(1), pass(2), pass(3), pass(0), ...Array.from({ length: 5 }, () => ({ ...trick }))];
}

describe('logKeys', () => {
  it('gives unique keys, also for identical events', () => {
    const log: GameEvent[] = [{ type: 'matchStart', dealer: 3 }, pass(0), pass(0), trick, trick];
    const keys = logKeys(log);
    expect(new Set(keys).size).toBe(log.length);
  });

  // The UI shows only the newest events, which always follow a round marker still in the log.
  it('keeps the key of every event after the first round marker stable as the log grows and is capped', () => {
    let log: GameEvent[] = [{ type: 'matchStart', dealer: 3 }];
    const keyOf = new Map<GameEvent, string>();
    for (let round = 2; round < 12; round++) {
      for (const event of roundEvents(round)) {
        log = appendLog(log, [event]);
        const keys = logKeys(log);
        expect(new Set(keys).size).toBe(log.length);
        const firstMarker = log.findIndex((e) => e.type === 'matchStart' || e.type === 'newRound');
        log.forEach((e, i) => {
          if (i < firstMarker) return;
          const before = keyOf.get(e);
          if (before !== undefined) expect(keys[i]).toBe(before);
          keyOf.set(e, keys[i]);
        });
      }
    }
    expect(log.length).toBe(LOG_LIMIT);
  });
});
