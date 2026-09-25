import { RANKS, SUITS, type Card, type Seat, type Suit, type Team } from './types';

export function fullDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

export function shuffle(cards: Card[], rng: () => number = Math.random): Card[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function removeCard(hand: Card[], card: Card): Card[] {
  const index = hand.findIndex((x) => sameCard(x, card));
  return index === -1 ? hand : [...hand.slice(0, index), ...hand.slice(index + 1)];
}

/** Rank equals the card's point value. */
export function sumPoints(cards: Card[]): number {
  return cards.reduce((total, card) => total + card.rank, 0);
}

export function teamOf(seat: Seat): Team {
  return seat % 2 === 0 ? 'A' : 'B';
}

export function otherTeam(team: Team): Team {
  return team === 'A' ? 'B' : 'A';
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

/** All four seats clockwise, starting with `start`. */
export function seatsFrom(start: Seat): Seat[] {
  return [0, 1, 2, 3].map((k) => ((start + k) % 4) as Seat);
}

export function marriageSuit(hand: Card[]): Suit | null {
  const has = (suit: Suit, rank: 3 | 4) => hand.some((x) => x.suit === suit && x.rank === rank);
  return SUITS.find((suit) => has(suit, 3) && has(suit, 4)) ?? null;
}
