# Ciuri — Plan 3: User Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable browser UI for Ciuri: a start page, a room lobby with 4 seats and auto-start, the game table (hand, bidding with "Pas", declarations, Stop, timers, trick, trump, score, event log, round summary, rematch), chat and online presence, verified by a 4-browser Playwright test.

**Architecture:**
- **Client-only rendering.** Room and home screens are client components, loaded with `next/dynamic({ ssr: false })` so they can read `localStorage` (saved name, Supabase session) without hydration mismatches.
- **One data hook.** `useRoom(code, name)` joins the room through the API, loads a snapshot with the anon Supabase client (RLS limits what each player sees), and keeps it fresh with Realtime `postgres_changes` (re-fetch on change, last-request-wins) plus Presence.
- **Automatic transitions.** `<Ticker>` calls `POST /tick` when the current deadline (lobby `start_at` or game `deadline`) passes.
- **Server-provided moves.** Actions go through `lib/client/api.ts`. The server-computed `moves` in the player's own `game_hands` row decides which buttons and cards are enabled, so the UI never re-implements rules.
- **Pure presentation helpers.** Romanian text for cards, bids, events and results, and the seat → screen position mapping, live in `lib/ui/` and are unit-tested.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, Tailwind CSS v4, `@supabase/supabase-js` Realtime/Presence, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-25-ciuri-design.md` §2 (UX) and §2.7 (cards are our own SVGs). Server API: `lib/client/api.ts`; tables and columns: `supabase/migrations/20260925000000_init.sql`.

**Before starting:** read `AGENTS.md`. Next 16 differs from older versions, so check `node_modules/next/dist/docs/` for pages with async `params`, `next/dynamic` with `ssr: false` in client components, and `LayoutProps`. `eslint-config-next` 16 ships the React Compiler lint rules (e.g. `react-hooks/set-state-in-effect`, `react-hooks/purity`). If a listing below trips one, restructure the code; never disable the rule.

**Data read by the client (RLS-protected, anon key + the player's session):**

| Table | Columns used | Visible to |
|---|---|---|
| `rooms` | `id, code, status, start_at` | members |
| `room_players` | `user_id, name, seat, joined_at` | members |
| `game_public` | `version, view (PublicState), log (GameEvent[]), deadline` | members |
| `game_hands` | `seat, cards (Card[]), moves (LegalMoves)` | only the owner |
| `messages` | `id, user_id, name, text, created_at` | members |

## File structure

| File | Responsibility |
|---|---|
| `lib/ui/format.ts` | Romanian labels: suits, ranks, card names, bids, modes, points, results, events |
| `lib/ui/seats.ts` | Seat → screen position relative to the viewer; names by seat |
| `lib/client/use-room.ts` | Room data hook (join, snapshot, realtime, presence) + row types |
| `lib/client/use-now.ts` | Re-rendering clock for countdowns |
| `components/cards/SuitIcon.tsx` | SVG suit symbols and colours |
| `components/cards/PlayingCard.tsx` | SVG card face (button or image) and card back |
| `components/home/Home.tsx`, `HomeLoader.tsx` | Start page (name, create room, join by code) |
| `components/room/RoomLoader.tsx`, `RoomScreen.tsx` | Room entry: name gate, loading/error, lobby vs table, chat column |
| `components/room/NameForm.tsx` | Name input + saved-name helpers |
| `components/room/Ticker.tsx` | Calls `/tick` when a deadline passes |
| `components/room/Lobby.tsx` | Seats, invite link, countdown |
| `components/room/Chat.tsx` | Messages list + input |
| `components/table/Table.tsx` | Game table layout |
| `components/table/PlayerSeat.tsx` | Opponent/partner badge (name, turn timer, dealer, offline, sitting out, card backs) |
| `components/table/CenterArea.tsx` | Current/last trick, trump, contract, round points |
| `components/table/MyArea.tsx` | Own hand, bidding panel, declaration prompt, Stop, errors |
| `components/table/ScoreBar.tsx` | Match score and round number |
| `components/table/EventLog.tsx` | Last events in Romanian |
| `components/table/RoundSummary.tsx` | Round/match result overlay + rematch |
| `app/page.tsx`, `app/room/[code]/page.tsx`, `app/layout.tsx`, `app/globals.css` | Routes, metadata, base styles |
| `playwright.config.ts`, `e2e/game.spec.ts` | 4-browser end-to-end test |

---

### Task 1: Presentation helpers

**Files:**
- Create: `lib/ui/format.ts`, `lib/ui/seats.ts`
- Test: `lib/ui/__tests__/format.test.ts`, `lib/ui/__tests__/seats.test.ts`

- [ ] **Step 1: Write the failing test `lib/ui/__tests__/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { RoundResult } from '@/lib/game';
import {
  bidLabel, cardName, describeEvent, modeName, pointsText, resultText, teamName,
} from '../format';

const NAMES = ['Ana', 'Bogdan', 'Cristi', 'Dana'];

describe('labels', () => {
  it('names cards, bids, modes and teams in Romanian', () => {
    expect(cardName({ suit: 'rosu', rank: 11 })).toBe('As Roșu');
    expect(cardName({ suit: 'ghinda', rank: 3 })).toBe('Trei Ghindă');
    expect(bidLabel({ kind: 'pass' })).toBe('Pas');
    expect(bidLabel({ kind: 'mica' })).toBe('Mica');
    expect(bidLabel({ kind: 'tromf', suit: 'duba' })).toBe('Tromful tău: Dubă');
    expect(modeName('normal')).toBe('Joc normal');
    expect(modeName('tromf')).toBe('Tromful tău');
    expect(teamName('B')).toBe('Echipa B');
  });

  it('uses Romanian plural rules for points', () => {
    expect(pointsText(1)).toBe('1 punct');
    expect(pointsText(0)).toBe('0 puncte');
    expect(pointsText(12)).toBe('12 puncte');
    expect(pointsText(20)).toBe('20 de puncte');
    expect(pointsText(66)).toBe('66 de puncte');
    expect(pointsText(101)).toBe('101 puncte');
  });
});

describe('resultText', () => {
  const base = { winner: 'B', points: 3, mode: 'normal', bidder: null } as const;

  it('describes normal rounds, stops and contracts', () => {
    expect(resultText({ ...base, reason: 'normal' }, NAMES)).toBe('Echipa B primește 3 puncte (a luat ultima mână).');
    expect(resultText({ ...base, reason: 'stop', stopBy: 3 }, NAMES)).toBe('Dana a zis Stop. Echipa B primește 3 puncte.');
    const made: RoundResult = { winner: 'B', points: 12, reason: 'contract-made', mode: 'ciuri', bidder: 1 };
    expect(resultText(made, NAMES)).toBe('Bogdan a făcut Ciuri. Echipa B primește 12 puncte.');
    const failed: RoundResult = { winner: 'A', points: 12, reason: 'contract-failed', mode: 'adunare', bidder: 1, adunareSum: 65 };
    expect(resultText(failed, NAMES)).toBe('Bogdan n-a făcut Adunare. Cărțile arătate: 65 de puncte. Echipa A primește 12 puncte.');
  });
});

describe('describeEvent', () => {
  it('turns log events into sentences', () => {
    expect(describeEvent({ type: 'matchStart', dealer: 0 }, NAMES)).toBe('Meci nou. Împarte Ana.');
    expect(describeEvent({ type: 'newRound', dealer: 1, roundNumber: 2 }, NAMES)).toBe('Runda 2. Împarte Bogdan.');
    expect(describeEvent({ type: 'timeout', seat: 2 }, NAMES)).toBe('Cristi n-a mutat la timp.');
    expect(describeEvent({ type: 'bid', seat: 3, bid: { kind: 'pass' } }, NAMES)).toBe('Dana: Pas.');
    expect(describeEvent({ type: 'bid', seat: 1, bid: { kind: 'mare' } }, NAMES)).toBe('Bogdan a zis Mare.');
    expect(describeEvent({ type: 'declare', seat: 0, suit: 'verde', points: 40 }, NAMES)).toBe('Ana a strigat 40 (Verde).');
    expect(describeEvent({ type: 'trick', winner: 2, points: 27 }, NAMES)).toBe('Cristi ia mâna (27 de puncte).');
    expect(describeEvent({ type: 'trick', winner: null, points: 6 }, NAMES)).toBe('Mână jucată.');
  });
});
```

- [ ] **Step 2: Write the failing test `lib/ui/__tests__/seats.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { positionOf, seatNames } from '../seats';

describe('positionOf', () => {
  it('puts the viewer at the bottom and play goes bottom → left → top → right', () => {
    expect(positionOf(2, 2)).toBe('bottom');
    expect(positionOf(3, 2)).toBe('left');
    expect(positionOf(0, 2)).toBe('top');
    expect(positionOf(1, 2)).toBe('right');
  });

  it('uses seat 0 as the bottom for spectators', () => {
    expect(positionOf(0, null)).toBe('bottom');
    expect(positionOf(2, null)).toBe('top');
  });
});

describe('seatNames', () => {
  it('maps seated players to their seat and fills gaps', () => {
    expect(seatNames([{ name: 'Ana', seat: 2 }, { name: 'Bogdan', seat: null }])).toEqual(['Locul 1', 'Locul 2', 'Ana', 'Locul 4']);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run lib/ui`
Expected: FAIL (modules not found).

- [ ] **Step 4: Create `lib/ui/format.ts`**

```ts
import type { Bid, Card, Mode, Rank, RoundResult, Suit, Team } from '@/lib/game';
import type { GameEvent } from '@/lib/server/events';

export const SUIT_NAMES: Record<Suit, string> = { rosu: 'Roșu', verde: 'Verde', ghinda: 'Ghindă', duba: 'Dubă' };
export const RANK_LABELS: Record<Rank, string> = { 2: '2', 3: '3', 4: '4', 10: '10', 11: 'A' };
export const RANK_NAMES: Record<Rank, string> = { 2: 'Doi', 3: 'Trei', 4: 'Patru', 10: 'Zece', 11: 'As' };

const MODE_NAMES: Record<Mode, string> = {
  normal: 'Joc normal',
  ciuri: 'Ciuri',
  adunare: 'Adunare',
  tromf: 'Tromful tău',
  mare: 'Mare',
  mica: 'Mica',
};

export function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank]} ${SUIT_NAMES[card.suit]}`;
}

export function modeName(mode: Mode): string {
  return MODE_NAMES[mode];
}

export function bidLabel(bid: Bid): string {
  switch (bid.kind) {
    case 'pass':
      return 'Pas';
    case 'tromf':
      return `Tromful tău: ${SUIT_NAMES[bid.suit]}`;
    default:
      return MODE_NAMES[bid.kind];
  }
}

export function teamName(team: Team): string {
  return `Echipa ${team}`;
}

/** Romanian: "1 punct", "12 puncte", "20 de puncte", "101 puncte". */
export function pointsText(n: number): string {
  if (n === 1) return '1 punct';
  const lastTwo = n % 100;
  const needsDe = n >= 20 && !(lastTwo >= 1 && lastTwo <= 19);
  return `${n} ${needsDe ? 'de puncte' : 'puncte'}`;
}

export function resultText(result: RoundResult, names: string[]): string {
  const gain = `${teamName(result.winner)} primește ${pointsText(result.points)}.`;
  switch (result.reason) {
    case 'normal':
      return `${teamName(result.winner)} primește ${pointsText(result.points)} (a luat ultima mână).`;
    case 'stop':
      return `${names[result.stopBy ?? 0]} a zis Stop. ${gain}`;
    case 'contract-made':
    case 'contract-failed': {
      const verb = result.reason === 'contract-made' ? 'a făcut' : 'n-a făcut';
      const revealed = result.adunareSum === undefined ? '' : ` Cărțile arătate: ${pointsText(result.adunareSum)}.`;
      return `${names[result.bidder ?? 0]} ${verb} ${modeName(result.mode)}.${revealed} ${gain}`;
    }
  }
}

export function describeEvent(event: GameEvent, names: string[]): string {
  switch (event.type) {
    case 'matchStart':
      return `Meci nou. Împarte ${names[event.dealer]}.`;
    case 'newRound':
      return `Runda ${event.roundNumber}. Împarte ${names[event.dealer]}.`;
    case 'timeout':
      return `${names[event.seat]} n-a mutat la timp.`;
    case 'bid':
      return event.bid.kind === 'pass' ? `${names[event.seat]}: Pas.` : `${names[event.seat]} a zis ${bidLabel(event.bid)}.`;
    case 'declare':
      return `${names[event.seat]} a strigat ${event.points} (${SUIT_NAMES[event.suit]}).`;
    case 'trick':
      return event.winner === null ? 'Mână jucată.' : `${names[event.winner]} ia mâna (${pointsText(event.points)}).`;
    case 'roundEnd':
      return resultText(event.result, names);
  }
}
```

- [ ] **Step 5: Create `lib/ui/seats.ts`**

```ts
import type { Seat } from '@/lib/game';

export type Position = 'bottom' | 'left' | 'top' | 'right';

const ORDER: Position[] = ['bottom', 'left', 'top', 'right'];
export const SEATS: Seat[] = [0, 1, 2, 3];

/** Screen position of `seat` for a viewer sitting at `viewer` (spectators see seat 0 at the bottom). */
export function positionOf(seat: Seat, viewer: Seat | null): Position {
  return ORDER[(seat - (viewer ?? 0) + 4) % 4];
}

export function seatNames(players: { name: string; seat: Seat | null }[]): string[] {
  const names = SEATS.map((seat) => `Locul ${seat + 1}`);
  for (const p of players) if (p.seat !== null) names[p.seat] = p.name;
  return names;
}
```

- [ ] **Step 6: Run tests, typecheck, lint; commit**

Run: `npx vitest run lib/ui && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add lib/ui
git commit -m "feat: add Romanian UI labels and seat layout helpers"
```

---

### Task 2: Cards, base layout and start page

**Files:**
- Create: `components/cards/SuitIcon.tsx`, `components/cards/PlayingCard.tsx`, `components/room/NameForm.tsx`, `components/home/Home.tsx`, `components/home/HomeLoader.tsx`
- Modify: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`

- [ ] **Step 1: Replace `app/globals.css`**

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

html,
body {
  background: #0f2e1f;
  color: #f5f5f4;
}

.felt {
  background: radial-gradient(ellipse at center, #1f6b45 0%, #155236 55%, #0f3d28 100%);
}
```

- [ ] **Step 2: Update `app/layout.tsx`.** Set `lang="ro"`, the Romanian metadata below and a full-height body. Keep the Geist font setup.

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin', 'latin-ext'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ciuri',
  description: 'Ciuri — joc de cărți online, în echipe, cu pachet unguresc.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ro" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
```

If `latin-ext` is not accepted by the installed `Geist` font loader, keep `['latin']` only; the Romanian diacritics then fall back to the system font.

- [ ] **Step 3: Create `components/cards/SuitIcon.tsx`**

```tsx
import type { Suit } from '@/lib/game';

export const SUIT_COLORS: Record<Suit, string> = {
  rosu: '#c62828',
  verde: '#2e7d32',
  ghinda: '#8d5524',
  duba: '#c79100',
};

/** Our own simple drawings of the Hungarian suits: heart, leaf, acorn, bell. */
export function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
  const color = SUIT_COLORS[suit];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {suit === 'rosu' && (
        <path fill={color} d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z" />
      )}
      {suit === 'verde' && (
        <>
          <path fill={color} d="M12 2C7.5 5.5 4.5 9.5 4.5 13.5A7.5 7.5 0 0 0 12 21a7.5 7.5 0 0 0 7.5-7.5C19.5 9.5 16.5 5.5 12 2z" />
          <path stroke="#1b4d1e" strokeWidth="1.2" fill="none" d="M12 6v17" />
        </>
      )}
      {suit === 'ghinda' && (
        <>
          <path fill="#5d3a1a" d="M4.5 10.5C4.5 6.9 7.9 4 12 4s7.5 2.9 7.5 6.5z" />
          <path fill={color} d="M6.5 10.5h11V13c0 4-2.5 8-5.5 8s-5.5-4-5.5-8z" />
          <path stroke="#5d3a1a" strokeWidth="1.5" d="M12 1.5V4" />
        </>
      )}
      {suit === 'duba' && (
        <>
          <path fill={color} d="M12 3a6 6 0 0 0-6 6v5l-2.5 3.5h17L18 14V9a6 6 0 0 0-6-6z" />
          <circle cx="12" cy="20" r="2" fill="#7a5a00" />
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Create `components/cards/PlayingCard.tsx`**

```tsx
import type { Card } from '@/lib/game';
import { RANK_LABELS, RANK_NAMES, cardName } from '@/lib/ui/format';
import { SUIT_COLORS, SuitIcon } from './SuitIcon';

const SIZES = {
  sm: 'w-10 h-15',
  md: 'w-16 h-24',
  lg: 'w-20 h-30',
} as const;
export type CardSize = keyof typeof SIZES;

interface PlayingCardProps {
  card: Card;
  size?: CardSize;
  /** Interactive cards render as buttons; `playable` enables them. */
  onClick?: () => void;
  playable?: boolean;
  dimmed?: boolean;
}

function Face({ card, dimmed }: { card: Card; dimmed: boolean }) {
  const color = SUIT_COLORS[card.suit];
  return (
    <span
      className={`relative flex h-full w-full flex-col items-center justify-center rounded-lg border border-stone-400 bg-amber-50 shadow-md ${dimmed ? 'opacity-50' : ''}`}
    >
      <span className="absolute left-1 top-0.5 flex flex-col items-center leading-none" style={{ color }}>
        <span className="text-sm font-bold">{RANK_LABELS[card.rank]}</span>
        <SuitIcon suit={card.suit} className="h-3 w-3" />
      </span>
      <SuitIcon suit={card.suit} className="h-1/2 w-1/2" />
      <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-stone-700">{RANK_NAMES[card.rank]}</span>
    </span>
  );
}

export function PlayingCard({ card, size = 'md', onClick, playable = false, dimmed = false }: PlayingCardProps) {
  const base = `${SIZES[size]} block shrink-0 transition-transform`;
  if (!onClick) {
    return (
      <span role="img" aria-label={cardName(card)} className={base}>
        <Face card={card} dimmed={dimmed} />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!playable}
      aria-label={cardName(card)}
      className={`${base} ${playable ? '-translate-y-1 cursor-pointer hover:-translate-y-3' : 'cursor-not-allowed'}`}
    >
      <Face card={card} dimmed={dimmed} />
    </button>
  );
}

export function CardBack({ size = 'sm' }: { size?: CardSize }) {
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} block shrink-0 rounded-lg border border-stone-500 bg-[repeating-linear-gradient(45deg,#7f1d1d_0_6px,#991b1b_6px_12px)] shadow`}
    />
  );
}
```

- [ ] **Step 5: Create `components/room/NameForm.tsx`**

```tsx
'use client';

import { useState } from 'react';

const NAME_KEY = 'ciuri:name';

export function nameLength(name: string): number {
  return [...name.trim()].length;
}

export function isValidName(name: string): boolean {
  const length = nameLength(name);
  return length >= 2 && length <= 20;
}

export function readSavedName(): string | null {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    return saved && isValidName(saved) ? saved.trim() : null;
  } catch {
    return null;
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // storage unavailable (private mode): the name is simply not remembered
  }
}

export function NameForm({ onSubmit, submitLabel = 'Continuă' }: { onSubmit: (name: string) => void; submitLabel?: string }) {
  const [value, setValue] = useState('');
  const valid = isValidName(value);
  return (
    <form
      className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 rounded-xl bg-stone-900/80 p-6 shadow-xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSubmit(value.trim());
      }}
    >
      <label className="flex flex-col gap-2 text-sm">
        Numele tău
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={20}
          autoFocus
          className="rounded-md bg-stone-100 px-3 py-2 text-base text-stone-900"
        />
      </label>
      <button type="submit" disabled={!valid} className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-stone-900 disabled:opacity-50">
        {submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Create `components/home/Home.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { isValidName, readSavedName, saveName } from '@/components/room/NameForm';

export function Home() {
  const router = useRouter();
  const [name, setName] = useState(() => readSavedName() ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validName = isValidName(name);
  const normalizedCode = code.trim().toUpperCase();

  async function createRoom() {
    if (!validName) return;
    setBusy(true);
    setError(null);
    try {
      saveName(name);
      const created = await api.createRoom(name.trim());
      router.push(`/room/${created.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut crea camera.');
      setBusy(false);
    }
  }

  return (
    <main className="felt flex min-h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-stone-900/85 p-8 shadow-2xl">
        <header className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-amber-400">Ciuri</h1>
          <p className="mt-2 text-sm text-stone-300">Joc de cărți în echipe, cu pachet unguresc. 4 jucători, până la 21.</p>
        </header>

        <label className="flex flex-col gap-2 text-sm">
          Numele tău
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            className="rounded-md bg-stone-100 px-3 py-2 text-base text-stone-900"
          />
        </label>

        <button
          type="button"
          onClick={createRoom}
          disabled={!validName || busy}
          className="rounded-md bg-amber-500 px-4 py-3 text-lg font-semibold text-stone-900 disabled:opacity-50"
        >
          Creează cameră
        </button>

        <div className="flex items-center gap-3 text-xs uppercase text-stone-400">
          <span className="h-px flex-1 bg-stone-700" /> sau <span className="h-px flex-1 bg-stone-700" />
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!validName || normalizedCode.length !== 4) return;
            saveName(name);
            router.push(`/room/${normalizedCode}`);
          }}
        >
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={4}
            placeholder="COD"
            aria-label="Codul camerei"
            className="w-28 rounded-md bg-stone-100 px-3 py-2 text-center font-mono text-lg uppercase tracking-widest text-stone-900"
          />
          <button
            type="submit"
            disabled={!validName || normalizedCode.length !== 4}
            className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-semibold disabled:opacity-50"
          >
            Intră
          </button>
        </form>

        {error && <p role="alert" className="text-center text-sm text-red-300">{error}</p>}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Create `components/home/HomeLoader.tsx` and replace `app/page.tsx`**

```tsx
'use client';

import dynamic from 'next/dynamic';

/** Client-only: the start page reads the saved name from localStorage. */
export const HomeLoader = dynamic(() => import('./Home').then((m) => m.Home), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-stone-300">Se încarcă…</p>,
});
```

```tsx
import { HomeLoader } from '@/components/home/HomeLoader';

export default function Page() {
  return <HomeLoader />;
}
```

- [ ] **Step 8: Verify in the browser.** Run `npm run dev` and open http://localhost:3000.
  - The page shows the title, name input, "Creează cameră" and the code form.
  - "Creează cameră" with a valid name navigates to `/room/XXXX`. It will 404 until Task 4, which is expected.

  Then run `npm run typecheck && npm run lint && npm run build`.

- [ ] **Step 9: Commit**

```bash
git add app components
git commit -m "feat: add SVG cards and start page"
```

---

### Task 3: Room data hooks

**Files:**
- Create: `lib/client/use-room.ts`, `lib/client/use-now.ts`, `components/room/Ticker.tsx`

- [ ] **Step 1: Create `lib/client/use-now.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';

/** Current time in ms, refreshed every `intervalMs` (for countdowns). */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 2: Create `lib/client/use-room.ts`**

```ts
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
```

If `db.realtime.setAuth` has a different signature in the installed supabase-js version, check `node_modules/@supabase/realtime-js`. supabase-js normally syncs the token itself, so the call may be dropped if typecheck rejects it.

- [ ] **Step 3: Create `components/room/Ticker.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { api } from '@/lib/client/api';

const RETRY_MS = 1500;

/**
 * Asks the server to advance time-based transitions (auto-start, automatic moves, next round)
 * once `dueAt` has passed. Every client runs this; the server accepts only the first.
 */
export function Ticker({ code, dueAt }: { code: string; dueAt: string | null }) {
  useEffect(() => {
    if (!dueAt) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const fire = async () => {
      if (stopped) return;
      try {
        const { changed } = await api.tick(code);
        if (!changed && !stopped) timer = setTimeout(fire, RETRY_MS);
      } catch {
        if (!stopped) timer = setTimeout(fire, RETRY_MS * 2);
      }
    };

    // Small random delay spreads the 4 clients' requests.
    const delay = Math.max(0, new Date(dueAt).getTime() - Date.now()) + 150 + Math.random() * 500;
    timer = setTimeout(fire, delay);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [code, dueAt]);

  return null;
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm run lint`

```bash
git add lib/client components/room/Ticker.tsx
git commit -m "feat: add realtime room data hook and ticker"
```

---

### Task 4: Room screen, lobby and chat

**Files:**
- Create: `components/room/RoomLoader.tsx`, `components/room/RoomScreen.tsx`, `components/room/Lobby.tsx`, `components/room/Chat.tsx`, `app/room/[code]/page.tsx`

- [ ] **Step 1: Create `app/room/[code]/page.tsx`**

```tsx
import { RoomLoader } from '@/components/room/RoomLoader';

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomLoader code={code.toUpperCase()} />;
}
```

- [ ] **Step 2: Create `components/room/RoomLoader.tsx`**

```tsx
'use client';

import dynamic from 'next/dynamic';

/** Client-only: the room reads the saved name and the Supabase session from localStorage. */
export const RoomLoader = dynamic(() => import('./RoomScreen').then((m) => m.RoomScreen), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-stone-300">Se încarcă…</p>,
});
```

- [ ] **Step 3: Create `components/room/Chat.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import type { MessageRow } from '@/lib/client/use-room';

export function Chat({ code, messages, userId }: { code: string; messages: MessageRow[]; userId: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await api.sendMessage(code, trimmed);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mesajul nu a fost trimis.');
    }
  }

  return (
    <section aria-label="Chat" className="flex h-72 flex-col gap-2 rounded-xl bg-stone-900/80 p-3 lg:h-full">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">Chat</h2>
      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto text-sm">
        {messages.length === 0 && <p className="text-stone-500">Niciun mesaj încă.</p>}
        {messages.map((m) => (
          <p key={m.id} className="break-words">
            <span className={`font-semibold ${m.user_id === userId ? 'text-amber-400' : 'text-emerald-300'}`}>{m.name}:</span> {m.text}
          </p>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={300}
          placeholder="Scrie un mesaj…"
          aria-label="Mesaj"
          className="min-w-0 flex-1 rounded-md bg-stone-100 px-2 py-1 text-sm text-stone-900"
        />
        <button type="submit" className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold">
          Trimite
        </button>
      </form>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Create `components/room/Lobby.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { Seat } from '@/lib/game';
import { api } from '@/lib/client/api';
import { useNow } from '@/lib/client/use-now';
import type { ReadyRoom } from '@/lib/client/use-room';
import { SEATS } from '@/lib/ui/seats';

const TEAM_STYLE = { A: 'border-sky-400 bg-sky-900/60', B: 'border-orange-400 bg-orange-900/60' } as const;

export function Lobby({ room }: { room: ReadyRoom }) {
  const { data, userId, online } = room;
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const me = data.players.find((p) => p.user_id === userId);
  const waiting = data.players.filter((p) => p.seat === null);
  const link = `${window.location.origin}/room/${data.room.code}`;
  const countdown = data.room.start_at
    ? Math.max(0, Math.ceil((new Date(data.room.start_at).getTime() - now) / 1000))
    : null;

  async function sit(seat: Seat | null) {
    setError(null);
    try {
      await api.takeSeat(data.room.code, seat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut schimba locul.');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">
          Camera <span className="font-mono text-amber-400">{data.room.code}</span>
        </h1>
        <button
          type="button"
          className="rounded-md bg-stone-800 px-3 py-2 text-sm"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => setCopied(true));
          }}
        >
          {copied ? 'Link copiat!' : 'Copiază linkul de invitație'}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-4">
        {SEATS.map((seat) => {
          const player = data.players.find((p) => p.seat === seat);
          const team = seat % 2 === 0 ? 'A' : 'B';
          const mine = player?.user_id === userId;
          return (
            <button
              key={seat}
              type="button"
              disabled={Boolean(player) && !mine}
              onClick={() => void sit(mine ? null : seat)}
              className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left ${TEAM_STYLE[team]} ${mine ? 'ring-2 ring-amber-400' : ''} disabled:cursor-default`}
            >
              <span className="text-xs uppercase tracking-wide text-stone-300">
                Locul {seat + 1} · Echipa {team}
              </span>
              <span className="text-lg font-semibold">
                {player ? player.name : 'Liber — apasă ca să te așezi'}
                {player && !online.has(player.user_id) ? ' (deconectat)' : ''}
              </span>
              {mine && <span className="text-xs text-amber-300">Tu · apasă ca să te ridici</span>}
            </button>
          );
        })}
      </div>

      <p className="text-center text-lg" aria-live="polite">
        {countdown !== null ? `Jocul începe în ${countdown}…` : 'Așteptăm să se ocupe toate cele 4 locuri.'}
      </p>

      {waiting.length > 0 && (
        <p className="text-sm text-stone-400">În cameră, fără loc: {waiting.map((p) => p.name).join(', ')}</p>
      )}
      {me && me.seat === null && <p className="text-sm text-stone-300">Alege un loc liber. Coechipierii stau față în față.</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/room/RoomScreen.tsx`.** `Table` is created in Task 5. Until then, create a temporary `components/table/Table.tsx` that renders `<p>Jocul a început.</p>` with the prop signature `{ room: ReadyRoom }`, so this task compiles.

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRoom } from '@/lib/client/use-room';
import { Table } from '@/components/table/Table';
import { Chat } from './Chat';
import { Lobby } from './Lobby';
import { NameForm, readSavedName, saveName } from './NameForm';
import { Ticker } from './Ticker';

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>;
}

function Room({ code, name }: { code: string; name: string }) {
  const state = useRoom(code, name);
  if (state.kind === 'loading') return <Centered>Se încarcă camera…</Centered>;
  if (state.kind === 'error') {
    return (
      <Centered>
        <p className="text-lg">{state.message}</p>
        <Link href="/" className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-stone-900">
          Înapoi la început
        </Link>
      </Centered>
    );
  }
  const { data } = state;
  const dueAt =
    data.room.status === 'lobby' ? data.room.start_at
    : data.room.status === 'playing' ? (data.game?.deadline ?? null)
    : null;
  return (
    <div className="felt flex min-h-dvh flex-col gap-3 p-3 lg:flex-row">
      <Ticker code={data.room.code} dueAt={dueAt} />
      <main className="flex min-w-0 flex-1 flex-col">
        {data.room.status === 'lobby' ? <Lobby room={state} /> : <Table room={state} />}
      </main>
      <aside className="lg:w-80">
        <Chat code={data.room.code} messages={data.messages} userId={state.userId} />
      </aside>
    </div>
  );
}

export function RoomScreen({ code }: { code: string }) {
  const [name, setName] = useState<string | null>(() => readSavedName());
  if (!name) {
    return (
      <NameForm
        onSubmit={(value) => {
          saveName(value);
          setName(value);
        }}
      />
    );
  }
  return <Room code={code} name={name} />;
}
```

- [ ] **Step 6: Verify in the browser.** Run `npm run dev`.
  - Create a room in one browser window. Open the invite link in 3 private windows, or use other browser profiles so each has its own session.
  - Enter names and take all 4 seats. A 3-second countdown appears and then the temporary "Jocul a început." text shows.
  - Chat messages appear in all windows.
  - Standing up during the countdown cancels it.

  Then run `npm run typecheck && npm run lint && npm run build`.

- [ ] **Step 7: Commit**

```bash
git add app components
git commit -m "feat: add room screen, lobby and chat"
```

---

### Task 5: Game table

**Files:**
- Create (replacing the temporary one): `components/table/Table.tsx`
- Create: `components/table/PlayerSeat.tsx`, `components/table/CenterArea.tsx`, `components/table/MyArea.tsx`, `components/table/ScoreBar.tsx`, `components/table/EventLog.tsx`, `components/table/RoundSummary.tsx`

- [ ] **Step 1: Create `components/table/ScoreBar.tsx`**

```tsx
import type { PublicState } from '@/lib/game';

export function ScoreBar({ view, names }: { view: PublicState; names: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-900/80 px-4 py-2 text-sm">
      <span>
        <span className="font-semibold text-sky-300">Echipa A</span> ({names[0]} & {names[2]})
      </span>
      <span className="text-2xl font-bold tabular-nums" aria-label={`Scor: Echipa A ${view.score.A}, Echipa B ${view.score.B}`}>
        {view.score.A} – {view.score.B}
      </span>
      <span>
        <span className="font-semibold text-orange-300">Echipa B</span> ({names[1]} & {names[3]})
      </span>
      <span className="w-full text-center text-xs text-stone-400">Runda {view.roundNumber} · se joacă până la 21</span>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/table/PlayerSeat.tsx`**

```tsx
import type { Bid } from '@/lib/game';
import { CardBack } from '@/components/cards/PlayingCard';
import { bidLabel } from '@/lib/ui/format';

interface PlayerSeatProps {
  name: string;
  team: 'A' | 'B';
  cardCount: number;
  isTurn: boolean;
  isDealer: boolean;
  offline: boolean;
  sittingOut: boolean;
  bid: Bid | null;
  /** 0..1 fraction of the move time left, or null when this seat is not on turn. */
  timeLeft: number | null;
  secondsLeft: number | null;
}

export function PlayerSeat(props: PlayerSeatProps) {
  const { name, team, cardCount, isTurn, isDealer, offline, sittingOut, bid, timeLeft, secondsLeft } = props;
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 ${isTurn ? 'bg-amber-500/20 ring-2 ring-amber-400' : 'bg-stone-900/50'}`}
      aria-label={`${name}${isTurn ? ', la rând' : ''}`}
    >
      <span className="flex items-center gap-1 text-sm font-semibold">
        <span className={`h-2 w-2 rounded-full ${team === 'A' ? 'bg-sky-400' : 'bg-orange-400'}`} />
        {name}
        {isDealer && <span className="rounded bg-stone-700 px-1 text-[0.6rem] uppercase">împarte</span>}
      </span>
      {offline && <span className="text-xs text-red-300">deconectat</span>}
      {sittingOut ? (
        <span className="text-xs text-stone-400">stă (joacă singur coechipierul)</span>
      ) : (
        <span className="flex -space-x-6">
          {Array.from({ length: cardCount }, (_, i) => (
            <CardBack key={i} size="sm" />
          ))}
        </span>
      )}
      {bid && <span className="text-xs text-amber-200">{bidLabel(bid)}</span>}
      {isTurn && timeLeft !== null && (
        <span className="flex w-full items-center gap-1 text-xs tabular-nums">
          <span className="h-1 flex-1 overflow-hidden rounded bg-stone-700">
            <span className="block h-full bg-amber-400" style={{ width: `${Math.round(timeLeft * 100)}%` }} />
          </span>
          {secondsLeft}s
        </span>
      )}
    </div>
  );
}
```

Note: in a contract round the seat that sits out is the bidder's partner. The label reads "stă" to everyone.

- [ ] **Step 3: Create `components/table/CenterArea.tsx`**

```tsx
import type { PublicState, Seat } from '@/lib/game';
import { PlayingCard } from '@/components/cards/PlayingCard';
import { SuitIcon } from '@/components/cards/SuitIcon';
import { SUIT_NAMES, cardName, modeName } from '@/lib/ui/format';
import { positionOf, type Position } from '@/lib/ui/seats';

const SLOT: Record<Position, string> = {
  top: 'col-start-2 row-start-1',
  left: 'col-start-1 row-start-2',
  right: 'col-start-3 row-start-2',
  bottom: 'col-start-2 row-start-3',
};

export function CenterArea({ view, names, viewer }: { view: PublicState; names: string[]; viewer: Seat | null }) {
  const round = view.round;
  const showingLast = round.trick.length === 0 && round.lastTrick !== null;
  const plays = showingLast ? (round.lastTrick ?? []) : round.trick;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-stone-200">
        {round.mode !== 'normal' && round.bidder !== null && (
          <span className="rounded bg-stone-900/70 px-2 py-1">
            {modeName(round.mode)} · {names[round.bidder]}
          </span>
        )}
        <span aria-label={round.trump ? `Tromf: ${SUIT_NAMES[round.trump]}` : 'Fără tromf'} className="flex items-center gap-1 rounded bg-stone-900/70 px-2 py-1">
          Tromf:
          {round.trumpCard ? (
            <span className="font-semibold">{cardName(round.trumpCard)}</span>
          ) : round.trump ? (
            <SuitIcon suit={round.trump} className="h-4 w-4" />
          ) : (
            <span>—</span>
          )}
        </span>
        <span className="rounded bg-stone-900/70 px-2 py-1 tabular-nums">
          Runda: A {round.points.A} · B {round.points.B}
        </span>
      </div>

      <section aria-label="Masa" className={`grid grid-cols-3 grid-rows-3 place-items-center gap-1 ${showingLast ? 'opacity-50' : ''}`}>
        {plays.map((play) => (
          <div key={`${play.seat}-${play.card.suit}-${play.card.rank}`} className={SLOT[positionOf(play.seat, viewer)]}>
            <PlayingCard card={play.card} size="md" />
          </div>
        ))}
      </section>
      {showingLast && <span className="text-xs text-stone-400">Ultima mână</span>}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/table/MyArea.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { Bid, Card, PublicState } from '@/lib/game';
import { sameCard } from '@/lib/game';
import type { HandRow } from '@/lib/client/use-room';
import { api } from '@/lib/client/api';
import type { PlayerActionInput } from '@/lib/server/schemas';
import { PlayingCard } from '@/components/cards/PlayingCard';
import { SuitIcon } from '@/components/cards/SuitIcon';
import { bidLabel, cardName } from '@/lib/ui/format';

interface MyAreaProps {
  code: string;
  view: PublicState;
  hand: HandRow;
  secondsLeft: number | null;
}

export function MyArea({ code, view, hand, secondsLeft }: MyAreaProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState<Card | null>(null);
  const moves = hand.moves;
  const myTurn = moves.bids.length > 0 || moves.cards.length > 0;

  async function send(action: PlayerActionInput) {
    setBusy(true);
    setError(null);
    setDeclaring(null);
    try {
      await api.act(code, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mutarea nu a fost acceptată.');
    } finally {
      setBusy(false);
    }
  }

  function onCard(card: Card) {
    if (moves.declarable.some((d) => sameCard(d, card))) setDeclaring(card);
    else void send({ type: 'play', card });
  }

  const simpleBids = moves.bids.filter((b) => b.kind !== 'tromf');
  const tromfBids = moves.bids.filter((b): b is Extract<Bid, { kind: 'tromf' }> => b.kind === 'tromf');
  const declarePoints = declaring && view.round.trump === declaring.suit ? 40 : 20;

  return (
    <div className="flex flex-col items-center gap-3">
      {myTurn && (
        <p className="text-sm font-semibold text-amber-300" aria-live="polite">
          E rândul tău{secondsLeft !== null ? ` · ${secondsLeft}s` : ''}
        </p>
      )}

      {moves.bids.length > 0 && (
        <div role="group" aria-label="Licitație" className="flex flex-wrap items-center justify-center gap-2">
          {simpleBids.map((b) => (
            <button
              key={b.kind}
              type="button"
              disabled={busy}
              onClick={() => void send({ type: 'bid', bid: b })}
              className={`rounded-md px-4 py-2 font-semibold ${b.kind === 'pass' ? 'bg-stone-200 text-stone-900' : 'bg-amber-500 text-stone-900'} disabled:opacity-50`}
            >
              {bidLabel(b)}
            </button>
          ))}
          {tromfBids.length > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-stone-900/70 px-2 py-1 text-sm">
              Tromful tău:
              {tromfBids.map((b) => (
                <button
                  key={b.suit}
                  type="button"
                  disabled={busy}
                  aria-label={bidLabel(b)}
                  onClick={() => void send({ type: 'bid', bid: b })}
                  className="rounded bg-amber-50 p-1 disabled:opacity-50"
                >
                  <SuitIcon suit={b.suit} className="h-6 w-6" />
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {declaring && (
        <div role="dialog" aria-label="Strigare" className="flex flex-wrap items-center justify-center gap-2 rounded-md bg-stone-900/80 px-3 py-2 text-sm">
          Strigi {declarePoints} cu {cardName(declaring)}?
          <button type="button" className="rounded bg-amber-500 px-3 py-1 font-semibold text-stone-900" onClick={() => void send({ type: 'play', card: declaring, declare: true })}>
            Da, strig
          </button>
          <button type="button" className="rounded bg-stone-200 px-3 py-1 font-semibold text-stone-900" onClick={() => void send({ type: 'play', card: declaring })}>
            Nu
          </button>
          <button type="button" className="px-2 text-stone-400" onClick={() => setDeclaring(null)}>
            Renunță
          </button>
        </div>
      )}

      <div role="group" aria-label="Mâna ta" className="flex flex-wrap justify-center gap-2">
        {hand.cards.map((card) => {
          const playable = !busy && moves.cards.some((c) => sameCard(c, card));
          return (
            <PlayingCard
              key={`${card.suit}-${card.rank}`}
              card={card}
              size="lg"
              playable={playable}
              dimmed={moves.cards.length > 0 && !playable}
              onClick={() => onCard(card)}
            />
          );
        })}
      </div>

      {moves.canStop && (
        <button type="button" disabled={busy} onClick={() => void send({ type: 'stop' })} className="rounded-md bg-red-600 px-4 py-2 font-semibold disabled:opacity-50">
          Stop (am 66)
        </button>
      )}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/table/EventLog.tsx`**

```tsx
import type { GameEvent } from '@/lib/server/events';
import { describeEvent } from '@/lib/ui/format';

const VISIBLE = 8;

export function EventLog({ log, names }: { log: GameEvent[]; names: string[] }) {
  const recent = log.slice(-VISIBLE).reverse();
  return (
    <section aria-label="Jurnal" className="rounded-xl bg-stone-900/70 p-3 text-sm">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Jurnal</h2>
      <ol className="space-y-0.5">
        {recent.map((event, i) => (
          <li key={log.length - i} className={i === 0 ? 'text-stone-100' : 'text-stone-400'}>
            {describeEvent(event, names)}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 6: Create `components/table/RoundSummary.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { PublicState, Seat } from '@/lib/game';
import { api } from '@/lib/client/api';
import { PlayingCard } from '@/components/cards/PlayingCard';
import { resultText, teamName } from '@/lib/ui/format';

interface RoundSummaryProps {
  code: string;
  view: PublicState;
  names: string[];
  mySeat: Seat | null;
  secondsLeft: number | null;
}

export function RoundSummary({ code, view, names, mySeat, secondsLeft }: RoundSummaryProps) {
  const [error, setError] = useState<string | null>(null);
  const result = view.round.result;
  if (!result || (view.phase !== 'roundOver' && view.phase !== 'matchOver')) return null;
  const matchOver = view.phase === 'matchOver';
  const champion = view.score.A >= view.score.B ? 'A' : 'B';

  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black/50 p-4">
      <div role="dialog" aria-label={matchOver ? 'Meci încheiat' : 'Rezultatul rundei'} className="flex max-w-lg flex-col gap-3 rounded-2xl bg-stone-50 p-6 text-stone-900 shadow-2xl">
        <h2 className="text-2xl font-bold">{matchOver ? `${teamName(champion)} a câștigat meciul!` : 'Runda s-a încheiat'}</h2>
        <p>{resultText(result, names)}</p>
        {result.revealed && (
          <div className="flex flex-col gap-2">
            {result.revealed.map((r) => (
              <div key={r.seat} className="flex items-center gap-2">
                <span className="w-20 text-sm font-semibold">{names[r.seat]}</span>
                {r.cards.map((card) => (
                  <PlayingCard key={`${card.suit}-${card.rank}`} card={card} size="sm" />
                ))}
              </div>
            ))}
          </div>
        )}
        <p className="text-lg font-semibold tabular-nums">
          Scor: Echipa A {view.score.A} – {view.score.B} Echipa B
        </p>
        {matchOver ? (
          mySeat !== null && (
            <button
              type="button"
              className="rounded-md bg-amber-500 px-4 py-2 font-semibold"
              onClick={() => {
                setError(null);
                api.rematch(code).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Nu am putut porni meciul.'));
              }}
            >
              Încă un meci
            </button>
          )
        ) : (
          <p className="text-sm text-stone-600">Runda următoare în {secondsLeft ?? 0}s…</p>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `components/table/Table.tsx`**

```tsx
'use client';

import type { Seat } from '@/lib/game';
import { useNow } from '@/lib/client/use-now';
import type { ReadyRoom } from '@/lib/client/use-room';
import { SEATS, positionOf, seatNames, type Position } from '@/lib/ui/seats';
import { CenterArea } from './CenterArea';
import { EventLog } from './EventLog';
import { MyArea } from './MyArea';
import { PlayerSeat } from './PlayerSeat';
import { RoundSummary } from './RoundSummary';
import { ScoreBar } from './ScoreBar';

const SEAT_SLOT: Record<Position, string> = {
  top: 'col-start-2 row-start-1',
  left: 'col-start-1 row-start-2',
  right: 'col-start-3 row-start-2',
  bottom: 'col-start-2 row-start-3',
};
const MOVE_SECONDS = { bidding: 20, playing: 30 } as const;

export function Table({ room }: { room: ReadyRoom }) {
  const now = useNow();
  const { data, userId, online } = room;
  const game = data.game;
  if (!game) return <p className="p-8 text-center">Se pregătește jocul…</p>;

  const view = game.view;
  const round = view.round;
  const names = seatNames(data.players);
  const mySeat: Seat | null = data.players.find((p) => p.user_id === userId)?.seat ?? null;
  const msLeft = game.deadline ? Math.max(0, new Date(game.deadline).getTime() - now) : null;
  const secondsLeft = msLeft === null ? null : Math.ceil(msLeft / 1000);
  const total = view.phase === 'bidding' || view.phase === 'playing' ? MOVE_SECONDS[view.phase] : null;
  const turnActive = view.phase === 'bidding' || view.phase === 'playing';

  return (
    <div className="relative flex flex-1 flex-col gap-3">
      <ScoreBar view={view} names={names} />
      <div className="grid flex-1 grid-cols-[1fr_2fr_1fr] grid-rows-[auto_1fr_auto] items-center gap-2">
        {SEATS.filter((seat) => seat !== mySeat).map((seat) => {
          const player = data.players.find((p) => p.seat === seat);
          return (
            <div key={seat} className={`${SEAT_SLOT[positionOf(seat, mySeat)]} flex justify-center`}>
              <PlayerSeat
                name={names[seat]}
                team={seat % 2 === 0 ? 'A' : 'B'}
                cardCount={round.handCounts[seat]}
                isTurn={turnActive && round.turn === seat}
                isDealer={round.dealer === seat}
                offline={player ? !online.has(player.user_id) : true}
                sittingOut={!round.active.includes(seat)}
                bid={round.bids.find((b) => b.seat === seat)?.bid ?? null}
                timeLeft={turnActive && round.turn === seat && msLeft !== null && total ? msLeft / (total * 1000) : null}
                secondsLeft={secondsLeft}
              />
            </div>
          );
        })}
        <div className="col-start-2 row-start-2">
          <CenterArea view={view} names={names} viewer={mySeat} />
        </div>
      </div>

      {data.hand && mySeat !== null && (
        <MyArea code={data.room.code} view={view} hand={data.hand} secondsLeft={turnActive && round.turn === mySeat ? secondsLeft : null} />
      )}
      <EventLog log={game.log} names={names} />
      <RoundSummary code={data.room.code} view={view} names={names} mySeat={mySeat} secondsLeft={secondsLeft} />
    </div>
  );
}
```

- [ ] **Step 8: Verify in the browser.** Run `npm run dev` and play with 4 windows, as in Task 4. Check all of the following:
  - **Hands:** 3 cards each, then 5 after everyone says "Pas".
  - **Trump:** the dealer's trump card appears in the center info.
  - **Bidding:** only the player on turn sees the bidding panel, which always includes "Pas".
  - **Timer:** the timer bar counts down, and after 20 s the server passes automatically.
  - **Playing:** only legal cards are clickable. A 3 or 4 with its pair asks "Strigi 20/40…?".
  - **Tricks:** the trick appears for everyone and "Ultima mână" shows after a trick.
  - **Stop:** the Stop button appears after the first trick.
  - **Round end:** the round summary shows for 5 s, then the next round is dealt.
  - **Contracts:** Adunare reveals the cards, and the partner is marked "stă" in contracts.
  - **Match end:** the match-over dialog offers "Încă un meci".

  Also check a narrow landscape window (e.g. 800×400). Then run `npm run typecheck && npm run lint && npm run build`.

- [ ] **Step 9: Commit**

```bash
git add components
git commit -m "feat: add the game table UI"
```

---

### Task 6: End-to-end test with 4 browsers

**Needs permission from the user:** Playwright downloads a Chromium build (~150 MB). Ask before Step 1.

**Files:**
- Create: `playwright.config.ts`, `e2e/game.spec.ts`
- Modify: `package.json` (script `e2e`), `.gitignore` (Playwright output), `tsconfig.json`/`eslint.config.mjs` only if needed so `e2e/` typechecks and lints

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

Add `"e2e": "playwright test"` to `package.json` scripts. Add `/test-results/` and `/playwright-report/` to `.gitignore`.

- [ ] **Step 3: Create `e2e/game.spec.ts`**

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';

const NAMES = ['Ana', 'Bogdan', 'Cristi', 'Dana'];

/** Polls all pages until `pick(page)` is visible on one of them; returns that page. */
async function pageWith(pages: Page[], pick: (page: Page) => Locator, timeout = 30_000): Promise<Page> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const page of pages) {
      if (await pick(page).first().isVisible()) return page;
    }
    await pages[0].waitForTimeout(200);
  }
  throw new Error('No page reached the expected state');
}

const hand = (page: Page) => page.getByRole('group', { name: 'Mâna ta' }).getByRole('button');
const passButton = (page: Page) => page.getByRole('group', { name: 'Licitație' }).getByRole('button', { name: 'Pas' });

test('four players meet, bid, play a card and chat', async ({ browser }) => {
  const contexts = await Promise.all(NAMES.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [host, ...guests] = pages;

  await host.goto('/');
  await host.getByLabel('Numele tău').fill(NAMES[0]);
  await host.getByRole('button', { name: 'Creează cameră' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{4}$/);
  const roomUrl = host.url();

  for (const [i, page] of guests.entries()) {
    await page.goto(roomUrl);
    await page.getByLabel('Numele tău').fill(NAMES[i + 1]);
    await page.getByRole('button', { name: 'Continuă' }).click();
  }

  for (const [i, page] of pages.entries()) {
    await page.getByRole('button', { name: new RegExp(`^Locul ${i + 1}`) }).click();
    await expect(page.getByRole('button', { name: new RegExp(`^Locul ${i + 1}.*${NAMES[i]}`) })).toBeVisible();
  }

  for (const page of pages) await expect(hand(page)).toHaveCount(3, { timeout: 30_000 });

  // Everyone passes → normal game with 5 cards each.
  for (let i = 0; i < 4; i++) {
    const bidder = await pageWith(pages, passButton);
    await passButton(bidder).click();
    await expect(passButton(bidder)).toBeHidden();
  }
  for (const page of pages) await expect(hand(page)).toHaveCount(5, { timeout: 30_000 });

  // The first player plays a legal card; everyone sees it on the table.
  const leader = await pageWith(pages, (page) => hand(page).and(page.locator(':enabled')));
  await hand(leader).and(leader.locator(':enabled')).first().click();
  const declare = leader.getByRole('dialog', { name: 'Strigare' });
  if (await declare.isVisible()) await declare.getByRole('button', { name: 'Nu' }).click();
  for (const page of pages) {
    await expect(page.getByRole('region', { name: 'Masa' }).getByRole('img')).toHaveCount(1, { timeout: 15_000 });
  }
  await expect(hand(leader)).toHaveCount(4);

  // Chat reaches the other players.
  await host.getByLabel('Mesaj').fill('Noroc la toți!');
  await host.getByRole('button', { name: 'Trimite' }).click();
  for (const page of guests) await expect(page.getByText('Noroc la toți!')).toBeVisible({ timeout: 15_000 });

  await Promise.all(contexts.map((context) => context.close()));
});
```

- [ ] **Step 4: Run it**

Run: `npm run e2e`
Expected: 1 passed. It uses the real Supabase project from `.env.local` and starts or reuses the dev server. If it fails, open the trace with `npx playwright show-trace` and fix the UI or the test selectors. Never weaken what is being checked.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json .gitignore
git commit -m "test: add 4-browser end-to-end game test"
```

---

### Task 7: Deploy to Vercel (USER + agent)

Implementer agents must not log in or enter keys; these steps are for the user.

- [ ] **Step 1 (user):** Log in and link the project. Accept the defaults; the framework is Next.js.

```bash
npx vercel login
```
```bash
npx vercel link
```

- [ ] **Step 2 (user):** In the Vercel dashboard, open **Project → Settings → Environment Variables**. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (same values as `.env.local`) for Production and Preview.

- [ ] **Step 3 (user or agent, after steps 1–2):** Deploy.

```bash
npx vercel --prod
```

- [ ] **Step 4 (agent):** Smoke-check production. Run the Plan 2 smoke script against the production URL:

```bash
SMOKE_BASE_URL=https://<your-app>.vercel.app npx tsx --env-file=.env.local scripts/smoke-match.ts
```

Also open the site in a browser and create a room.

---

## Done criteria for Plan 3

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm run e2e` pass.
- Four people can play a full match in the browser, with chat, timers, automatic moves, the round summary and rematch.
- The site is deployed on Vercel.
