import { describe, expect, it } from 'vitest';
import { legalCards, trickWinner } from '../play';
import type { Card, Rank, Seat, Suit, TrickPlay } from '../types';

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });
const t = (...cards: Card[]): TrickPlay[] => cards.map((card, i) => ({ seat: i as Seat, card }));

describe('trickWinner', () => {
  it('highest card of the led suit wins without trumps', () => {
    expect(trickWinner(t(c('rosu', 10), c('rosu', 11), c('duba', 11)), 'verde').seat).toBe(1);
  });
  it('any trump beats the led suit', () => {
    expect(trickWinner(t(c('rosu', 11), c('verde', 2)), 'verde').seat).toBe(1);
  });
  it('highest trump wins', () => {
    expect(trickWinner(t(c('rosu', 11), c('verde', 2), c('verde', 10)), 'verde').seat).toBe(2);
  });
  it('off-suit cards never win when there is no trump', () => {
    expect(trickWinner(t(c('rosu', 3), c('duba', 11)), null).seat).toBe(0);
  });
});

describe('legalCards (strict, trump game)', () => {
  const trump = 'verde';
  it('leader may play anything', () => {
    const hand = [c('rosu', 2), c('verde', 3)];
    expect(legalCards(hand, [], trump, true)).toEqual(hand);
  });
  it('must follow suit and beat when possible', () => {
    expect(legalCards([c('rosu', 2), c('rosu', 11), c('verde', 3)], t(c('rosu', 10)), trump, true))
      .toEqual([c('rosu', 11)]);
  });
  it('must follow suit even when unable to beat', () => {
    expect(legalCards([c('rosu', 2), c('rosu', 3), c('verde', 3)], t(c('rosu', 10)), trump, true))
      .toEqual([c('rosu', 2), c('rosu', 3)]);
  });
  it('after the trick is trumped, any card of the led suit is allowed', () => {
    expect(legalCards([c('rosu', 2), c('rosu', 11)], t(c('rosu', 10), c('verde', 2)), trump, true))
      .toEqual([c('rosu', 2), c('rosu', 11)]);
  });
  it('must trump when void in the led suit', () => {
    expect(legalCards([c('duba', 2), c('verde', 3)], t(c('rosu', 10)), trump, true))
      .toEqual([c('verde', 3)]);
  });
  it('must over-trump when possible', () => {
    expect(legalCards([c('verde', 3), c('verde', 11), c('duba', 2)], t(c('rosu', 10), c('verde', 4)), trump, true))
      .toEqual([c('verde', 11)]);
  });
  it('must still trump when unable to over-trump', () => {
    expect(legalCards([c('verde', 3), c('duba', 2)], t(c('rosu', 10), c('verde', 4)), trump, true))
      .toEqual([c('verde', 3)]);
  });
  it('anything goes with neither the led suit nor trumps', () => {
    const hand = [c('duba', 2), c('ghinda', 3)];
    expect(legalCards(hand, t(c('rosu', 10)), trump, true)).toEqual(hand);
  });
});

describe('legalCards (non-strict, Mare/Mica)', () => {
  it('must follow suit but need not beat', () => {
    expect(legalCards([c('rosu', 2), c('rosu', 11), c('verde', 3)], t(c('rosu', 10)), null, false))
      .toEqual([c('rosu', 2), c('rosu', 11)]);
  });
  it('anything when void', () => {
    const hand = [c('duba', 2), c('verde', 3)];
    expect(legalCards(hand, t(c('rosu', 10)), null, false)).toEqual(hand);
  });
});
