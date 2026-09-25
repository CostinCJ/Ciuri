import { fullDeck, sameCard, seatsFrom, nextSeat } from '../cards';
import { dealRound } from '../engine';
import type { Card, GameState, Rank, Seat, Suit } from '../types';

export const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });

type Hands = Partial<Record<Seat, Card[]>>;

/**
 * Builds a 20-card deck so that `first[seat]` are the seat's first 3 cards and
 * `second[seat]` its 2 extra cards. Unspecified slots are filled from the remaining deck.
 */
export function buildDeck(dealer: Seat, first: Hands, second: Hands = {}): Card[] {
  const order = seatsFrom(nextSeat(dealer));
  for (const seat of order) {
    if ((first[seat]?.length ?? 0) > 3) throw new Error(`buildDeck: seat ${seat} has more than 3 first cards`);
    if ((second[seat]?.length ?? 0) > 2) throw new Error(`buildDeck: seat ${seat} has more than 2 second cards`);
  }
  const used = order.flatMap((seat) => [...(first[seat] ?? []), ...(second[seat] ?? [])]);
  used.forEach((card, i) => {
    if (used.findIndex((u) => sameCard(u, card)) !== i) {
      throw new Error(`buildDeck: card ${card.suit}-${card.rank} specified twice`);
    }
  });
  const rest = fullDeck().filter((x) => !used.some((u) => sameCard(u, x)));
  const deck: Card[] = [];
  for (const seat of order) {
    const h = first[seat] ?? [];
    deck.push(...h, ...rest.splice(0, 3 - h.length));
  }
  for (const seat of order) {
    const h = second[seat] ?? [];
    deck.push(...h, ...rest.splice(0, 2 - h.length));
  }
  if (deck.length !== 20) throw new Error(`buildDeck: expected 20 cards, got ${deck.length}`);
  return deck;
}

export function stateWith(dealer: Seat, first: Hands, second: Hands = {}): GameState {
  return {
    phase: 'bidding',
    score: { A: 0, B: 0 },
    roundNumber: 1,
    round: dealRound(dealer, buildDeck(dealer, first, second)),
  };
}

/** Deterministic PRNG for reproducible tests. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
