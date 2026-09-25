import { describe, expect, it } from 'vitest';
import { bidValue, biddingDone, legalBids, sameBid, winningBid } from '../bidding';
import type { Bid } from '../types';
import { c, stateWith } from './helpers';

const kinds = (bids: Bid[]) => bids.map((b) => (b.kind === 'tromf' ? `tromf:${b.suit}` : b.kind));

describe('bidding', () => {
  it('values contracts', () => {
    expect(bidValue({ kind: 'pass' })).toBe(0);
    expect(bidValue({ kind: 'mica' })).toBe(4);
    expect(bidValue({ kind: 'mare' })).toBe(6);
    expect(bidValue({ kind: 'tromf', suit: 'rosu' })).toBe(6);
    expect(bidValue({ kind: 'ciuri' })).toBe(12);
    expect(bidValue({ kind: 'adunare' })).toBe(12);
  });

  it('first player may bid everything; ciuri only with a marriage', () => {
    const s = stateWith(0, { 1: [c('verde', 3), c('verde', 4), c('rosu', 2)] });
    expect(kinds(legalBids(s.round, 1))).toEqual([
      'pass', 'ciuri', 'adunare', 'mare', 'mica',
      'tromf:rosu', 'tromf:verde', 'tromf:ghinda', 'tromf:duba',
    ]);
  });

  it('other players may only bid ciuri/adunare, and ciuri needs a marriage', () => {
    const s = stateWith(0, { 2: [c('verde', 3), c('rosu', 4), c('rosu', 2)] });
    s.round.bids.push({ seat: 1, bid: { kind: 'pass' } });
    expect(kinds(legalBids(s.round, 2))).toEqual(['pass', 'adunare']);
  });

  it('a bid must be strictly higher than the current highest', () => {
    const s = stateWith(0, {});
    s.round.bids.push({ seat: 1, bid: { kind: 'mare' } });
    expect(kinds(legalBids(s.round, 2))).toEqual(['pass', 'adunare']);
    s.round.bids.push({ seat: 2, bid: { kind: 'adunare' } });
    expect(kinds(legalBids(s.round, 3))).toEqual(['pass']);
  });

  it('ends after four bids or immediately after a 12-point bid', () => {
    const s = stateWith(0, {});
    s.round.bids.push({ seat: 1, bid: { kind: 'mica' } });
    expect(biddingDone(s.round)).toBe(false);
    s.round.bids.push({ seat: 2, bid: { kind: 'adunare' } });
    expect(biddingDone(s.round)).toBe(true);
  });

  it('ends after four passes, not before', () => {
    const s = stateWith(0, {});
    s.round.bids.push({ seat: 1, bid: { kind: 'pass' } });
    s.round.bids.push({ seat: 2, bid: { kind: 'pass' } });
    s.round.bids.push({ seat: 3, bid: { kind: 'pass' } });
    expect(biddingDone(s.round)).toBe(false);
    s.round.bids.push({ seat: 0, bid: { kind: 'pass' } });
    expect(biddingDone(s.round)).toBe(true);
  });

  it('picks the highest bid, earliest on ties', () => {
    expect(winningBid([
      { seat: 1, bid: { kind: 'mica' } },
      { seat: 2, bid: { kind: 'adunare' } },
      { seat: 3, bid: { kind: 'pass' } },
    ])).toEqual({ seat: 2, bid: { kind: 'adunare' } });
    expect(winningBid([{ seat: 1, bid: { kind: 'pass' } }])).toBeNull();
  });

  it('compares bids including the tromf suit', () => {
    expect(sameBid({ kind: 'tromf', suit: 'rosu' }, { kind: 'tromf', suit: 'rosu' })).toBe(true);
    expect(sameBid({ kind: 'tromf', suit: 'rosu' }, { kind: 'tromf', suit: 'duba' })).toBe(false);
    expect(sameBid({ kind: 'mare' }, { kind: 'mica' })).toBe(false);
  });
});
