import { describe, expect, it } from 'vitest';
import {
  fullDeck, marriageSuit, nextSeat, otherTeam, partnerOf, removeCard,
  sameCard, seatsFrom, shuffle, sumPoints, teamOf,
} from '../cards';
import type { Card, Rank, Suit } from '../types';
import { mulberry32 } from './helpers';

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });

describe('cards', () => {
  it('builds a 20-card deck worth 120 points with unique cards', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(20);
    expect(sumPoints(deck)).toBe(120);
    const ids = new Set(deck.map((x) => `${x.suit}-${x.rank}`));
    expect(ids.size).toBe(20);
  });

  it('shuffle keeps the same cards and is deterministic for a given rng', () => {
    const ids = (cards: Card[]) => cards.map((x) => `${x.suit}-${x.rank}`);
    const a = shuffle(fullDeck(), mulberry32(42));
    const b = shuffle(fullDeck(), mulberry32(42));
    expect(a).toEqual(b);
    expect(a).toHaveLength(20);
    expect(sumPoints(a)).toBe(120);
    expect([...ids(a)].sort()).toEqual([...ids(fullDeck())].sort());
    const other = shuffle(fullDeck(), mulberry32(7));
    expect(ids(other)).not.toEqual(ids(fullDeck()));
  });

  it('maps seats to teams, partners and clockwise order', () => {
    expect(teamOf(0)).toBe('A');
    expect(teamOf(1)).toBe('B');
    expect(teamOf(2)).toBe('A');
    expect(teamOf(3)).toBe('B');
    expect(otherTeam('A')).toBe('B');
    expect(partnerOf(1)).toBe(3);
    expect(nextSeat(3)).toBe(0);
    expect(seatsFrom(2)).toEqual([2, 3, 0, 1]);
  });

  it('finds a marriage (3 + 4 of the same suit)', () => {
    expect(marriageSuit([c('verde', 3), c('rosu', 11), c('verde', 4)])).toBe('verde');
    expect(marriageSuit([c('verde', 3), c('rosu', 4), c('verde', 11)])).toBeNull();
  });

  it('compares and removes cards', () => {
    expect(sameCard(c('duba', 10), c('duba', 10))).toBe(true);
    expect(sameCard(c('duba', 10), c('rosu', 10))).toBe(false);
    expect(removeCard([c('duba', 10), c('rosu', 2)], c('duba', 10))).toEqual([c('rosu', 2)]);
  });
});
