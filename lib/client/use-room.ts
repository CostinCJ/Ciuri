'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Card, LegalMoves, PublicState, Seat } from '@/lib/game';
import type { GameEvent } from '@/lib/server/events';
import type { GameSnapshot } from '@/lib/server/service';
import { api } from './api';
import { uniqueId } from './channel-id';
import {
  MESSAGE_LIMIT, parseMessageRow, parsePublicGameRow, parseRoomRow, withGame, withMessage, withPublicGame, withRoom, withSnapshot,
} from './room-merge';
import { browserClient, ensureSession } from './supabase';

export interface RoomRow {
  id: string;
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  start_at: string | null;
}
export interface PlayerRow {
  user_id: string;
  name: string;
  seat: Seat | null;
}
export interface GameRow {
  version: number;
  view: PublicState;
  log: GameEvent[];
  deadline: string | null;
}
export interface HandRow {
  seat: Seat;
  cards: Card[];
  moves: LegalMoves;
}
export interface MessageRow {
  id: number;
  user_id: string;
  name: string;
  text: string;
  created_at: string;
}
export interface RoomData {
  room: RoomRow;
  players: PlayerRow[];
  game: GameRow | null;
  hand: HandRow | null;
  messages: MessageRow[];
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  /** `online` is null until the first presence sync: presence is unknown, not "everyone offline". */
  | { kind: 'ready'; userId: string; data: RoomData; online: ReadonlySet<string> | null };

export type RoomState =
  | Exclude<LoadState, { kind: 'ready' }>
  /** `applyGame` shows the game returned by the player's own move without waiting for realtime. */
  | (Extract<LoadState, { kind: 'ready' }> & { applyGame: (game: GameSnapshot) => void });
export type ReadyRoom = Extract<RoomState, { kind: 'ready' }>;

type Part = 'room' | 'players' | 'game' | 'messages';
const PARTS: Part[] = ['room', 'players', 'game', 'messages'];

/**
 * Applies a fetched part. Room and game go through the order-safe merges; messages are added to
 * the ones already shown, since some may have arrived by realtime after the fetch started.
 */
function mergePart(data: RoomData, patch: Partial<RoomData>): RoomData {
  if (patch.room) return withRoom(data, patch.room);
  if ('game' in patch) return withGame(data, patch.game ?? null, patch.hand ?? null);
  if (patch.messages) return patch.messages.reduce(withMessage, data);
  return { ...data, ...patch };
}

async function fetchPart(db: SupabaseClient, part: Part, roomId: string, userId: string): Promise<Partial<RoomData>> {
  switch (part) {
    case 'room': {
      const { data, error } = await db.from('rooms').select('id, code, status, start_at').eq('id', roomId).single();
      if (error) throw error;
      return { room: data as RoomRow };
    }
    case 'players': {
      const { data, error } = await db.from('room_players').select('user_id, name, seat').eq('room_id', roomId).order('joined_at');
      if (error) throw error;
      return { players: data as PlayerRow[] };
    }
    case 'game': {
      const [game, hand] = await Promise.all([
        db.from('game_public').select('version, view, log, deadline').eq('room_id', roomId).maybeSingle(),
        db.from('game_hands').select('seat, cards, moves').eq('room_id', roomId).eq('user_id', userId).maybeSingle(),
      ]);
      if (game.error) throw game.error;
      if (hand.error) throw hand.error;
      return { game: game.data as GameRow | null, hand: hand.data as HandRow | null };
    }
    case 'messages': {
      const { data, error } = await db
        .from('messages')
        .select('id, user_id, name, text, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT);
      if (error) throw error;
      return { messages: [...(data as MessageRow[])].reverse() };
    }
  }
}

/**
 * Joins room `code` as `name`, loads everything this player may see and keeps it fresh via
 * Supabase Realtime. Room, public game and chat changes are applied from the realtime payload
 * when it is complete; other changes (and incomplete payloads) trigger a re-fetch of that part,
 * where the newest request wins. Game data never goes back to an older version.
 */
export function useRoom(code: string, name: string): RoomState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const applyGame = useCallback((game: GameSnapshot) => {
    setState((prev) => (prev.kind === 'ready' ? { ...prev, data: withSnapshot(prev.data, game) } : prev));
  }, []);

  useEffect(() => {
    const db = browserClient();
    const channels: RealtimeChannel[] = [];
    const latest: Record<Part, number> = { room: 0, players: 0, game: 0, messages: 0 };
    let cancelled = false;
    let ids: { roomId: string; userId: string } | null = null;

    async function refresh(part: Part) {
      if (!ids) return;
      const request = ++latest[part];
      try {
        const patch = await fetchPart(db, part, ids.roomId, ids.userId);
        if (cancelled || request !== latest[part]) return;
        update((data) => mergePart(data, patch));
      } catch {
        // transient: the next change event or re-subscribe refreshes again
      }
    }

    function update(merge: (data: RoomData) => RoomData) {
      setState((prev) => {
        if (prev.kind !== 'ready') return prev;
        const data = merge(prev.data);
        return data === prev.data ? prev : { ...prev, data };
      });
    }

    /**
     * Applies a room or chat row from a realtime payload, or re-fetches the part when the payload
     * is incomplete. A room row is the whole room, so it also discards older room re-fetches
     * still in flight; fetched messages are merged with the ones received meanwhile.
     */
    function applyRow<T>(part: 'room' | 'messages', row: T | null, merge: (data: RoomData, row: T) => RoomData) {
      if (row === null) {
        void refresh(part);
        return;
      }
      if (part === 'room') latest.room++;
      update((data) => merge(data, row));
    }

    /** A newer public game is shown at once; the re-fetch brings this player's matching hand. */
    function applyPublicGame(row: GameRow | null) {
      if (row) update((data) => withPublicGame(data, row));
      void refresh('game');
    }

    async function start() {
      try {
        const session = await ensureSession();
        if (cancelled) return;
        const joined = await api.joinRoom(code, name);
        if (cancelled) return;
        await db.realtime.setAuth(session.access_token);
        if (cancelled) return;
        const { data: room, error } = await db
          .from('rooms')
          .select('id, code, status, start_at')
          .eq('code', joined.code)
          .single();
        if (cancelled) return;
        if (error || !room) throw new Error('Camera nu există.');
        ids = { roomId: room.id, userId: session.user.id };

        const parts = await Promise.all((['players', 'game', 'messages'] as const).map((p) => fetchPart(db, p, room.id, session.user.id)));
        if (cancelled) return;
        const data: RoomData = Object.assign({ room: room as RoomRow, players: [], game: null, hand: null, messages: [] }, ...parts);
        setState({ kind: 'ready', userId: session.user.id, data, online: null });

        const byRoom = `room_id=eq.${room.id}`;
        // db.channel(topic) returns an existing channel with the same topic, and one from a
        // previous effect run (Strict Mode, fast remount) may still be leaving. The change feed
        // gets a unique topic per run; presence must share one topic across all players, so
        // instead any leftover presence channel is removed before joining again.
        const run = uniqueId();
        const changes = db
          .channel(`db:${room.id}:${run}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) =>
            applyRow('room', parseRoomRow(payload.new), withRoom),
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: byRoom }, () => void refresh('players'))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_public', filter: byRoom }, (payload) =>
            applyPublicGame(parsePublicGameRow(payload.new)),
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_hands', filter: byRoom }, () => void refresh('game'))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: byRoom }, (payload) =>
            applyRow('messages', parseMessageRow(payload.new), withMessage),
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') PARTS.forEach((p) => void refresh(p));
          });
        channels.push(changes);

        const presenceTopic = `presence:${room.id}`;
        for (const old of db.getChannels().filter((c) => c.topic === `realtime:${presenceTopic}`)) {
          await db.removeChannel(old);
        }
        if (cancelled) return;
        const presence = db.channel(presenceTopic, { config: { presence: { key: session.user.id } } });
        presence
          .on('presence', { event: 'sync' }, () => {
            const online = new Set(Object.keys(presence.presenceState()));
            setState((prev) => (prev.kind === 'ready' ? { ...prev, online } : prev));
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') void presence.track({ online_at: new Date().toISOString() });
          });
        channels.push(presence);
      } catch (error) {
        if (!cancelled) setState({ kind: 'error', message: error instanceof Error ? error.message : 'Eroare necunoscută.' });
      }
    }

    void start();
    return () => {
      cancelled = true;
      channels.forEach((channel) => void db.removeChannel(channel));
    };
  }, [code, name]);

  return useMemo(() => (state.kind === 'ready' ? { ...state, applyGame } : state), [state, applyGame]);
}
