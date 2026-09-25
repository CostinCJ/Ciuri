/**
 * End-to-end smoke test against a running dev server and the real Supabase project.
 * Four anonymous players create/join a room, sit down and play a full match (always pass / first legal card).
 * Run: npx tsx --env-file=.env.local scripts/smoke-match.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { LegalMoves } from '../lib/game';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');

interface Player {
  name: string;
  token: string;
  db: SupabaseClient;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function newPlayer(name: string): Promise<Player> {
  const db = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInAnonymously();
  if (error || !data.session) throw error ?? new Error('no session');
  return { name, token: data.session.access_token, db };
}

async function post<T>(player: Player, path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${player.token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${json.error}`);
  return json as T;
}

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`CHECK FAILED: ${message}`);
}

async function main(): Promise<void> {
  const players = await Promise.all(['Ana', 'Bogdan', 'Cristi', 'Dana'].map(newPlayer));
  const { code } = await post<{ code: string }>(players[0], '/api/rooms', { name: players[0].name });
  for (const p of players.slice(1)) await post(p, `/api/rooms/${code}/join`, { name: p.name });
  for (let seat = 0; seat < 4; seat++) await post(players[seat], `/api/rooms/${code}/seat`, { seat });
  console.log(`room ${code}: 4 seated`);

  const { data: room } = await players[0].db.from('rooms').select('id, status').eq('code', code).single();
  check(room, 'member can read the room');

  await sleep(3200);
  await post(players[0], `/api/rooms/${code}/tick`);

  for (let step = 0; step < 5000; step++) {
    const { data: current } = await players[0].db.from('rooms').select('status').eq('id', room!.id).single();
    if (current!.status === 'finished') break;

    const hands = await Promise.all(players.map((p) => p.db.from('game_hands').select('seat, moves').eq('room_id', room!.id)));
    hands.forEach((h, i) => check(h.data?.length === 1 && h.data[0].seat === i, `player ${i} sees exactly their own hand`));

    const actorIndex = hands.findIndex((h) => {
      const moves = h.data![0].moves as LegalMoves;
      return moves.bids.length > 0 || moves.cards.length > 0;
    });
    if (actorIndex === -1) {
      // round summary: wait for the deadline, then advance
      const { data: pub } = await players[0].db.from('game_public').select('deadline').eq('room_id', room!.id).single();
      if (pub?.deadline) await sleep(Math.max(0, new Date(pub.deadline).getTime() - Date.now()) + 300);
      await post(players[0], `/api/rooms/${code}/tick`);
      continue;
    }
    const moves = hands[actorIndex].data![0].moves as LegalMoves;
    const action = moves.bids.length > 0 ? { type: 'bid', bid: { kind: 'pass' } } : { type: 'play', card: moves.cards[0] };
    await post(players[actorIndex], `/api/rooms/${code}/action`, { action });
  }

  const { data: secret } = await players[1].db.from('game_secret').select('state');
  check((secret ?? []).length === 0, 'game_secret is not readable by clients');
  const { data: pub } = await players[2].db.from('game_public').select('view, log').eq('room_id', room!.id).single();
  const view = pub!.view as { phase: string; score: { A: number; B: number }; round: Record<string, unknown> };
  check(view.phase === 'matchOver', 'match finished');
  check(!('hands' in view.round), 'public view has no hands');
  console.log(`match over: A ${view.score.A} – B ${view.score.B}, ${(pub!.log as unknown[]).length} log events`);

  const { ok } = await post<{ ok: boolean }>(players[3], `/api/rooms/${code}/rematch`);
  check(ok, 'rematch started');
  await post(players[0], `/api/rooms/${code}/chat`, { text: 'gg' });
  const { data: messages } = await players[1].db.from('messages').select('name, text').eq('room_id', room!.id);
  check(messages?.some((m) => m.name === 'Ana' && m.text === 'gg'), 'chat message visible to room members');
  console.log('SMOKE TEST PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
