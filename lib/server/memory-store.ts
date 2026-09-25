import type { Seat } from '@/lib/game';
import type { GameRecord, GameWrite, HandWrite, PlayerRecord, RoomRecord, Store } from './store';

interface StoredMessage {
  roomId: string;
  userId: string;
  name: string;
  text: string;
  createdAt: string;
}

/** In-memory Store for tests. Fields are public so tests can inspect them. */
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
    return game ? structuredClone(game) : null;
  }

  async commitGame(roomId: string, expectedVersion: number, write: GameWrite): Promise<boolean> {
    if ((this.games.get(roomId)?.version ?? 0) !== expectedVersion) return false;
    this.games.set(roomId, structuredClone({
      version: expectedVersion + 1,
      state: write.state,
      log: write.log,
      deadline: write.deadline,
    }));
    this.hands.set(roomId, structuredClone(write.hands));
    const room = this.room(roomId);
    room.status = write.roomStatus;
    room.startAt = null;
    return true;
  }

  async lastMessageAt(roomId: string, userId: string): Promise<string | null> {
    const mine = this.messages.filter((m) => m.roomId === roomId && m.userId === userId);
    return mine.length > 0 ? mine[mine.length - 1].createdAt : null;
  }

  async insertMessage(roomId: string, userId: string, name: string, text: string): Promise<void> {
    this.messages.push({ roomId, userId, name, text, createdAt: this.now().toISOString() });
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
