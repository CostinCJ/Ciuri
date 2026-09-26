import type { Seat } from '@/lib/game';
import { isBotId } from '@/lib/bots';

export type Position = 'bottom' | 'left' | 'top' | 'right';

const ORDER: Position[] = ['bottom', 'left', 'top', 'right'];
export const SEATS: Seat[] = [0, 1, 2, 3];

/** Screen position of `seat` for a viewer sitting at `viewer` (spectators see seat 0 at the bottom). */
export function positionOf(seat: Seat, viewer: Seat | null): Position {
  return ORDER[(seat - (viewer ?? 0) + 4) % 4];
}

/**
 * Whether to show `userId` as disconnected. `online` is null until the first presence sync.
 * Computer players are never disconnected.
 */
export function isOffline(online: ReadonlySet<string> | null, userId: string | undefined): boolean {
  if (online === null || isBotId(userId)) return false;
  return userId === undefined || !online.has(userId);
}

export function seatNames(players: { name: string; seat: Seat | null }[]): string[] {
  const names = SEATS.map((seat) => `Locul ${seat + 1}`);
  for (const p of players) if (p.seat !== null) names[p.seat] = p.name;
  return names;
}
