import { describe, expect, it } from 'vitest';
import type { RoundResult } from '@/lib/game';
import {
  bidLabel, cardName, describeEvent, modeName, pointsText, resultText, scoreBreakdown, teamName,
} from '../format';

const NAMES = ['Ana', 'Bogdan', 'Cristi', 'Dana'];

describe('labels', () => {
  it('names cards, bids, modes and teams in Romanian', () => {
    expect(cardName({ suit: 'rosu', rank: 11 })).toBe('As Roșu');
    expect(cardName({ suit: 'ghinda', rank: 3 })).toBe('Trei Ghindă');
    expect(bidLabel({ kind: 'pass' })).toBe('Pas');
    expect(bidLabel({ kind: 'mica' })).toBe('Mica');
    expect(bidLabel({ kind: 'tromf', suit: 'duba' })).toBe('Tromful tău: Dubă');
    expect(modeName('normal')).toBe('Joc normal');
    expect(modeName('tromf')).toBe('Tromful tău');
    expect(teamName('B')).toBe('Echipa B');
  });

  it('uses Romanian plural rules for points', () => {
    expect(pointsText(1)).toBe('1 punct');
    expect(pointsText(0)).toBe('0 puncte');
    expect(pointsText(12)).toBe('12 puncte');
    expect(pointsText(20)).toBe('20 de puncte');
    expect(pointsText(66)).toBe('66 de puncte');
    expect(pointsText(101)).toBe('101 puncte');
  });
});

describe('resultText', () => {
  const base = { winner: 'B', points: 3, mode: 'normal', bidder: null } as const;

  it('describes normal rounds, stops and contracts', () => {
    expect(resultText({ ...base, reason: 'normal' }, NAMES)).toBe('Echipa B primește 3 puncte (a luat ultima mână).');
    expect(resultText({ ...base, reason: 'stop', stopBy: 3 }, NAMES)).toBe('Dana a zis Stop. Echipa B primește 3 puncte.');
    expect(resultText({ ...base, winner: 'A', reason: 'stop', stopBy: 3 }, NAMES))
      .toBe('Dana a zis Stop, dar nu avea 66. Echipa A primește 3 puncte.');
    expect(resultText({ ...base, winner: 'A', reason: 'stop', stopBy: 2 }, NAMES)).toBe('Cristi a zis Stop. Echipa A primește 3 puncte.');
    const made: RoundResult = { winner: 'B', points: 12, reason: 'contract-made', mode: 'ciuri', bidder: 1 };
    expect(resultText(made, NAMES)).toBe('Bogdan a făcut Ciuri. Echipa B primește 12 puncte.');
    const failed: RoundResult = { winner: 'A', points: 12, reason: 'contract-failed', mode: 'adunare', bidder: 1, adunareSum: 65 };
    expect(resultText(failed, NAMES)).toBe('Bogdan n-a făcut Adunare. Cărțile arătate: 65 de puncte. Echipa A primește 12 puncte.');
  });
});

describe('scoreBreakdown', () => {
  const normal = { winner: 'A', points: 3, reason: 'normal', mode: 'normal', bidder: null } as const;

  it('explains 3, 2 and 1 point normal rounds from the opponents tricks and points', () => {
    expect(scoreBreakdown(normal, { tricksTaken: { A: 5, B: 0 }, points: { A: 120, B: 0 } })).toEqual([
      'Puncte în rundă: Echipa A 120 – 0 Echipa B.',
      '3 puncte: Echipa B n-a luat nicio mână.',
    ]);
    expect(scoreBreakdown({ ...normal, points: 2 }, { tricksTaken: { A: 3, B: 2 }, points: { A: 93, B: 27 } })).toEqual([
      'Puncte în rundă: Echipa A 93 – 27 Echipa B.',
      '2 puncte: Echipa B a luat mâini, dar are doar 27 de puncte (sub 33).',
    ]);
    expect(scoreBreakdown({ ...normal, winner: 'B', points: 1 }, { tricksTaken: { A: 2, B: 3 }, points: { A: 53, B: 67 } })).toEqual([
      'Puncte în rundă: Echipa A 53 – 67 Echipa B.',
      '1 punct: Echipa A are 53 de puncte (33 sau mai mult).',
    ]);
  });

  it('shows only the round points for Stop and contracts, and nothing for Adunare', () => {
    const round = { tricksTaken: { A: 1, B: 1 }, points: { A: 40, B: 21 } };
    expect(scoreBreakdown({ ...normal, reason: 'stop', stopBy: 0 }, round)).toEqual(['Puncte în rundă: Echipa A 40 – 21 Echipa B.']);
    const ciuri: RoundResult = { winner: 'B', points: 12, reason: 'contract-made', mode: 'ciuri', bidder: 1 };
    expect(scoreBreakdown(ciuri, round)).toEqual(['Puncte în rundă: Echipa A 40 – 21 Echipa B.']);
    const adunare: RoundResult = { winner: 'A', points: 12, reason: 'contract-failed', mode: 'adunare', bidder: 1, adunareSum: 65 };
    expect(scoreBreakdown(adunare, round)).toEqual([]);
  });
});

describe('describeEvent', () => {
  it('turns log events into sentences', () => {
    expect(describeEvent({ type: 'matchStart', dealer: 0 }, NAMES)).toBe('Meci nou. Împarte Ana.');
    expect(describeEvent({ type: 'newRound', dealer: 1, roundNumber: 2 }, NAMES)).toBe('Runda 2. Împarte Bogdan.');
    expect(describeEvent({ type: 'timeout', seat: 2 }, NAMES)).toBe('Cristi n-a mutat la timp.');
    expect(describeEvent({ type: 'bid', seat: 3, bid: { kind: 'pass' } }, NAMES)).toBe('Dana: Pas.');
    expect(describeEvent({ type: 'bid', seat: 1, bid: { kind: 'mare' } }, NAMES)).toBe('Bogdan a zis Mare.');
    expect(describeEvent({ type: 'declare', seat: 0, suit: 'verde', points: 40 }, NAMES)).toBe('Ana a strigat 40 (Verde).');
    expect(describeEvent({ type: 'trick', winner: 2 }, NAMES)).toBe('Cristi ia mâna.');
    expect(describeEvent({ type: 'trick', winner: null }, NAMES)).toBe('Mână jucată.');
    expect(describeEvent({ type: 'redeal', dealer: 0, redeals: 1 }, NAMES)).toBe(
      'Adversarii celui care împarte n-au tromf: se împart din nou cărțile. Împarte Ana.',
    );
    expect(describeEvent({ type: 'redeal', dealer: 0, redeals: 1, trumpCard: { suit: 'duba', rank: 11 } }, NAMES)).toBe(
      'Tromf era As Dubă, dar adversarii celui care împarte n-au tromf: se împart din nou cărțile. Împarte Ana.',
    );
  });
});
