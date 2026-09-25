import { marriageSuit, nextSeat } from './cards';
import { SUITS, type Bid, type ContractBid, type Round, type Seat } from './types';

export const MAX_BID_VALUE = 12;

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

function highestValue(round: Round): number {
  return round.bids.reduce((max, b) => Math.max(max, bidValue(b.bid)), 0);
}

export function legalBids(round: Round, seat: Seat): Bid[] {
  const candidates: ContractBid[] = [{ kind: 'ciuri' }, { kind: 'adunare' }];
  if (seat === nextSeat(round.dealer)) {
    candidates.push({ kind: 'mare' }, { kind: 'mica' }, ...SUITS.map((suit) => ({ kind: 'tromf' as const, suit })));
  }
  const highest = highestValue(round);
  const allowed = candidates.filter(
    (bid) => bidValue(bid) > highest && (bid.kind !== 'ciuri' || marriageSuit(round.hands[seat]) !== null),
  );
  return [{ kind: 'pass' }, ...allowed];
}

export function sameBid(a: Bid, b: Bid): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'tromf' || (b.kind === 'tromf' && a.suit === b.suit);
}

export function biddingDone(round: Round): boolean {
  return round.bids.length === 4 || highestValue(round) === MAX_BID_VALUE;
}

export function winningBid(bids: Round['bids']): { seat: Seat; bid: ContractBid } | null {
  let best: { seat: Seat; bid: ContractBid } | null = null;
  for (const entry of bids) {
    const bid = entry.bid;
    if (bid.kind === 'pass') continue;
    if (best === null || bidValue(bid) > bidValue(best.bid)) best = { seat: entry.seat, bid };
  }
  return best;
}
