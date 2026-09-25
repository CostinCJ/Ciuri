import type { Seat } from '@/lib/game';

export type Position = 'bottom' | 'left' | 'top' | 'right';

const ORDER: Position[] = ['bottom', 'left', 'top', 'right'];
export const SEATS: Seat[] = [0, 1, 2, 3];

/** Screen position of `seat` for a viewer sitting at `viewer` (spectators see seat 0 at the bottom). */
export function positionOf(seat: Seat, viewer: Seat | null): Position {
  return ORDER[(seat - (viewer ?? 0) + 4) % 4];
}

export function seatNames(players: { name: string; seat: Seat | null }[]): string[] {
  const names = SEATS.map((seat) => `Locul ${seat + 1}`);
  for (const p of players) if (p.seat !== null) names[p.seat] = p.name;
  return names;
}
