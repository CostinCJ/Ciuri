import { nextSeat, seatsFrom } from './cards';
import type { Card, Round, Seat } from './types';

/** Deals 3 cards to each seat starting with the first player; the other 8 cards stay in the stock. */
export function dealRound(dealer: Seat, deck: Card[]): Round {
  const first = nextSeat(dealer);
  const hands: Card[][] = [[], [], [], []];
  seatsFrom(first).forEach((seat, k) => {
    hands[seat] = deck.slice(3 * k, 3 * k + 3);
  });
  return {
    dealer,
    hands,
    stock: deck.slice(12),
    bids: [],
    mode: 'normal',
    bidder: null,
    trump: null,
    trumpCard: null,
    active: [0, 1, 2, 3],
    turn: first,
    leader: first,
    trick: [],
    lastTrick: null,
    lastTrickWinner: null,
    tricksTaken: { A: 0, B: 0 },
    points: { A: 0, B: 0 },
    declared: [],
    tricksPlayed: 0,
    result: null,
  };
}
