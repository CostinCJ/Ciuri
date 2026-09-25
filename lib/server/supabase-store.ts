import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameState, Seat } from '@/lib/game';
import type { GameEvent } from './events';
import type { GameRecord, GameWrite, PlayerRecord, RoomRecord, RoomStatus, Store } from './store';

const UNIQUE_VIOLATION = '23505';

interface RoomRow {
  id: string;
  code: string;
  status: string;
  start_at: string | null;
}

function toRoom(row: RoomRow): RoomRecord {
  return { id: row.id, code: row.code, status: row.status as RoomStatus, startAt: row.start_at };
}

/** Store backed by Supabase Postgres, used with the service-role client (bypasses RLS). */
export class SupabaseStore implements Store {
  constructor(private readonly db: SupabaseClient) {}

  async insertRoom(code: string, createdBy: string): Promise<RoomRecord | null> {
    const { data, error } = await this.db
      .from('rooms')
      .insert({ code, created_by: createdBy })
      .select('id, code, status, start_at')
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return null;
      throw error;
    }
    return toRoom(data);
  }

  async findRoom(code: string): Promise<RoomRecord | null> {
    const { data, error } = await this.db.from('rooms').select('id, code, status, start_at').eq('code', code).maybeSingle();
    if (error) throw error;
    return data ? toRoom(data) : null;
  }

  async listPlayers(roomId: string): Promise<PlayerRecord[]> {
    const { data, error } = await this.db
      .from('room_players')
      .select('user_id, name, seat')
      .eq('room_id', roomId)
      .order('joined_at');
    if (error) throw error;
    return data.map((row) => ({ userId: row.user_id, name: row.name, seat: row.seat as Seat | null }));
  }

  async upsertPlayer(roomId: string, userId: string, name: string): Promise<void> {
    const { error } = await this.db
      .from('room_players')
      .upsert({ room_id: roomId, user_id: userId, name }, { onConflict: 'room_id,user_id' });
    if (error) throw error;
  }

  /** Via the set_seat RPC: false when taken, not a member, or the room left the lobby (atomic). */
  async setSeat(roomId: string, userId: string, seat: Seat | null): Promise<boolean> {
    const { data, error } = await this.db.rpc('set_seat', { p_room: roomId, p_user: userId, p_seat: seat });
    if (error) throw error;
    return data === true;
  }

  /** No-op unless the room is in the lobby (the status filter is part of the same update). */
  async setStartAt(roomId: string, startAt: string | null): Promise<void> {
    const { error } = await this.db.from('rooms').update({ start_at: startAt }).eq('id', roomId).eq('status', 'lobby');
    if (error) throw error;
  }

  async loadGame(roomId: string): Promise<GameRecord | null> {
    const { data, error } = await this.db
      .from('game_secret')
      .select('version, state, log, deadline, users')
      .eq('room_id', roomId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      version: data.version,
      state: data.state as GameState,
      log: data.log as GameEvent[],
      deadline: data.deadline,
      users: data.users as string[],
    };
  }

  async commitGame(roomId: string, expectedVersion: number, write: GameWrite): Promise<boolean> {
    const { data, error } = await this.db.rpc('commit_game', {
      p_room: roomId,
      p_expected: expectedVersion,
      p_state: write.state,
      p_view: write.view,
      p_log: write.log,
      p_deadline: write.deadline,
      p_users: write.users,
      p_hands: write.hands.map((h) => ({ seat: h.seat, user_id: h.userId, cards: h.cards, moves: h.moves })),
      p_status: write.roomStatus,
    });
    if (error) throw error;
    return data === true;
  }

  /** Via the send_message RPC: the 1-per-second limit uses the database clock and is atomic. */
  async insertMessage(roomId: string, userId: string, name: string, text: string): Promise<boolean> {
    const { data, error } = await this.db.rpc('send_message', {
      p_room: roomId,
      p_user: userId,
      p_name: name,
      p_text: text,
    });
    if (error) throw error;
    return data === true;
  }
}
