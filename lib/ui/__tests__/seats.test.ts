import { describe, expect, it } from 'vitest';
import { positionOf, seatNames } from '../seats';

describe('positionOf', () => {
  it('puts the viewer at the bottom and play goes bottom → left → top → right', () => {
    expect(positionOf(2, 2)).toBe('bottom');
    expect(positionOf(3, 2)).toBe('left');
    expect(positionOf(0, 2)).toBe('top');
    expect(positionOf(1, 2)).toBe('right');
  });

  it('uses seat 0 as the bottom for spectators', () => {
    expect(positionOf(0, null)).toBe('bottom');
    expect(positionOf(2, null)).toBe('top');
  });
});

describe('seatNames', () => {
  it('maps seated players to their seat and fills gaps', () => {
    expect(seatNames([{ name: 'Ana', seat: 2 }, { name: 'Bogdan', seat: null }])).toEqual(['Locul 1', 'Locul 2', 'Ana', 'Locul 4']);
  });
});
