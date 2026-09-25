import { marriageSuit, nextSeat } from './cards';
import { SUITS, type Bid, type ContractBid, type Round, type Seat } from './types';

export function bidValue(bid: Bid): number {
  switch (bid.kind) {
    case 'pass':
      return 0;
    case 'mica':
      return 4;
    case 'mare':
    case 'tromf':
      return 6;
    case 'ciuri':
    case 'adunare':
      return 12;
  }
}

/**
 * Bids open to `seat` while bidding is still open. Only the first player (seat after the dealer)
 * may bid Mare, Mica or Tromful tău; anyone may bid Adunare, and Ciuri needs a 3+4 marriage.
 */
export function legalBids(round: Round, seat: Seat): Bid[] {
  const candidates: ContractBid[] = [{ kind: 'ciuri' }, { kind: 'adunare' }];
  if (seat === nextSeat(round.dealer)) {
    candidates.push({ kind: 'mare' }, { kind: 'mica' }, ...SUITS.map((suit) => ({ kind: 'tromf' as const, suit })));
  }
  const allowed = candidates.filter((bid) => bid.kind !== 'ciuri' || marriageSuit(round.hands[seat]) !== null);
  return [{ kind: 'pass' }, ...allowed];
}

export function sameBid(a: Bid, b: Bid): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'tromf' || (b.kind === 'tromf' && a.suit === b.suit);
}

/** Bidding ends at the first contract bid, or after four passes. */
export function biddingDone(round: Round): boolean {
  return round.bids.length === 4 || round.bids.some((b) => b.bid.kind !== 'pass');
}

/** The single contract bid of the round, or null when everyone passed. */
export function winningBid(bids: Round['bids']): { seat: Seat; bid: ContractBid } | null {
  for (const { seat, bid } of bids) {
    if (bid.kind !== 'pass') return { seat, bid };
  }
  return null;
}
