import type { Seat } from '@/lib/game';
import {
  MESSAGE_INTERVAL_MS, type GameRecord, type GameWrite, type HandWrite, type PlayerRecord, type RoomRecord, type Store,
} from './store';

interface StoredMessage {
  roomId: string;
  userId: string;
  name: string;
  text: string;
  createdAt: string;
}

/** Deep copy through JSON, like a jsonb round trip (drops undefined properties). */
function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * In-memory Store for tests, mirroring the Supabase store's contract (see store.ts).
 * Fields are public so tests can inspect them.
 */
export class MemoryStore implements Store {
  readonly rooms = new Map<string, RoomRecord>();
  readonly players = new Map<string, PlayerRecord[]>();
  readonly games = new Map<string, GameRecord>();
  readonly hands = new Map<string, HandWrite[]>();
  readonly messages: StoredMessage[] = [];
  /** roomId → user id of the room's creator. */
  readonly creators = new Map<string, string>();
  private nextId = 1;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async insertRoom(code: string, createdBy: string): Promise<RoomRecord | null> {
    if ([...this.rooms.values()].some((r) => r.code === code)) return null;
    const room: RoomRecord = { id: `room-${this.nextId++}`, code, status: 'lobby', startAt: null };
    this.rooms.set(room.id, room);
    this.creators.set(room.id, createdBy);
    this.players.set(room.id, []);
    return { ...room };
  }

  async findRoom(code: string): Promise<RoomRecord | null> {
    const room = [...this.rooms.values()].find((r) => r.code === code);
    return room ? { ...room } : null;
  }

  async listPlayers(roomId: string): Promise<PlayerRecord[]> {
    return (this.players.get(roomId) ?? []).map((p) => ({ ...p }));
  }

  async upsertPlayer(roomId: string, userId: string, name: string): Promise<void> {
    const list = this.roomPlayers(roomId);
    const existing = list.find((p) => p.userId === userId);
    if (existing) existing.name = name;
    else list.push({ userId, name, seat: null });
  }

  async setSeat(roomId: string, userId: string, seat: Seat | null): Promise<boolean> {
    if (this.rooms.get(roomId)?.status !== 'lobby') return false;
    const list = this.roomPlayers(roomId);
    const player = list.find((p) => p.userId === userId);
    if (!player) return false;
    if (seat !== null && list.some((p) => p.seat === seat && p.userId !== userId)) return false;
    player.seat = seat;
    return true;
  }

  async setStartAt(roomId: string, startAt: string | null): Promise<void> {
    this.room(roomId).startAt = startAt;
  }

  async loadGame(roomId: string): Promise<GameRecord | null> {
    const game = this.games.get(roomId);
    return game ? jsonCopy(game) : null;
  }

  async commitGame(roomId: string, expectedVersion: number, write: GameWrite): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if ((this.games.get(roomId)?.version ?? 0) !== expectedVersion) return false;
    if (expectedVersion === 0 && (room.status !== 'lobby' || !this.seatsMatch(roomId, write.users))) return false;

    this.games.set(roomId, jsonCopy({
      version: expectedVersion + 1,
      state: write.state,
      log: write.log,
      deadline: write.deadline,
      users: write.users,
    }));
    this.hands.set(roomId, jsonCopy(write.hands));
    room.status = write.roomStatus;
    room.startAt = null;
    return true;
  }

  async insertMessage(roomId: string, userId: string, name: string, text: string): Promise<boolean> {
    const now = this.now();
    const recent = this.messages.some((m) =>
      m.roomId === roomId && m.userId === userId && now.getTime() - new Date(m.createdAt).getTime() < MESSAGE_INTERVAL_MS);
    if (recent) return false;
    this.messages.push({ roomId, userId, name, text, createdAt: now.toISOString() });
    return true;
  }

  /** True when exactly the 4 seats are taken, by `users[seat]` each. */
  private seatsMatch(roomId: string, users: string[]): boolean {
    const seated = this.roomPlayers(roomId).filter((p) => p.seat !== null);
    return users.length === 4 && seated.length === 4 && seated.every((p) => p.seat !== null && users[p.seat] === p.userId);
  }

  private room(roomId: string): RoomRecord {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    return room;
  }

  private roomPlayers(roomId: string): PlayerRecord[] {
    const list = this.players.get(roomId);
    if (!list) throw new Error(`Unknown room ${roomId}`);
    return list;
  }
}
