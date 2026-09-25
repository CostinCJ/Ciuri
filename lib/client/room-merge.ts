import type { LegalMoves } from '@/lib/game';
import type { GameSnapshot } from '@/lib/server/service';
import type { GameRow, HandRow, MessageRow, RoomData, RoomRow } from './use-room';

/**
 * Pure helpers that merge new data into RoomData. Updates reach the client from several sources
 * (move responses, realtime payloads, re-fetches) that can arrive out of order, so the merges
 * keep the newest game version and return `data` itself when nothing changes.
 */

export const MESSAGE_LIMIT = 100;
const NO_MOVES: LegalMoves = { bids: [], cards: [], declarable: [], canStop: false };
const STATUSES: ReadonlySet<string> = new Set(['lobby', 'playing', 'finished']);

type Row = Record<string, unknown>;

/** A rooms row from a realtime payload, or null when incomplete. */
export function parseRoomRow(row: Row): RoomRow | null {
  const { id, code, status, start_at } = row;
  if (typeof id !== 'string' || typeof code !== 'string' || typeof status !== 'string' || !STATUSES.has(status)) return null;
  if (start_at !== null && typeof start_at !== 'string') return null;
  return { id, code, status: status as RoomRow['status'], start_at };
}

/** A game_public row from a realtime payload, or null when incomplete. */
export function parsePublicGameRow(row: Row): GameRow | null {
  const { version, view, log, deadline } = row;
  if (typeof version !== 'number' || typeof view !== 'object' || view === null || !Array.isArray(log)) return null;
  if (deadline !== null && typeof deadline !== 'string') return null;
  return { version, view, log, deadline } as GameRow;
}

/** A messages row from a realtime payload, or null when incomplete. */
export function parseMessageRow(row: Row): MessageRow | null {
  const { id, user_id, name, text, created_at } = row;
  if (typeof id !== 'number' || typeof user_id !== 'string' || typeof name !== 'string') return null;
  if (typeof text !== 'string' || typeof created_at !== 'string') return null;
  return { id, user_id, name, text, created_at };
}

/** Game and hand read together; ignored when older than the game already shown. */
export function withGame(data: RoomData, game: GameRow | null, hand: HandRow | null): RoomData {
  if (data.game && (!game || game.version < data.game.version)) return data;
  return { ...data, game, hand };
}

/** The response to the player's own move (or tick): the committed game, their hand and room status. */
export function withSnapshot(data: RoomData, snapshot: GameSnapshot): RoomData {
  const { version, view, log, deadline, hand, roomStatus } = snapshot;
  const next = withGame(data, { version, view, log, deadline }, hand);
  if (next === data || next.room.status === roomStatus) return next;
  return { ...next, room: { ...next.room, status: roomStatus, start_at: null } };
}

/**
 * A newer public game without this player's hand (a realtime game_public change). The hand row
 * arrives separately, so until it is re-fetched its moves are withheld: they belong to the
 * previous version.
 */
export function withPublicGame(data: RoomData, game: GameRow): RoomData {
  if (data.game && game.version <= data.game.version) return data;
  return { ...data, game, hand: data.hand && { ...data.hand, moves: NO_MOVES } };
}

/** The room row; a room never returns to the lobby, so such a (stale) row is ignored. */
export function withRoom(data: RoomData, room: RoomRow): RoomData {
  const current = data.room;
  if (current.status !== 'lobby' && room.status === 'lobby') return data;
  if (current.id === room.id && current.code === room.code && current.status === room.status && current.start_at === room.start_at) {
    return data;
  }
  return { ...data, room };
}

/** Adds a chat message (once), keeping the newest MESSAGE_LIMIT by id. */
export function withMessage(data: RoomData, message: MessageRow): RoomData {
  if (data.messages.some((m) => m.id === message.id)) return data;
  const messages = [...data.messages, message].sort((a, b) => a.id - b.id).slice(-MESSAGE_LIMIT);
  return { ...data, messages };
}
