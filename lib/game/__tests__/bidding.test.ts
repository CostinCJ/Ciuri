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

  it('after the first player passes, the next seat may still pass, bid ciuri (with a marriage) or adunare', () => {
    const s = stateWith(0, { 2: [c('rosu', 3), c('rosu', 4), c('verde', 2)] });
    s.round.bids.push({ seat: 1, bid: { kind: 'pass' } });
    expect(biddingDone(s.round)).toBe(false);
    expect(kinds(legalBids(s.round, 2))).toEqual(['pass', 'ciuri', 'adunare']);
  });

  it('ends immediately after a Mica bid', () => {
    const s = stateWith(0, {});
    s.round.bids.push({ seat: 1, bid: { kind: 'mica' } });
    expect(biddingDone(s.round)).toBe(true);
  });

  it('ends immediately after a later player bids adunare', () => {
    const s = stateWith(0, {});
    s.round.bids.push({ seat: 1, bid: { kind: 'pass' } });
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

  it('the winning bid is the single contract bid', () => {
    expect(winningBid([
      { seat: 1, bid: { kind: 'pass' } },
      { seat: 2, bid: { kind: 'adunare' } },
    ])).toEqual({ seat: 2, bid: { kind: 'adunare' } });
    expect(winningBid([{ seat: 1, bid: { kind: 'mica' } }])).toEqual({ seat: 1, bid: { kind: 'mica' } });
    expect(winningBid([{ seat: 1, bid: { kind: 'pass' } }])).toBeNull();
  });

  it('compares bids including the tromf suit', () => {
    expect(sameBid({ kind: 'tromf', suit: 'rosu' }, { kind: 'tromf', suit: 'rosu' })).toBe(true);
    expect(sameBid({ kind: 'tromf', suit: 'rosu' }, { kind: 'tromf', suit: 'duba' })).toBe(false);
    expect(sameBid({ kind: 'mare' }, { kind: 'mica' })).toBe(false);
  });
});
