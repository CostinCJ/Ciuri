'use client';

import { useEffect, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Card, LegalMoves, PublicState, Seat } from '@/lib/game';
import type { GameEvent } from '@/lib/server/events';
import { api } from './api';
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

export type RoomState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; userId: string; data: RoomData; online: ReadonlySet<string> };
export type ReadyRoom = Extract<RoomState, { kind: 'ready' }>;

type Part = 'room' | 'players' | 'game' | 'messages';
const PARTS: Part[] = ['room', 'players', 'game', 'messages'];
const MESSAGE_LIMIT = 100;

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
 * Supabase Realtime. Each change triggers a re-fetch of that part; the newest request wins.
 */
export function useRoom(code: string, name: string): RoomState {
  const [state, setState] = useState<RoomState>({ kind: 'loading' });

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
        setState((prev) => (prev.kind === 'ready' ? { ...prev, data: { ...prev.data, ...patch } } : prev));
      } catch {
        // transient: the next change event or re-subscribe refreshes again
      }
    }

    async function start() {
      try {
        const session = await ensureSession();
        const joined = await api.joinRoom(code, name);
        await db.realtime.setAuth(session.access_token);
        const { data: room, error } = await db
          .from('rooms')
          .select('id, code, status, start_at')
          .eq('code', joined.code)
          .single();
        if (error || !room) throw new Error('Camera nu există.');
        ids = { roomId: room.id, userId: session.user.id };

        const parts = await Promise.all((['players', 'game', 'messages'] as const).map((p) => fetchPart(db, p, room.id, session.user.id)));
        if (cancelled) return;
        const data: RoomData = Object.assign({ room: room as RoomRow, players: [], game: null, hand: null, messages: [] }, ...parts);
        setState({ kind: 'ready', userId: session.user.id, data, online: new Set() });

        const byRoom = `room_id=eq.${room.id}`;
        const changes = db
          .channel(`db:${room.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, () => void refresh('room'))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: byRoom }, () => void refresh('players'))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_public', filter: byRoom }, () => void refresh('game'))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'game_hands', filter: byRoom }, () => void refresh('game'))
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: byRoom }, () => void refresh('messages'))
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') PARTS.forEach((p) => void refresh(p));
          });
        channels.push(changes);

        const presence = db.channel(`presence:${room.id}`, { config: { presence: { key: session.user.id } } });
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

  return state;
}
