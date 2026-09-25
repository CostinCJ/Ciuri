'use client';

import type { ReadyRoom } from '@/lib/client/use-room';

/** Temporary placeholder until the game table is built (Task 5). */
export function Table({ room }: { room: ReadyRoom }) {
  return <p className="p-8 text-center">Jocul a început. ({room.data.room.code})</p>;
}
