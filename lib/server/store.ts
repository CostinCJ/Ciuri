import type { Card, GameState, LegalMoves, PublicState, Seat } from '@/lib/game';
import type { GameEvent } from './events';

export type RoomStatus = 'lobby' | 'playing' | 'finished';

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
  /** Returns false when the seat is taken by someone else or the player is not in the room. */
  setSeat(roomId: string, userId: string, seat: Seat | null): Promise<boolean>;
  setStartAt(roomId: string, startAt: string | null): Promise<void>;
  loadGame(roomId: string): Promise<GameRecord | null>;
  /**
   * Atomically writes the game (secret state, public view, hands, room status; clears startAt).
   * expectedVersion 0 = no game yet. Returns false on a version conflict.
   */
  commitGame(roomId: string, expectedVersion: number, write: GameWrite): Promise<boolean>;
  lastMessageAt(roomId: string, userId: string): Promise<string | null>;
  insertMessage(roomId: string, userId: string, name: string, text: string): Promise<void>;
}
