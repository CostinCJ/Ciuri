import { describe, expect, it } from 'vitest';
import { createMatch } from '@/lib/game';
import { mulberry32 } from '@/lib/game/__tests__/helpers';
import { CODE_ALPHABET, generateRoomCode, normalizeRoomCode } from '../codes';
import { BID_SECONDS, PLAY_SECONDS, SUMMARY_SECONDS, deadlineFor } from '../deadlines';
import { actionBodySchema, messageBodySchema, nameBodySchema, seatBodySchema } from '../schemas';

describe('room codes', () => {
  it('generates 4 characters from an alphabet without look-alikes', () => {
    const code = generateRoomCode(mulberry32(3));
    expect(code).toHaveLength(4);
    expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    expect(CODE_ALPHABET).not.toMatch(/[01IOL]/);
  });

  it('normalises user input', () => {
    expect(normalizeRoomCode(' k7xq ')).toBe('K7XQ');
    expect(normalizeRoomCode('K7X')).toBeNull();
    expect(normalizeRoomCode('K7X0')).toBeNull();
  });
});

describe('deadlines', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);

  it('uses 20s for bidding, 30s for play, 5s for the round summary, none after the match', () => {
    const s = createMatch(mulberry32(1), 0);
    expect(deadlineFor(s, now)).toEqual(at(BID_SECONDS));
    expect(deadlineFor({ ...s, phase: 'playing' }, now)).toEqual(at(PLAY_SECONDS));
    expect(deadlineFor({ ...s, phase: 'roundOver' }, now)).toEqual(at(SUMMARY_SECONDS));
    expect(deadlineFor({ ...s, phase: 'matchOver' }, now)).toBeNull();
  });
});

describe('request schemas', () => {
  it('accepts player actions and strips unknown fields', () => {
    const parsed = actionBodySchema.parse({
      action: { type: 'play', card: { suit: 'verde', rank: 11, hack: 1 }, declare: true, seat: 3 },
    });
    expect(parsed).toEqual({ action: { type: 'play', card: { suit: 'verde', rank: 11 }, declare: true } });
    expect(actionBodySchema.parse({ action: { type: 'bid', bid: { kind: 'tromf', suit: 'duba' } } }))
      .toEqual({ action: { type: 'bid', bid: { kind: 'tromf', suit: 'duba' } } });
    expect(actionBodySchema.parse({ action: { type: 'stop' } })).toEqual({ action: { type: 'stop' } });
  });

  it('rejects system actions and invalid cards', () => {
    expect(actionBodySchema.safeParse({ action: { type: 'nextRound' } }).success).toBe(false);
    expect(actionBodySchema.safeParse({ action: { type: 'play', card: { suit: 'verde', rank: 7 } } }).success).toBe(false);
    expect(actionBodySchema.safeParse({ action: { type: 'play', card: { suit: 'inima', rank: 2 } } }).success).toBe(false);
    expect(actionBodySchema.safeParse({ action: { type: 'bid', bid: { kind: 'tromf' } } }).success).toBe(false);
  });

  it('validates names, seats and chat messages', () => {
    expect(nameBodySchema.parse({ name: '  Ana ' })).toEqual({ name: 'Ana' });
    expect(nameBodySchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(nameBodySchema.safeParse({ name: 'x'.repeat(21) }).success).toBe(false);
    expect(seatBodySchema.parse({ seat: 2 })).toEqual({ seat: 2 });
    expect(seatBodySchema.parse({ seat: null })).toEqual({ seat: null });
    expect(seatBodySchema.safeParse({ seat: 4 }).success).toBe(false);
    expect(messageBodySchema.parse({ text: ' salut ' })).toEqual({ text: 'salut' });
    expect(messageBodySchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(messageBodySchema.safeParse({ text: 'x'.repeat(301) }).success).toBe(false);
  });
});
