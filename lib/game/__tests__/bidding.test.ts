import { describe, expect, it } from 'vitest';
import { bidValue, firstStageDone, legalBids, sameBid, winningBid } from '../bidding';
import type { Bid } from '../types';
import { c, passFirstStage, stateWith } from './helpers';

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

  it('a new round starts in stage 1', () => {
    expect(stateWith(0, {}).round.biddingStage).toBe('first');
  });

  it('stage 1: the first player may only pass, bid ciuri (with a marriage) or adunare', () => {
    const s = stateWith(0, { 1: [c('verde', 3), c('verde', 4), c('rosu', 2)] });
    expect(kinds(legalBids(s.round, 1))).toEqual(['pass', 'ciuri', 'adunare']);
  });

  it('stage 1: without a marriage there is no ciuri', () => {
    const s = stateWith(0, { 1: [c('verde', 3), c('rosu', 4), c('rosu', 2)] });
    expect(kinds(legalBids(s.round, 1))).toEqual(['pass', 'adunare']);
  });

  it('stage 1: the other players have the same options', () => {
    const s = stateWith(0, {
      2: [c('verde', 3), c('rosu', 4), c('rosu', 2)],
      3: [c('ghinda', 3), c('ghinda', 4), c('verde', 2)],
    });
    s.round.bids.push({ seat: 1, bid: { kind: 'pass' } });
    expect(kinds(legalBids(s.round, 2))).toEqual(['pass', 'adunare']);
    expect(kinds(legalBids(s.round, 3))).toEqual(['pass', 'ciuri', 'adunare']);
  });

  it('stage 1 is done after four passes, not before', () => {
    const s = stateWith(0, {});
    s.round.bids.push({ seat: 1, bid: { kind: 'pass' } });
    s.round.bids.push({ seat: 2, bid: { kind: 'pass' } });
    s.round.bids.push({ seat: 3, bid: { kind: 'pass' } });
    expect(firstStageDone(s.round)).toBe(false);
    s.round.bids.push({ seat: 0, bid: { kind: 'pass' } });
    expect(firstStageDone(s.round)).toBe(true);
  });

  it('stage 2: only the first player speaks: pass, mare, mica or tromful tău', () => {
    const s = passFirstStage(stateWith(0, { 1: [c('verde', 3), c('verde', 4), c('rosu', 2)] }));
    expect(s.round.biddingStage).toBe('second');
    expect(kinds(legalBids(s.round, 1))).toEqual([
      'pass', 'mare', 'mica', 'tromf:rosu', 'tromf:verde', 'tromf:ghinda', 'tromf:duba',
    ]);
    for (const seat of [0, 2, 3] as const) expect(legalBids(s.round, seat)).toEqual([]);
  });

  it('the winning bid is the single contract bid', () => {
    expect(winningBid([
      { seat: 1, bid: { kind: 'pass' } },
      { seat: 2, bid: { kind: 'adunare' } },
    ])).toEqual({ seat: 2, bid: { kind: 'adunare' } });
    expect(winningBid([
      { seat: 1, bid: { kind: 'pass' } },
      { seat: 2, bid: { kind: 'pass' } },
      { seat: 3, bid: { kind: 'pass' } },
      { seat: 0, bid: { kind: 'pass' } },
      { seat: 1, bid: { kind: 'mica' } },
    ])).toEqual({ seat: 1, bid: { kind: 'mica' } });
    expect(winningBid([{ seat: 1, bid: { kind: 'pass' } }])).toBeNull();
  });

  it('compares bids including the tromf suit', () => {
    expect(sameBid({ kind: 'tromf', suit: 'rosu' }, { kind: 'tromf', suit: 'rosu' })).toBe(true);
    expect(sameBid({ kind: 'tromf', suit: 'rosu' }, { kind: 'tromf', suit: 'duba' })).toBe(false);
    expect(sameBid({ kind: 'mare' }, { kind: 'mica' })).toBe(false);
  });
});
