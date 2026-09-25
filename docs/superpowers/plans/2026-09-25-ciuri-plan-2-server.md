# Ciuri — Plan 2: Server (Supabase + API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ciuri playable online by 4 people through HTTP APIs on Next.js, with state stored in a cloud Supabase project. Players get rooms with codes, seats, an automatic start, moves, timeouts, rematches and chat. The UI comes in Plan 3.

**Architecture:**
- **Service layer.** `lib/server/service.ts` is pure orchestration over a `Store` interface: rooms, seats, actions, ticks, rematch and chat. It is unit-tested with an in-memory store and a fake clock.
- **Supabase store.** `lib/server/supabase-store.ts` implements `Store` with the service-role client. The whole game write (secret state, public view, hands, room status) happens in one Postgres transaction: the `commit_game` RPC with optimistic versioning.
- **API routes.** Thin Next.js route handlers under `app/api/rooms/...`. They authenticate the Supabase anonymous-user token, validate the body with zod and call the service.
- **Realtime.** Clients get updates from Supabase Realtime `postgres_changes`, protected by RLS. Each player can read only their own `game_hands` row, which holds their cards **and their legal moves**, computed on the server.

**Tech Stack:** Next.js 16 route handlers, `@supabase/supabase-js` v2, zod, Vitest, Supabase CLI (via `npx supabase`), tsx (for the smoke script).

**Spec:** `docs/superpowers/specs/2026-09-25-ciuri-design.md` §2–§4. Engine public API: `lib/game/index.ts` (Plan 1, done).

**Design decisions taken here (from the Plan 1 final review):**
- **Legal moves are computed on the server** and stored in each player's private `game_hands.moves`. The UI never needs the full `GameState`.
- **Clients can send only `bid`, `play` and `stop`.** The seat always comes from the server's membership record, never from the client. `nextRound` and match start happen only through `tick`, when the server checks that the deadline has passed.
- **Every client request is validated with zod before it reaches the engine.** Unknown fields are stripped.
- **An event log** (`GameEvent[]`, last 50) is computed on the server by comparing the previous and next state. It is stored with the state, and the UI journal (Plan 3) renders it.
- **Race hardening (added after the review of Tasks 1–5; the committed code supersedes the Task 2–5 listings below).** The `Store` contract in `lib/server/store.ts` is authoritative. The rules:
  - Seats freeze inside the store: `setSeat` fails once the room left the lobby.
  - The game keeps its own seat → user mapping (`users`), fixed at the start. `commitGame` with version 0 requires a lobby whose seated players are exactly `users`.
  - The chat limit is checked atomically by the store (`insertMessage` returns false), using the store's clock.
  - The start countdown changes only when "table full" changes; `tick` restores a missing one and clears a stale one (table no longer full). `setStartAt` is a no-op outside the lobby.
  - A lost commit race is a boolean, not an exception: `act` answers 409, `tick` answers `false`.
  - Once a match started, only seated players may rejoin.
  - Tasks 6–7 below implement the same contracts in SQL (`set_seat`, `commit_game(p_users)`, `send_message`).

**Next.js 16 note:** this repo's `AGENTS.md` says Next 16 differs from older versions. Before writing route handlers, read `node_modules/next/dist/docs/` for "route handlers" (dynamic `params` is a `Promise`).

## File structure

| File | Responsibility |
|---|---|
| `lib/env.ts` | Read and check environment variables |
| `lib/server/errors.ts` | `HttpError` (status + Romanian message) |
| `lib/server/codes.ts` | Room code generation and normalisation |
| `lib/server/deadlines.ts` | Per-phase timeouts → deadline |
| `lib/server/schemas.ts` | zod schemas for request bodies |
| `lib/server/events.ts` | `GameEvent` type, `describeTransition`, `appendLog` |
| `lib/server/store.ts` | `Store` interface + record types |
| `lib/server/memory-store.ts` | In-memory `Store` used by tests |
| `lib/server/service.ts` | Room/game orchestration (createRoom, joinRoom, takeSeat, act, tick, rematch, sendMessage) |
| `lib/server/random.ts` | Crypto-backed RNG |
| `lib/server/supabase-admin.ts` | Service-role client + production `ServiceDeps` |
| `lib/server/supabase-store.ts` | Supabase `Store` implementation |
| `lib/server/auth.ts` | Bearer token → user id |
| `lib/server/http.ts` | `handle()` error → JSON response mapping, `readJson()` |
| `app/api/rooms/route.ts` and `app/api/rooms/[code]/{join,seat,action,tick,rematch,chat}/route.ts` | HTTP endpoints |
| `lib/client/supabase.ts` | Browser Supabase client + anonymous session |
| `lib/client/api.ts` | Typed fetch wrapper for the endpoints |
| `supabase/migrations/20260925000000_init.sql` | Tables, RLS, realtime publication, `commit_game` |
| `scripts/smoke-match.ts` | End-to-end check: 4 anonymous players play a full match against the dev server |
| `lib/server/__tests__/*.test.ts` | Tests |

## HTTP API (all `POST`, JSON, header `Authorization: Bearer <supabase access token>`)

| Path | Body | Response |
|---|---|---|
| `/api/rooms` | `{ name }` | `{ code }` |
| `/api/rooms/[code]/join` | `{ name }` | `{ code }` |
| `/api/rooms/[code]/seat` | `{ seat: 0-3 \| null }` | `{ ok: true }` |
| `/api/rooms/[code]/action` | `{ action: {type:'bid',bid} \| {type:'play',card,declare?} \| {type:'stop'} }` | `{ ok: true }` |
| `/api/rooms/[code]/tick` | `{}` | `{ changed: boolean }` |
| `/api/rooms/[code]/rematch` | `{}` | `{ ok: boolean }` |
| `/api/rooms/[code]/chat` | `{ text }` | `{ ok: true }` |

Errors come back as `{ error: "<mesaj în română>" }` with status 400, 401, 403, 404, 409, 429 or 500.

---

### Task 1: Dependencies, env and test alias

**Files:**
- Modify: `package.json` (via npm), `vitest.config.mts`
- Create: `lib/env.ts`, `.env.example`

- [ ] **Step 1: Install dependencies**

```bash
npm install @supabase/supabase-js zod
npm install -D tsx
```

- [ ] **Step 2: Make Vitest understand the `@/` import alias.** Replace `vitest.config.mts` with:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Create `lib/env.ts`**

```ts
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Lipsește variabila de mediu ${name} (vezi .env.example)`);
  return value;
}

/** Safe to use in the browser. Literal `process.env.NEXT_PUBLIC_*` access so Next.js inlines the values. */
export function publicEnv() {
  return {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

/** Server only: includes the service-role key. */
export function serverEnv() {
  return {
    ...publicEnv(),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Supabase → Project Settings → API (legacy "anon"/"service_role" keys, or the newer publishable/secret keys)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-or-secret-key
```

Check that `.gitignore` ignores `.env*.local` (create-next-app adds `.env*`). If `.env*` would also ignore `.env.example`, add the line `!.env.example`.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass (94 engine tests).

```bash
git add -A
git commit -m "chore: add Supabase, zod and env configuration"
```

---

### Task 2: Pure server helpers — codes, deadlines, schemas, errors

**Files:**
- Create: `lib/server/errors.ts`, `lib/server/codes.ts`, `lib/server/deadlines.ts`, `lib/server/schemas.ts`
- Test: `lib/server/__tests__/helpers.test.ts`

- [ ] **Step 1: Write the failing test `lib/server/__tests__/helpers.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createMatch } from '@/lib/game';
import { mulberry32 } from '@/lib/game/__tests__/helpers';
import { CODE_ALPHABET, generateRoomCode, normalizeRoomCode } from '../codes';
import { BID_SECONDS, PLAY_SECONDS, SUMMARY_SECONDS, deadlineFor } from '../deadlines';
import { actionBodySchema, messageBodySchema, nameBodySchema, seatBodySchema } from '../schemas';

describe('room codes', () => {
  it('generates 4 characters from an alphabet without look-alikes', () => {
    const code = generateRoomCode(mulberry32(3));
    expect(code).toHaveLength(4);
    expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    expect(CODE_ALPHABET).not.toMatch(/[01IOL]/);
  });

  it('normalises user input', () => {
    expect(normalizeRoomCode(' k7xq ')).toBe('K7XQ');
    expect(normalizeRoomCode('K7X')).toBeNull();
    expect(normalizeRoomCode('K7X0')).toBeNull();
  });
});

describe('deadlines', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);

  it('uses 20s for bidding, 30s for play, 5s for the round summary, none after the match', () => {
    const s = createMatch(mulberry32(1), 0);
    expect(deadlineFor(s, now)).toEqual(at(BID_SECONDS));
    expect(deadlineFor({ ...s, phase: 'playing' }, now)).toEqual(at(PLAY_SECONDS));
    expect(deadlineFor({ ...s, phase: 'roundOver' }, now)).toEqual(at(SUMMARY_SECONDS));
    expect(deadlineFor({ ...s, phase: 'matchOver' }, now)).toBeNull();
  });
});

describe('request schemas', () => {
  it('accepts player actions and strips unknown fields', () => {
    const parsed = actionBodySchema.parse({
      action: { type: 'play', card: { suit: 'verde', rank: 11, hack: 1 }, declare: true, seat: 3 },
    });
    expect(parsed).toEqual({ action: { type: 'play', card: { suit: 'verde', rank: 11 }, declare: true } });
    expect(actionBodySchema.parse({ action: { type: 'bid', bid: { kind: 'tromf', suit: 'duba' } } }))
      .toEqual({ action: { type: 'bid', bid: { kind: 'tromf', suit: 'duba' } } });
    expect(actionBodySchema.parse({ action: { type: 'stop' } })).toEqual({ action: { type: 'stop' } });
  });

  it('rejects system actions and invalid cards', () => {
    expect(actionBodySchema.safeParse({ action: { type: 'nextRound' } }).success).toBe(false);
    expect(actionBodySchema.safeParse({ action: { type: 'play', card: { suit: 'verde', rank: 7 } } }).success).toBe(false);
    expect(actionBodySchema.safeParse({ action: { type: 'play', card: { suit: 'inima', rank: 2 } } }).success).toBe(false);
    expect(actionBodySchema.safeParse({ action: { type: 'bid', bid: { kind: 'tromf' } } }).success).toBe(false);
  });

  it('validates names, seats and chat messages', () => {
    expect(nameBodySchema.parse({ name: '  Ana ' })).toEqual({ name: 'Ana' });
    expect(nameBodySchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(nameBodySchema.safeParse({ name: 'x'.repeat(21) }).success).toBe(false);
    expect(seatBodySchema.parse({ seat: 2 })).toEqual({ seat: 2 });
    expect(seatBodySchema.parse({ seat: null })).toEqual({ seat: null });
    expect(seatBodySchema.safeParse({ seat: 4 }).success).toBe(false);
    expect(messageBodySchema.parse({ text: ' salut ' })).toEqual({ text: 'salut' });
    expect(messageBodySchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(messageBodySchema.safeParse({ text: 'x'.repeat(301) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/server/__tests__/helpers.test.ts`
Expected: FAIL — cannot resolve `../codes`.

- [ ] **Step 3: Create `lib/server/errors.ts`**

```ts
/** An error that maps directly to an HTTP response (message is shown to players, in Romanian). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
```

- [ ] **Step 4: Create `lib/server/codes.ts`**

```ts
/** No 0/O, 1/I/L to avoid confusion when codes are read aloud or typed. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export function generateRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}
```

- [ ] **Step 5: Create `lib/server/deadlines.ts`**

```ts
import type { GameState } from '@/lib/game';

export const BID_SECONDS = 20;
export const PLAY_SECONDS = 30;
export const SUMMARY_SECONDS = 5;
export const START_COUNTDOWN_SECONDS = 3;

/** When the automatic move (timeoutAction) may be applied, or null when nothing is pending. */
export function deadlineFor(state: GameState, now: Date): Date | null {
  const seconds =
    state.phase === 'bidding' ? BID_SECONDS
    : state.phase === 'playing' ? PLAY_SECONDS
    : state.phase === 'roundOver' ? SUMMARY_SECONDS
    : null;
  return seconds === null ? null : new Date(now.getTime() + seconds * 1000);
}
```

- [ ] **Step 6: Create `lib/server/schemas.ts`**

```ts
import { z } from 'zod';
import { RANKS, SUITS, type Rank, type Seat } from '@/lib/game';

const suit = z.enum(SUITS);
const rank = z.custom<Rank>((v) => typeof v === 'number' && (RANKS as readonly number[]).includes(v), 'Carte invalidă');
const seat = z.custom<Seat>((v) => v === 0 || v === 1 || v === 2 || v === 3, 'Loc invalid');

const card = z.object({ suit, rank });

const bid = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pass') }),
  z.object({ kind: z.literal('ciuri') }),
  z.object({ kind: z.literal('adunare') }),
  z.object({ kind: z.literal('mare') }),
  z.object({ kind: z.literal('mica') }),
  z.object({ kind: z.literal('tromf'), suit }),
]);

/** Actions a player may send. The seat is never taken from the client. */
export const playerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bid'), bid }),
  z.object({ type: z.literal('play'), card, declare: z.boolean().optional() }),
  z.object({ type: z.literal('stop') }),
]);
export type PlayerActionInput = z.infer<typeof playerActionSchema>;

export const nameBodySchema = z.object({
  name: z.string().trim().min(2, 'Numele trebuie să aibă 2–20 caractere').max(20, 'Numele trebuie să aibă 2–20 caractere'),
});
export const seatBodySchema = z.object({ seat: seat.nullable() });
export const actionBodySchema = z.object({ action: playerActionSchema });
export const messageBodySchema = z.object({
  text: z.string().trim().min(1, 'Mesajul e gol').max(300, 'Mesajul poate avea cel mult 300 de caractere'),
});
```

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run lib/server/__tests__/helpers.test.ts`
Expected: PASS (6 tests). If a zod API detail differs in the installed zod major version (check `npm ls zod`), adapt the schema code and keep the tests unchanged.

- [ ] **Step 8: Commit**

```bash
git add lib/server
git commit -m "feat: add room codes, deadlines and request schemas"
```

---

### Task 3: Event log

**Files:**
- Create: `lib/server/events.ts`
- Test: `lib/server/__tests__/events.test.ts`

- [ ] **Step 1: Write the failing test `lib/server/__tests__/events.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { applyAction, type Action, type GameState } from '@/lib/game';
import { c, passAll, stateWith } from '@/lib/game/__tests__/helpers';
import { LOG_LIMIT, appendLog, describeTransition, type GameEvent } from '../events';

// Dealer 0, trump verde (dealer's last card). Seat 1 holds the verde and ghinda marriages.
const FIRST = {
  1: [c('verde', 3), c('verde', 4), c('rosu', 2)],
  2: [c('ghinda', 11), c('rosu', 10), c('duba', 2)],
  3: [c('verde', 11), c('rosu', 3), c('duba', 3)],
  0: [c('rosu', 4), c('duba', 4), c('ghinda', 2)],
};
const SECOND = {
  1: [c('ghinda', 3), c('ghinda', 4)],
  2: [c('duba', 10), c('duba', 11)],
  3: [c('verde', 10), c('ghinda', 10)],
  0: [c('rosu', 11), c('verde', 2)],
};

function step(state: GameState, action: Action, automatic = false) {
  const next = applyAction(state, action);
  return { next, events: describeTransition(state, next, action, automatic) };
}

describe('describeTransition', () => {
  it('logs a bid, prefixed by a timeout marker when automatic', () => {
    const { events } = step(stateWith(0, FIRST, SECOND), { type: 'bid', seat: 1, bid: { kind: 'pass' } }, true);
    expect(events).toEqual([
      { type: 'timeout', seat: 1 },
      { type: 'bid', seat: 1, bid: { kind: 'pass' } },
    ]);
  });

  it('logs declarations, completed tricks and the round end', () => {
    let s = passAll(stateWith(0, FIRST, SECOND));
    let r = step(s, { type: 'play', seat: 1, card: c('verde', 3), declare: true });
    expect(r.events).toEqual([{ type: 'declare', seat: 1, suit: 'verde', points: 40 }]);
    s = r.next;
    s = applyAction(s, { type: 'play', seat: 2, card: c('ghinda', 11) });
    s = applyAction(s, { type: 'play', seat: 3, card: c('verde', 11) });
    r = step(s, { type: 'play', seat: 0, card: c('verde', 2) });
    expect(r.events).toEqual([{ type: 'trick', winner: 3, points: 27 }]);
    r = step(r.next, { type: 'stop', seat: 3 });
    expect(r.events).toEqual([{ type: 'roundEnd', result: r.next.round.result }]);
  });

  it('logs a new round without a timeout marker', () => {
    let s = passAll(stateWith(0, FIRST, SECOND));
    s = applyAction(s, { type: 'play', seat: 1, card: c('verde', 3), declare: true });
    s = applyAction(s, { type: 'play', seat: 2, card: c('ghinda', 11) });
    s = applyAction(s, { type: 'play', seat: 3, card: c('verde', 11) });
    s = applyAction(s, { type: 'play', seat: 0, card: c('verde', 2) });
    s = applyAction(s, { type: 'stop', seat: 3 });
    const { next, events } = step(s, { type: 'nextRound' }, true);
    expect(events).toEqual([{ type: 'newRound', dealer: next.round.dealer, roundNumber: 2 }]);
  });
});

describe('appendLog', () => {
  it(`keeps only the last ${LOG_LIMIT} events`, () => {
    const many: GameEvent[] = Array.from({ length: LOG_LIMIT + 5 }, (_, i) => ({ type: 'newRound', dealer: 0, roundNumber: i }));
    const log = appendLog([], many);
    expect(log).toHaveLength(LOG_LIMIT);
    expect(log[0]).toEqual({ type: 'newRound', dealer: 0, roundNumber: 5 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/server/__tests__/events.test.ts`
Expected: FAIL — cannot resolve `../events`.

- [ ] **Step 3: Create `lib/server/events.ts`**

```ts
import { sumPoints, type Action, type Bid, type GameState, type RoundResult, type Seat, type Suit } from '@/lib/game';

export type GameEvent =
  | { type: 'matchStart'; dealer: Seat }
  | { type: 'timeout'; seat: Seat }
  | { type: 'bid'; seat: Seat; bid: Bid }
  | { type: 'declare'; seat: Seat; suit: Suit; points: number }
  | { type: 'trick'; winner: Seat | null; points: number }
  | { type: 'roundEnd'; result: RoundResult }
  | { type: 'newRound'; dealer: Seat; roundNumber: number };

export const LOG_LIMIT = 50;

/** Events caused by `action` turning `prev` into `next`. `automatic` marks moves made by the timeout. */
export function describeTransition(prev: GameState, next: GameState, action: Action, automatic: boolean): GameEvent[] {
  if (action.type === 'nextRound') {
    return [{ type: 'newRound', dealer: next.round.dealer, roundNumber: next.roundNumber }];
  }
  const events: GameEvent[] = [];
  if (automatic) events.push({ type: 'timeout', seat: action.seat });

  const before = prev.round;
  const after = next.round;
  if (action.type === 'bid') events.push({ type: 'bid', seat: action.seat, bid: after.bids[after.bids.length - 1].bid });
  for (const d of after.declared.slice(before.declared.length)) events.push({ type: 'declare', ...d });
  if (after.tricksPlayed > before.tricksPlayed && after.lastTrick) {
    const followOnly = after.mode === 'mare' || after.mode === 'mica';
    events.push({
      type: 'trick',
      winner: followOnly ? null : after.lastTrickWinner,
      points: sumPoints(after.lastTrick.map((p) => p.card)),
    });
  }
  if (after.result && !before.result) events.push({ type: 'roundEnd', result: after.result });
  return events;
}

export function appendLog(log: GameEvent[], events: GameEvent[]): GameEvent[] {
  return [...log, ...events].slice(-LOG_LIMIT);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/server/__tests__/events.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/server
git commit -m "feat: add game event log"
```

---

### Task 4: Store interface and in-memory store

**Files:**
- Create: `lib/server/store.ts`, `lib/server/memory-store.ts`
- Test: `lib/server/__tests__/memory-store.test.ts`

- [ ] **Step 1: Create `lib/server/store.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test `lib/server/__tests__/memory-store.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createMatch, legalMoves, publicView, type Seat } from '@/lib/game';
import { mulberry32 } from '@/lib/game/__tests__/helpers';
import { MemoryStore } from '../memory-store';
import type { GameWrite } from '../store';

function write(): GameWrite {
  const state = createMatch(mulberry32(1), 0);
  return {
    state,
    view: publicView(state),
    log: [],
    deadline: null,
    hands: ([0, 1, 2, 3] as Seat[]).map((seat) => ({ seat, userId: `u${seat}`, cards: state.round.hands[seat], moves: legalMoves(state, seat) })),
    roomStatus: 'playing',
  };
}

describe('MemoryStore', () => {
  it('rejects duplicate room codes and taken seats', async () => {
    const store = new MemoryStore();
    const room = (await store.insertRoom('ABCD', 'u0'))!;
    expect(await store.insertRoom('ABCD', 'u1')).toBeNull();
    await store.upsertPlayer(room.id, 'u0', 'Ana');
    await store.upsertPlayer(room.id, 'u1', 'Bogdan');
    expect(await store.setSeat(room.id, 'u0', 2)).toBe(true);
    expect(await store.setSeat(room.id, 'u1', 2)).toBe(false);
    expect(await store.setSeat(room.id, 'nobody', 1)).toBe(false);
  });

  it('commits games with optimistic versioning', async () => {
    const store = new MemoryStore();
    const room = (await store.insertRoom('ABCD', 'u0'))!;
    await store.setStartAt(room.id, '2026-01-01T00:00:03Z');
    expect(await store.commitGame(room.id, 1, write())).toBe(false);
    expect(await store.commitGame(room.id, 0, write())).toBe(true);
    expect(await store.commitGame(room.id, 0, write())).toBe(false);
    expect((await store.loadGame(room.id))?.version).toBe(1);
    expect(await store.findRoom('ABCD')).toMatchObject({ status: 'playing', startAt: null });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/server/__tests__/memory-store.test.ts`
Expected: FAIL — cannot resolve `../memory-store`.

- [ ] **Step 4: Create `lib/server/memory-store.ts`**

```ts
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
  private nextId = 1;

  constructor(private readonly now: () => Date = () => new Date()) {}

  // createdBy is only persisted by the Supabase store; TS allows implementing with fewer parameters.
  async insertRoom(code: string): Promise<RoomRecord | null> {
    if ([...this.rooms.values()].some((r) => r.code === code)) return null;
    const room: RoomRecord = { id: `room-${this.nextId++}`, code, status: 'lobby', startAt: null };
    this.rooms.set(room.id, room);
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run lib/server/__tests__/memory-store.test.ts && npm run lint`
Expected: PASS (2 tests), lint clean.

- [ ] **Step 6: Commit**

```bash
git add lib/server
git commit -m "feat: add store interface and in-memory store"
```

---

### Task 5: Game service

Spec §2.2 (lobby, seats, auto-start after 3 s, full room), §2.4 (chat limit 1/s), §2.5 (timeouts), §3.3 (action flow), §3.4 (tick), §1.12 (rematch).

**Files:**
- Create: `lib/server/service.ts`
- Test: `lib/server/__tests__/service.test.ts`

- [ ] **Step 1: Write the failing test `lib/server/__tests__/service.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Seat } from '@/lib/game';
import { mulberry32 } from '@/lib/game/__tests__/helpers';
import { MemoryStore } from '../memory-store';
import {
  act, createRoom, joinRoom, rematch, sendMessage, takeSeat, tick, type ServiceDeps,
} from '../service';

const USERS = ['u0', 'u1', 'u2', 'u3'];
const NAMES = ['Ana', 'Bogdan', 'Cristi', 'Dana'];

function setup() {
  let time = new Date('2026-01-01T12:00:00Z').getTime();
  const now = () => new Date(time);
  const store = new MemoryStore(now);
  const deps: ServiceDeps = { store, now, rng: mulberry32(42) };
  return { store, deps, now, advance: (ms: number) => { time += ms; } };
}
type Ctx = ReturnType<typeof setup>;

const roomOf = (ctx: Ctx, code: string) => [...ctx.store.rooms.values()].find((r) => r.code === code)!;
const gameOf = (ctx: Ctx, code: string) => ctx.store.games.get(roomOf(ctx, code).id)!;

async function seatedTable(ctx: Ctx): Promise<string> {
  const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
  for (let i = 1; i < 4; i++) await joinRoom(ctx.deps, code, USERS[i], NAMES[i]);
  for (let i = 0; i < 4; i++) await takeSeat(ctx.deps, code, USERS[i], i as Seat);
  return code;
}

async function startedTable(ctx: Ctx): Promise<string> {
  const code = await seatedTable(ctx);
  ctx.advance(3000);
  expect(await tick(ctx.deps, code, USERS[0])).toBe(true);
  return code;
}

describe('rooms and seats', () => {
  it('creates a room with a 4-character code; the creator joins without a seat', async () => {
    const ctx = setup();
    const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/);
    const room = roomOf(ctx, code);
    expect(room.status).toBe('lobby');
    expect(ctx.store.players.get(room.id)).toEqual([{ userId: 'u0', name: 'Ana', seat: null }]);
  });

  it('joins by code case-insensitively and rejects unknown codes', async () => {
    const ctx = setup();
    const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
    expect(await joinRoom(ctx.deps, code.toLowerCase(), USERS[1], NAMES[1])).toBe(code);
    await expect(joinRoom(ctx.deps, 'ZZZZ', USERS[2], NAMES[2])).rejects.toMatchObject({ status: 404 });
  });

  it('rejects taken seats and non-members', async () => {
    const ctx = setup();
    const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
    await joinRoom(ctx.deps, code, USERS[1], NAMES[1]);
    await takeSeat(ctx.deps, code, USERS[0], 0);
    await expect(takeSeat(ctx.deps, code, USERS[1], 0)).rejects.toMatchObject({ status: 409, message: 'Locul e ocupat' });
    await expect(takeSeat(ctx.deps, code, 'stranger', 1)).rejects.toMatchObject({ status: 403 });
  });

  it('starts a 3-second countdown when all 4 seats are taken and cancels it when someone stands up', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx);
    expect(roomOf(ctx, code).startAt).toBe(new Date(ctx.now().getTime() + 3000).toISOString());
    await takeSeat(ctx.deps, code, USERS[3], null);
    expect(roomOf(ctx, code).startAt).toBeNull();
  });

  it('a full room only lets existing members back in', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx);
    await expect(joinRoom(ctx.deps, code, 'u9', 'Nou')).rejects.toMatchObject({ status: 409, message: 'Camera e plină' });
    expect(await joinRoom(ctx.deps, code, USERS[2], NAMES[2])).toBe(code);
  });
});

describe('match start and actions', () => {
  it('tick starts the match only after the countdown', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(false);
    ctx.advance(3000);
    expect(await tick(ctx.deps, code, USERS[1])).toBe(true);
    const room = roomOf(ctx, code);
    expect(room.status).toBe('playing');
    const game = gameOf(ctx, code);
    expect(game.version).toBe(1);
    expect(game.state.phase).toBe('bidding');
    expect(game.log).toEqual([{ type: 'matchStart', dealer: game.state.round.dealer }]);
    expect(game.deadline).toBe(new Date(ctx.now().getTime() + 20_000).toISOString());
    const hands = ctx.store.hands.get(room.id)!;
    expect(hands.map((h) => [h.seat, h.userId, h.cards.length])).toEqual([[0, 'u0', 3], [1, 'u1', 3], [2, 'u2', 3], [3, 'u3', 3]]);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(false);
  });

  it('seats are frozen once the game started', async () => {
    const ctx = setup();
    const code = await startedTable(ctx);
    await expect(takeSeat(ctx.deps, code, USERS[0], null)).rejects.toMatchObject({ status: 409 });
  });

  it('applies a player action with the seat taken from membership', async () => {
    const ctx = setup();
    const code = await startedTable(ctx);
    const turn = gameOf(ctx, code).state.round.turn;
    const other = USERS[(turn + 1) % 4];
    await expect(act(ctx.deps, code, other, { type: 'bid', bid: { kind: 'pass' } }))
      .rejects.toMatchObject({ status: 400, message: 'Nu e rândul tău' });
    await act(ctx.deps, code, USERS[turn], { type: 'bid', bid: { kind: 'pass' } });
    const game = gameOf(ctx, code);
    expect(game.version).toBe(2);
    expect(game.log.at(-1)).toEqual({ type: 'bid', seat: turn, bid: { kind: 'pass' } });
    const hands = ctx.store.hands.get(roomOf(ctx, code).id)!;
    const withMoves = hands.filter((h) => h.moves.bids.length > 0).map((h) => h.seat);
    expect(withMoves).toEqual([game.state.round.turn]);
  });

  it('maps engine errors to 400 and non-members to 403', async () => {
    const ctx = setup();
    const code = await startedTable(ctx);
    const turn = gameOf(ctx, code).state.round.turn;
    const card = gameOf(ctx, code).state.round.hands[turn][0];
    await expect(act(ctx.deps, code, USERS[turn], { type: 'play', card }))
      .rejects.toMatchObject({ status: 400, message: 'Acțiunea nu e permisă acum' });
    await expect(act(ctx.deps, code, 'stranger', { type: 'stop' })).rejects.toMatchObject({ status: 403 });
  });

  it('tick applies the automatic move only after the deadline', async () => {
    const ctx = setup();
    const code = await startedTable(ctx);
    const turn = gameOf(ctx, code).state.round.turn;
    ctx.advance(19_000);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(false);
    ctx.advance(1_001);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(true);
    expect(gameOf(ctx, code).log.slice(-2)).toEqual([
      { type: 'timeout', seat: turn },
      { type: 'bid', seat: turn, bid: { kind: 'pass' } },
    ]);
  });
});

describe('full match and rematch', () => {
  it('a match driven only by timeouts finishes, then rematch starts a fresh one', async () => {
    const ctx = setup();
    const code = await startedTable(ctx);
    for (let i = 0; roomOf(ctx, code).status !== 'finished'; i++) {
      expect(i).toBeLessThan(5000);
      ctx.advance(31_000);
      await tick(ctx.deps, code, USERS[0]);
    }
    const finished = gameOf(ctx, code);
    expect(finished.state.phase).toBe('matchOver');
    expect(finished.deadline).toBeNull();
    expect(Math.max(finished.state.score.A, finished.state.score.B)).toBeGreaterThanOrEqual(21);

    await expect(act(ctx.deps, code, USERS[0], { type: 'stop' })).rejects.toMatchObject({ status: 409 });
    expect(await rematch(ctx.deps, code, USERS[1])).toBe(true);
    const fresh = gameOf(ctx, code);
    expect(roomOf(ctx, code).status).toBe('playing');
    expect(fresh.version).toBe(finished.version + 1);
    expect(fresh.state.score).toEqual({ A: 0, B: 0 });
    await expect(rematch(ctx.deps, code, USERS[2])).rejects.toMatchObject({ status: 409 });
  });
});

describe('chat', () => {
  it('stores messages with the sender name and limits to one per second', async () => {
    const ctx = setup();
    const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
    await sendMessage(ctx.deps, code, USERS[0], 'salut');
    await expect(sendMessage(ctx.deps, code, USERS[0], 'iar')).rejects.toMatchObject({ status: 429 });
    ctx.advance(1000);
    await sendMessage(ctx.deps, code, USERS[0], 'iar');
    expect(ctx.store.messages.map((m) => [m.name, m.text])).toEqual([['Ana', 'salut'], ['Ana', 'iar']]);
    await expect(sendMessage(ctx.deps, code, 'stranger', 'hei')).rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/server/__tests__/service.test.ts`
Expected: FAIL — cannot resolve `../service`.

- [ ] **Step 3: Create `lib/server/service.ts`**

```ts
import {
  IllegalActionError, applyAction, createMatch, legalMoves, publicView, timeoutAction,
  type Action, type GameState, type Seat,
} from '@/lib/game';
import { generateRoomCode, normalizeRoomCode } from './codes';
import { START_COUNTDOWN_SECONDS, deadlineFor } from './deadlines';
import { appendLog, describeTransition, type GameEvent } from './events';
import { HttpError } from './errors';
import type { PlayerActionInput } from './schemas';
import type { GameRecord, GameWrite, PlayerRecord, RoomRecord, Store } from './store';

export interface ServiceDeps {
  store: Store;
  now: () => Date;
  rng: () => number;
}

const SEATS: Seat[] = [0, 1, 2, 3];
const MESSAGE_INTERVAL_MS = 1000;
const ROOM_CODE_ATTEMPTS = 10;

async function requireRoom(store: Store, code: string): Promise<RoomRecord> {
  const normalized = normalizeRoomCode(code);
  const room = normalized ? await store.findRoom(normalized) : null;
  if (!room) throw new HttpError(404, 'Camera nu există');
  return room;
}

function requireMember(players: PlayerRecord[], userId: string): PlayerRecord {
  const player = players.find((p) => p.userId === userId);
  if (!player) throw new HttpError(403, 'Nu ești în această cameră');
  return player;
}

/** User ids indexed by seat, or null when not all 4 seats are taken. */
function seatUsers(players: PlayerRecord[]): string[] | null {
  const bySeat: string[] = [];
  for (const p of players) if (p.seat !== null) bySeat[p.seat] = p.userId;
  return SEATS.every((seat) => bySeat[seat] !== undefined) ? bySeat : null;
}

export function buildWrite(state: GameState, log: GameEvent[], users: string[], now: Date): GameWrite {
  return {
    state,
    view: publicView(state),
    log,
    deadline: deadlineFor(state, now)?.toISOString() ?? null,
    hands: SEATS.map((seat) => ({
      seat,
      userId: users[seat],
      cards: state.round.hands[seat],
      moves: legalMoves(state, seat),
    })),
    roomStatus: state.phase === 'matchOver' ? 'finished' : 'playing',
  };
}

export async function createRoom(deps: ServiceDeps, userId: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt++) {
    const room = await deps.store.insertRoom(generateRoomCode(deps.rng), userId);
    if (room) {
      await deps.store.upsertPlayer(room.id, userId, name);
      return room.code;
    }
  }
  throw new HttpError(503, 'Nu am putut crea camera, încearcă din nou');
}

export async function joinRoom(deps: ServiceDeps, code: string, userId: string, name: string): Promise<string> {
  const room = await requireRoom(deps.store, code);
  const players = await deps.store.listPlayers(room.id);
  const isMember = players.some((p) => p.userId === userId);
  if (!isMember && (room.status !== 'lobby' || seatUsers(players) !== null)) {
    throw new HttpError(409, 'Camera e plină');
  }
  await deps.store.upsertPlayer(room.id, userId, name);
  return room.code;
}

export async function takeSeat(deps: ServiceDeps, code: string, userId: string, seat: Seat | null): Promise<void> {
  const room = await requireRoom(deps.store, code);
  requireMember(await deps.store.listPlayers(room.id), userId);
  if (room.status !== 'lobby') throw new HttpError(409, 'Jocul a început deja');
  if (!(await deps.store.setSeat(room.id, userId, seat))) throw new HttpError(409, 'Locul e ocupat');
  const full = seatUsers(await deps.store.listPlayers(room.id)) !== null;
  const startAt = full ? new Date(deps.now().getTime() + START_COUNTDOWN_SECONDS * 1000).toISOString() : null;
  await deps.store.setStartAt(room.id, startAt);
}

async function commitAction(deps: ServiceDeps, roomId: string, game: GameRecord, action: Action, automatic: boolean): Promise<void> {
  let next: GameState;
  try {
    next = applyAction(game.state, action, deps.rng);
  } catch (error) {
    if (error instanceof IllegalActionError) throw new HttpError(400, error.message);
    throw error;
  }
  const users = seatUsers(await deps.store.listPlayers(roomId));
  if (!users) throw new HttpError(409, 'Masa nu e completă');
  const log = appendLog(game.log, describeTransition(game.state, next, action, automatic));
  const committed = await deps.store.commitGame(roomId, game.version, buildWrite(next, log, users, deps.now()));
  if (!committed) throw new HttpError(409, 'Starea jocului s-a schimbat, reîncearcă');
}

async function startMatch(deps: ServiceDeps, roomId: string, users: string[], expectedVersion: number): Promise<boolean> {
  const state = createMatch(deps.rng);
  const log: GameEvent[] = [{ type: 'matchStart', dealer: state.round.dealer }];
  return deps.store.commitGame(roomId, expectedVersion, buildWrite(state, log, users, deps.now()));
}

export async function act(deps: ServiceDeps, code: string, userId: string, input: PlayerActionInput): Promise<void> {
  const room = await requireRoom(deps.store, code);
  const player = requireMember(await deps.store.listPlayers(room.id), userId);
  const game = room.status === 'playing' ? await deps.store.loadGame(room.id) : null;
  if (!game || player.seat === null) throw new HttpError(409, 'Jocul nu e în desfășurare');
  const action = { ...input, seat: player.seat } as Action;
  await commitAction(deps, room.id, game, action, false);
}

/**
 * Advances time-based transitions: starts the match after the lobby countdown, or applies
 * the automatic move once the current deadline has passed. Safe to call by every client.
 */
export async function tick(deps: ServiceDeps, code: string, userId: string): Promise<boolean> {
  const room = await requireRoom(deps.store, code);
  const players = await deps.store.listPlayers(room.id);
  requireMember(players, userId);
  const now = deps.now();

  if (room.status === 'lobby') {
    const users = seatUsers(players);
    if (!users || !room.startAt || new Date(room.startAt) > now) return false;
    const existing = await deps.store.loadGame(room.id);
    return startMatch(deps, room.id, users, existing?.version ?? 0);
  }
  if (room.status !== 'playing') return false;

  const game = await deps.store.loadGame(room.id);
  if (!game?.deadline || new Date(game.deadline) > now) return false;
  const action = timeoutAction(game.state);
  if (!action) return false;
  try {
    await commitAction(deps, room.id, game, action, true);
    return true;
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) return false; // another client was faster
    throw error;
  }
}

export async function rematch(deps: ServiceDeps, code: string, userId: string): Promise<boolean> {
  const room = await requireRoom(deps.store, code);
  const players = await deps.store.listPlayers(room.id);
  const player = requireMember(players, userId);
  const users = seatUsers(players);
  const game = await deps.store.loadGame(room.id);
  if (room.status !== 'finished' || player.seat === null || !users || !game) {
    throw new HttpError(409, 'Meciul nu s-a terminat');
  }
  return startMatch(deps, room.id, users, game.version);
}

export async function sendMessage(deps: ServiceDeps, code: string, userId: string, text: string): Promise<void> {
  const room = await requireRoom(deps.store, code);
  const player = requireMember(await deps.store.listPlayers(room.id), userId);
  const last = await deps.store.lastMessageAt(room.id, userId);
  if (last && deps.now().getTime() - new Date(last).getTime() < MESSAGE_INTERVAL_MS) {
    throw new HttpError(429, 'Prea multe mesaje, așteaptă o secundă');
  }
  await deps.store.insertMessage(room.id, userId, player.name, text);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/server/__tests__/service.test.ts`
Expected: PASS (12 tests). If the full-match test fails, investigate the engine or service (it must never get stuck). Do not raise the 5000-iteration limit without understanding why.

- [ ] **Step 5: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add lib/server
git commit -m "feat: add room and game service"
```

---

### Task 6: Database migration

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/20260925000000_init.sql`

- [ ] **Step 1: Initialise the Supabase folder**

```bash
npx supabase init
```
Expected: `supabase/config.toml` is created. If it asks about IDE settings, answer no. Commit the generated `.gitignore` inside `supabase/` if one is created.

- [ ] **Step 2: Create `supabase/migrations/20260925000000_init.sql`**

```sql
-- Ciuri: rooms, players, game state, hands, chat. All writes go through the service role.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  start_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 2 and 20),
  seat smallint check (seat between 0 and 3),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

-- Full engine state: never readable by clients.
-- users: user ids indexed by seat, fixed when the match starts (the game never reads live seats).
create table public.game_secret (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version integer not null,
  state jsonb not null,
  log jsonb not null default '[]'::jsonb,
  deadline timestamptz,
  users jsonb not null
);

-- What every player in the room may see.
create table public.game_public (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version integer not null,
  view jsonb not null,
  log jsonb not null default '[]'::jsonb,
  deadline timestamptz
);

-- One row per seat: that player's cards and legal moves; readable only by its owner.
create table public.game_hands (
  room_id uuid not null references public.rooms (id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  user_id uuid not null,
  cards jsonb not null,
  moves jsonb not null,
  primary key (room_id, seat)
);

create table public.messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  name text not null,
  text text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now()
);
create index messages_room_created_idx on public.messages (room_id, created_at);
create index messages_room_user_idx on public.messages (room_id, user_id, created_at desc);

create function public.is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players where room_id = p_room and user_id = auth.uid()
  );
$$;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_secret enable row level security;
alter table public.game_public enable row level security;
alter table public.game_hands enable row level security;
alter table public.messages enable row level security;

create policy "members read room" on public.rooms
  for select to authenticated using (public.is_room_member(id));
create policy "members read players" on public.room_players
  for select to authenticated using (public.is_room_member(room_id));
create policy "members read public game" on public.game_public
  for select to authenticated using (public.is_room_member(room_id));
create policy "owner reads hand" on public.game_hands
  for select to authenticated using (user_id = auth.uid());
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_room_member(room_id));
-- game_secret: no policies → no client access. No insert/update/delete policies anywhere.

-- Seats a player (p_seat null = stand up). Store.setSeat contract: false when the seat is taken,
-- the player is not in the room, or the room left the lobby. FOR SHARE on the room serialises
-- this with commit_game's FOR UPDATE, so no seat can change while a match is being started.
create function public.set_seat(p_room uuid, p_user uuid, p_seat smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.rooms where id = p_room and status = 'lobby' for share;
  if not found then
    return false;
  end if;
  update public.room_players set seat = p_seat where room_id = p_room and user_id = p_user;
  return found;
exception
  when unique_violation then
    return false;
end;
$$;

-- Atomically commits a game transition with optimistic versioning (Store.commitGame contract).
-- p_expected = 0 starts the first match of the room: the room must be in the lobby and its
-- seated players must be exactly p_users (user ids indexed by seat, all 4 seats).
-- Otherwise the stored version must equal p_expected. Returns false (writing nothing) on refusal.
create function public.commit_game(
  p_room uuid,
  p_expected integer,
  p_state jsonb,
  p_view jsonb,
  p_log jsonb,
  p_deadline timestamptz,
  p_users jsonb,
  p_hands jsonb,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
  v_status text;
begin
  if p_expected = 0 then
    select status into v_status from public.rooms where id = p_room for update;
    if not found or v_status <> 'lobby' then
      return false;
    end if;
    if jsonb_typeof(p_users) <> 'array' or jsonb_array_length(p_users) <> 4
       or (select count(*) from public.room_players where room_id = p_room and seat is not null) <> 4
       or exists (
         select 1 from public.room_players rp
          where rp.room_id = p_room and rp.seat is not null
            and rp.user_id::text is distinct from (p_users ->> rp.seat::int)
       ) then
      return false;
    end if;
    insert into public.game_secret (room_id, version, state, log, deadline, users)
    values (p_room, 1, p_state, p_log, p_deadline, p_users)
    on conflict (room_id) do nothing;
    if not found then
      return false;
    end if;
    v_new := 1;
  else
    update public.game_secret
       set version = version + 1, state = p_state, log = p_log, deadline = p_deadline, users = p_users
     where room_id = p_room and version = p_expected;
    if not found then
      return false;
    end if;
    v_new := p_expected + 1;
  end if;

  insert into public.game_public (room_id, version, view, log, deadline)
  values (p_room, v_new, p_view, p_log, p_deadline)
  on conflict (room_id) do update
    set version = excluded.version, view = excluded.view, log = excluded.log, deadline = excluded.deadline;

  insert into public.game_hands (room_id, seat, user_id, cards, moves)
  select p_room, (h ->> 'seat')::smallint, (h ->> 'user_id')::uuid, h -> 'cards', h -> 'moves'
    from jsonb_array_elements(p_hands) as h
  on conflict (room_id, seat) do update
    set user_id = excluded.user_id, cards = excluded.cards, moves = excluded.moves;

  update public.rooms set status = p_status, start_at = null where id = p_room;
  return true;
end;
$$;

-- Store.insertMessage contract: inserts only if this user posted nothing in the room during the
-- last second (database clock). The per-user advisory lock makes check + insert atomic.
create function public.send_message(p_room uuid, p_user uuid, p_name text, p_text text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_room::text || p_user::text));
  if exists (
    select 1 from public.messages
     where room_id = p_room and user_id = p_user and created_at > now() - interval '1 second'
  ) then
    return false;
  end if;
  insert into public.messages (room_id, user_id, name, text) values (p_room, p_user, p_name, p_text);
  return true;
end;
$$;

revoke execute on function public.set_seat(uuid, uuid, smallint) from public, anon, authenticated;
revoke execute on function public.commit_game(uuid, integer, jsonb, jsonb, jsonb, timestamptz, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.send_message(uuid, uuid, text, text) from public, anon, authenticated;

alter publication supabase_realtime
  add table public.rooms, public.room_players, public.game_public, public.game_hands, public.messages;
```

- [ ] **Step 3: Commit**

```bash
git add supabase
git commit -m "feat: add Supabase schema, RLS and commit_game"
```

---

### Task 7: Supabase store, auth and HTTP helpers

**Files:**
- Create: `lib/server/random.ts`, `lib/server/supabase-admin.ts`, `lib/server/supabase-store.ts`, `lib/server/auth.ts`, `lib/server/http.ts`
- Test: `lib/server/__tests__/http.test.ts`

- [ ] **Step 1: Write the failing test `lib/server/__tests__/http.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HttpError } from '../errors';
import { handle, readJson } from '../http';

describe('handle', () => {
  it('returns the body as JSON, defaulting to { ok: true }', async () => {
    expect(await (await handle(async () => ({ code: 'ABCD' }))).json()).toEqual({ code: 'ABCD' });
    expect(await (await handle(async () => undefined)).json()).toEqual({ ok: true });
  });

  it('maps HttpError and validation errors to their status with a message', async () => {
    const notFound = await handle(async () => { throw new HttpError(404, 'Camera nu există'); });
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: 'Camera nu există' });

    const invalid = await handle(async () => z.object({ name: z.string().min(2, 'Prea scurt') }).parse({ name: 'a' }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Prea scurt' });
  });

  it('hides unexpected errors behind a 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handle(async () => { throw new Error('db down'); });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Eroare de server' });
    spy.mockRestore();
  });
});

describe('readJson', () => {
  it('rejects malformed bodies with 400', async () => {
    const req = new Request('http://x', { method: 'POST', body: '{nope' });
    await expect(readJson(req)).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/server/__tests__/http.test.ts`
Expected: FAIL — cannot resolve `../http`.

- [ ] **Step 3: Create `lib/server/http.ts`**

```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from './errors';

/** Runs a route body and maps errors to JSON responses with Romanian messages. */
export async function handle(run: () => Promise<unknown>): Promise<Response> {
  try {
    const body = await run();
    return NextResponse.json(body ?? { ok: true });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Eroare de server' }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Cerere invalidă');
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/server/__tests__/http.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create `lib/server/random.ts`**

```ts
/** Uniform number in [0, 1) from the platform CSPRNG; used for shuffling and room codes in production. */
export function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}
```

- [ ] **Step 6: Create `lib/server/supabase-store.ts`**

```ts
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

  async setStartAt(roomId: string, startAt: string | null): Promise<void> {
    const { error } = await this.db.from('rooms').update({ start_at: startAt }).eq('id', roomId);
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
```

- [ ] **Step 7: Create `lib/server/supabase-admin.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';
import { cryptoRandom } from './random';
import type { ServiceDeps } from './service';
import { SupabaseStore } from './supabase-store';

let admin: SupabaseClient | null = null;

/** Service-role client. Server only — never import from client components. */
export function adminClient(): SupabaseClient {
  if (!admin) {
    const env = serverEnv();
    admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export function serviceDeps(): ServiceDeps {
  return { store: new SupabaseStore(adminClient()), now: () => new Date(), rng: cryptoRandom };
}
```

- [ ] **Step 8: Create `lib/server/auth.ts`**

```ts
import { HttpError } from './errors';
import { adminClient } from './supabase-admin';

/** Resolves the Supabase user (anonymous sessions included) from `Authorization: Bearer <token>`. */
export async function requireUserId(request: Request): Promise<string> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) throw new HttpError(401, 'Autentificare necesară');
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sesiune invalidă, reîncarcă pagina');
  return data.user.id;
}
```

- [ ] **Step 9: Verify and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. (`SupabaseStore` is exercised against the real database by the smoke test in Task 10.)

```bash
git add lib/server
git commit -m "feat: add Supabase store, auth and HTTP helpers"
```

---

### Task 8: API routes

**Files:**
- Create: `app/api/rooms/route.ts`, `app/api/rooms/[code]/join/route.ts`, `app/api/rooms/[code]/seat/route.ts`, `app/api/rooms/[code]/action/route.ts`, `app/api/rooms/[code]/tick/route.ts`, `app/api/rooms/[code]/rematch/route.ts`, `app/api/rooms/[code]/chat/route.ts`

First read the Next 16 route-handler docs in `node_modules/next/dist/docs/` (search for "route handlers" / `route.ts`) and confirm the signature for dynamic params. The code below uses `ctx: { params: Promise<{ code: string }> }`. If Next 16 generates a `RouteContext<'/api/rooms/[code]/join'>` helper type, it may be used instead.

- [ ] **Step 1: Create `app/api/rooms/route.ts`**

```ts
import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { nameBodySchema } from '@/lib/server/schemas';
import { createRoom } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request) {
  return handle(async () => {
    const userId = await requireUserId(request);
    const { name } = nameBodySchema.parse(await readJson(request));
    return { code: await createRoom(serviceDeps(), userId, name) };
  });
}
```

- [ ] **Step 2: Create `app/api/rooms/[code]/join/route.ts`**

```ts
import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { nameBodySchema } from '@/lib/server/schemas';
import { joinRoom } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    const { name } = nameBodySchema.parse(await readJson(request));
    return { code: await joinRoom(serviceDeps(), code, userId, name) };
  });
}
```

- [ ] **Step 3: Create `app/api/rooms/[code]/seat/route.ts`**

```ts
import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { seatBodySchema } from '@/lib/server/schemas';
import { takeSeat } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    const { seat } = seatBodySchema.parse(await readJson(request));
    await takeSeat(serviceDeps(), code, userId, seat);
  });
}
```

- [ ] **Step 4: Create `app/api/rooms/[code]/action/route.ts`**

```ts
import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { actionBodySchema } from '@/lib/server/schemas';
import { act } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    const { action } = actionBodySchema.parse(await readJson(request));
    await act(serviceDeps(), code, userId, action);
  });
}
```

- [ ] **Step 5: Create `app/api/rooms/[code]/tick/route.ts`**

```ts
import { requireUserId } from '@/lib/server/auth';
import { handle } from '@/lib/server/http';
import { tick } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    return { changed: await tick(serviceDeps(), code, userId) };
  });
}
```

- [ ] **Step 6: Create `app/api/rooms/[code]/rematch/route.ts`**

```ts
import { requireUserId } from '@/lib/server/auth';
import { handle } from '@/lib/server/http';
import { rematch } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    return { ok: await rematch(serviceDeps(), code, userId) };
  });
}
```

- [ ] **Step 7: Create `app/api/rooms/[code]/chat/route.ts`**

```ts
import { requireUserId } from '@/lib/server/auth';
import { handle, readJson } from '@/lib/server/http';
import { messageBodySchema } from '@/lib/server/schemas';
import { sendMessage } from '@/lib/server/service';
import { serviceDeps } from '@/lib/server/supabase-admin';

export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const { code } = await ctx.params;
    const userId = await requireUserId(request);
    const { text } = messageBodySchema.parse(await readJson(request));
    await sendMessage(serviceDeps(), code, userId, text);
  });
}
```

- [ ] **Step 8: Verify build and commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. `next build` must not need the env vars at build time: they are read lazily inside handlers. If the build fails because of missing env, make sure nothing calls `serverEnv()` at module top level.

```bash
git add app/api
git commit -m "feat: add room and game API routes"
```

---

### Task 9: Client helpers

**Files:**
- Create: `lib/client/supabase.ts`, `lib/client/api.ts`

These are consumed by the UI in Plan 3. They are thin wrappers, verified by typecheck here and exercised end-to-end in Plan 3.

- [ ] **Step 1: Create `lib/client/supabase.ts`**

```ts
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

let client: SupabaseClient | null = null;

/** Browser Supabase client (anon key; persists the anonymous session in localStorage). */
export function browserClient(): SupabaseClient {
  if (!client) {
    const env = publicEnv();
    client = createClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}

/** Returns the current session, signing in anonymously on first visit. */
export async function ensureSession(): Promise<Session> {
  const supabase = browserClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signedIn.session) throw new Error('Nu am putut porni sesiunea. Reîncarcă pagina.');
  return signedIn.session;
}
```

- [ ] **Step 2: Create `lib/client/api.ts`**

```ts
import type { Seat } from '@/lib/game';
import type { PlayerActionInput } from '@/lib/server/schemas';
import { ensureSession } from './supabase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const session = await ensureSession();
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Eroare necunoscută');
  return data as T;
}

const room = (code: string) => `/api/rooms/${encodeURIComponent(code)}`;

export const api = {
  createRoom: (name: string) => post<{ code: string }>('/api/rooms', { name }),
  joinRoom: (code: string, name: string) => post<{ code: string }>(`${room(code)}/join`, { name }),
  takeSeat: (code: string, seat: Seat | null) => post<{ ok: true }>(`${room(code)}/seat`, { seat }),
  act: (code: string, action: PlayerActionInput) => post<{ ok: true }>(`${room(code)}/action`, { action }),
  tick: (code: string) => post<{ changed: boolean }>(`${room(code)}/tick`),
  rematch: (code: string) => post<{ ok: boolean }>(`${room(code)}/rematch`),
  sendMessage: (code: string, text: string) => post<{ ok: true }>(`${room(code)}/chat`, { text }),
};
```

`lib/server/schemas.ts` only imports `zod` and `@/lib/game`, and the import here is type-only, so nothing server-only reaches the browser bundle.

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint`

```bash
git add lib/client
git commit -m "feat: add browser Supabase session and API client"
```

---

### Task 10: Cloud setup (USER) + end-to-end smoke test

**The user does this part.** Implementer agents must stop here and hand over to the user. Never log in, create accounts or type passwords on the user's behalf.

- [ ] **Step 1 (user): Log in and create the project**

```bash
npx supabase login
```
```bash
npx supabase orgs list
```
```bash
npx supabase projects create ciuri --org-id <ORG_ID> --region eu-central-1
```
The CLI asks for a database password. The user types it and keeps it safe. Note the project ref printed by the CLI (also visible in the dashboard URL).

- [ ] **Step 2 (user): Enable anonymous sign-ins**

In the Supabase dashboard: **Authentication → Sign In / Providers → "Allow anonymous sign-ins" → on → Save.**

- [ ] **Step 3 (user): Create `.env.local`** from `.env.example`, with the values from **Project Settings → API** (Project URL, anon/publishable key, service_role/secret key). Never commit this file.

- [ ] **Step 4 (user): Link the project and push the schema**

```bash
npx supabase link --project-ref <PROJECT_REF>
```
```bash
npx supabase db push
```
Expected: the migration `20260925000000_init.sql` is applied.

- [ ] **Step 5 (agent): Create `scripts/smoke-match.ts`**

```ts
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
```

- [ ] **Step 6 (agent, after the user finished steps 1–4): Run the smoke test**

In one terminal:
```bash
npm run dev
```
In another:
```bash
npx tsx --env-file=.env.local scripts/smoke-match.ts
```
Expected: `room XXXX: 4 seated`, `match over: A .. – B ..`, then `SMOKE TEST PASSED`. A normal-only match can take several minutes, because each round waits for the 5 s summary.

If it fails with 401, check that anonymous sign-ins are enabled. If `game_hands` returns no rows, check the RLS policies and that the migration ran.

- [ ] **Step 7: Commit**

```bash
git add scripts/smoke-match.ts
git commit -m "test: add end-to-end smoke test against Supabase"
```

---

## Done criteria for Plan 2

- `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` pass.
- The smoke test passes against the real Supabase project.
- No client can read `game_secret` or another player's `game_hands`, and the smoke test checks both.

Next: Plan 3, the UI (start page, lobby, table, chat, realtime subscriptions, presence, Playwright test with 4 browsers), then deploy to Vercel.
