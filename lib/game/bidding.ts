import { marriageSuit, nextSeat } from './cards';
import { SUITS, type BiddingStage, type Bid, type ContractBid, type Round, type Seat } from './types';

/** Games saved before two-stage bidding have no `biddingStage`; they are in stage 1. */
export function biddingStageOf(round: Partial<Pick<Round, 'biddingStage'>>): BiddingStage {
  return round.biddingStage ?? 'first';
}

/** Games saved before redeals existed have no `redeals` counter; it counts as 0. */
export function redealsOf(round: Partial<Pick<Round, 'redeals'>>): number {
  return round.redeals ?? 0;
}

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
 * Bids open to `seat` while bidding is still open.
 * Stage 1: anyone may pass or bid Adunare; Ciuri needs a 3+4 marriage in the first 3 cards.
 * Stage 2: only the first player (seat after the dealer) speaks: Pas, Mare, Mica or Tromful tău.
 */
export function legalBids(round: Round, seat: Seat): Bid[] {
  if (biddingStageOf(round) === 'second') {
    if (seat !== nextSeat(round.dealer)) return [];
    return [
      { kind: 'pass' },
      { kind: 'mare' },
      { kind: 'mica' },
      ...SUITS.map((suit) => ({ kind: 'tromf' as const, suit })),
    ];
  }
  const bids: Bid[] = [{ kind: 'pass' }];
  if (marriageSuit(round.hands[seat]) !== null) bids.push({ kind: 'ciuri' });
  bids.push({ kind: 'adunare' });
  return bids;
}

export function sameBid(a: Bid, b: Bid): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'tromf' || (b.kind === 'tromf' && a.suit === b.suit);
}

/** Stage 1 is over (without a contract) once all four seats passed. */
export function firstStageDone(round: Round): boolean {
  return biddingStageOf(round) === 'first' && round.bids.length === 4 && round.bids.every((b) => b.bid.kind === 'pass');
}

/** The single contract bid of the round, or null when everyone passed. */
export function winningBid(bids: Round['bids']): { seat: Seat; bid: ContractBid } | null {
  for (const { seat, bid } of bids) {
    if (bid.kind !== 'pass') return { seat, bid };
  }
  return null;
}
