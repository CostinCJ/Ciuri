import { z } from 'zod';
import { RANKS, SUITS, type Rank, type Seat } from '@/lib/game';

const suit = z.enum(SUITS);
const rank = z.custom<Rank>((v) => typeof v === 'number' && (RANKS as readonly number[]).includes(v), 'Carte invalidă');
const seat = z.custom<Seat>((v) => v === 0 || v === 1 || v === 2 || v === 3, 'Loc invalid');

const card = z.object({ suit, rank });

const bid = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pass') }),
  z.object({ kind: z.literal('ciuri') }),
  z.object({ kind: z.literal('adunare') }),
  z.object({ kind: z.literal('mare') }),
  z.object({ kind: z.literal('mica') }),
  z.object({ kind: z.literal('tromf'), suit }),
]);

/** Actions a player may send. The seat is never taken from the client. */
export const playerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bid'), bid }),
  z.object({ type: z.literal('play'), card, declare: z.boolean().optional() }),
  z.object({ type: z.literal('stop') }),
]);
export type PlayerActionInput = z.infer<typeof playerActionSchema>;

/** Trimmed text whose length in characters (code points, like Postgres char_length) is in [min, max]. */
function text(min: number, max: number, message: string) {
  return z.string().trim().refine((value) => {
    const length = [...value].length;
    return length >= min && length <= max;
  }, message);
}

export const nameBodySchema = z.object({ name: text(2, 20, 'Numele trebuie să aibă 2–20 caractere') });
export const seatBodySchema = z.object({ seat: seat.nullable() });
export const botBodySchema = z.object({ seat, add: z.boolean() });
export const actionBodySchema = z.object({ action: playerActionSchema });
export const messageBodySchema = z.object({ text: text(1, 300, 'Mesajul trebuie să aibă 1–300 caractere') });
