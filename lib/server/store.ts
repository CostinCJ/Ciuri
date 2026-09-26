import type { Card, GameState, LegalMoves, PublicState, Seat } from '@/lib/game';
import type { GameEvent } from './events';

export type RoomStatus = 'lobby' | 'playing' | 'finished';

/** A user may post at most one chat message per room per this interval (enforced by the store). */
export const MESSAGE_INTERVAL_MS = 1000;

export interface RoomRecord {
  id: string;
  code: string;
  status: RoomStatus;
  /** ISO time at which the match starts automatically (all 4 seats taken), else null. */
  startAt: string | null;
}

export interface PlayerRecord {
  userId: string;
  name: string;
  seat: Seat | null;
}

export interface GameRecord {
  version: number;
  state: GameState;
  log: GameEvent[];
  deadline: string | null;
  /** User ids indexed by seat, fixed when the match starts. The game never reads live seats. */
  users: string[];
}

export interface HandWrite {
  seat: Seat;
  userId: string;
  cards: Card[];
  moves: LegalMoves;
}

export interface GameWrite {
  state: GameState;
  view: PublicState;
  log: GameEvent[];
  deadline: string | null;
  /** User ids indexed by seat (length 4). */
  users: string[];
  hands: HandWrite[];
  roomStatus: RoomStatus;
}

export interface Store {
  /** Returns null when the code is already taken. */
  insertRoom(code: string, createdBy: string): Promise<RoomRecord | null>;
  findRoom(code: string): Promise<RoomRecord | null>;
  listPlayers(roomId: string): Promise<PlayerRecord[]>;
  /** Adds the player (without a seat) or updates their name. */
  upsertPlayer(roomId: string, userId: string, name: string): Promise<void>;
  /**
   * Sits the player down (or stands them up with null). Returns false when the seat is taken by
   * someone else, the player is not in the room, or the room is no longer in the lobby
   * (seats are frozen once a match started; the check is part of the same atomic write).
   */
  setSeat(roomId: string, userId: string, seat: Seat | null): Promise<boolean>;
  /** Removes a member who has no seat (used for computer players). No-op otherwise. */
  removePlayer(roomId: string, userId: string): Promise<void>;
  /** Sets or clears the start countdown. No-op unless the room is in the lobby. */
  setStartAt(roomId: string, startAt: string | null): Promise<void>;
  loadGame(roomId: string): Promise<GameRecord | null>;
  /**
   * Atomically writes the game (secret state, seat → user mapping, public view, hands, room
   * status; clears startAt). Returns false, writing nothing, when:
   * - expectedVersion > 0 and the stored version differs (another request committed first);
   * - expectedVersion is 0 (first match of the room) and a game already exists, the room is
   *   not in the lobby, or the room's seated players are not exactly `write.users` (all 4 seats);
   * - the room does not exist.
   */
  commitGame(roomId: string, expectedVersion: number, write: GameWrite): Promise<boolean>;
  /**
   * Stores a chat message. Returns false (storing nothing) when the same user posted in this
   * room less than MESSAGE_INTERVAL_MS ago by the store's clock. Check and insert are atomic.
   */
  insertMessage(roomId: string, userId: string, name: string, text: string): Promise<boolean>;
}
