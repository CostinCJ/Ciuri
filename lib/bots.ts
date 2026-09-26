import type { Seat } from '@/lib/game';

/**
 * Computer players are ordinary room members with a reserved user id per seat. Real users get
 * random v4 ids from Supabase auth, so they never collide with these.
 */
const BOT_ID_PREFIX = '00000000-0000-4000-8000-00000000b0';

export function botUserId(seat: Seat): string {
  return `${BOT_ID_PREFIX}0${seat}`;
}

export function isBotId(userId: string | undefined): boolean {
  return userId !== undefined && userId.startsWith(BOT_ID_PREFIX);
}

export function botName(seat: Seat): string {
  return `Calculator ${seat + 1}`;
}
