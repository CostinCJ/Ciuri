# Ciuri — Plan 1: Game Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js project and build the pure TypeScript rules engine for Ciuri (`lib/game/`), fully covered by Vitest tests.

**Architecture:** `lib/game` is a pure, dependency-free module. The whole game is a serialisable `GameState` object. `applyAction(state, action, rng)` validates an action and returns a new state; it throws `IllegalActionError` on illegal moves. Helper views (`legalMoves`, `timeoutAction`, `publicView`) are what the server (Plan 2) and UI (Plan 3) will consume.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind, ESLint), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-ciuri-design.md` (section 1 = rules). Follow-up plans: Plan 2 (Supabase + API), Plan 3 (UI + e2e).

**Domain glossary (Romanian names used in code):**
- Suits: `rosu`, `verde`, `ghinda`, `duba`. Ranks = point values: 2 (doiul), 3 (treiul), 4 (patrul), 10, 11 (as). Ordering by rank number is also card strength.
- Seats 0–3, clockwise. Team A = seats 0 & 2, team B = seats 1 & 3. "First player" = seat after the dealer.
- Contracts (`Mode`): `ciuri`, `adunare`, `tromf` (Tromful tău), `mare`, `mica`; `normal` when everyone passes.
- Strigare (declaration) = leading a 3 or 4 while holding its pair: 20 points, 40 if trump suit.

## File structure

| File | Responsibility |
|---|---|
| `lib/game/types.ts` | All types + `IllegalActionError` |
| `lib/game/cards.ts` | Deck, shuffle, seats/teams helpers, card helpers |
| `lib/game/play.ts` | `trickWinner`, `legalCards` (card-play obligations) |
| `lib/game/bidding.ts` | Bid values, legal bids, bidding completion, winning bid |
| `lib/game/engine.ts` | `createMatch`, `dealRound`, `applyAction`, round flow & scoring |
| `lib/game/views.ts` | `pendingSeat`, `legalMoves`, `timeoutAction`, `publicView` |
| `lib/game/index.ts` | Public exports |
| `lib/game/__tests__/helpers.ts` | Test deck builder, action shortcuts, seeded RNG |
| `lib/game/__tests__/*.test.ts` | Tests |

---

### Task 1: Scaffold Next.js + Vitest

**Files:**
- Delete: `README.md` (7-byte placeholder; blocks `create-next-app` in a non-empty dir)
- Create: Next.js project files in repo root, `vitest.config.ts`
- Modify: `package.json` (add `test` script)

- [ ] **Step 1: Remove placeholder README and scaffold**

```bash
rm README.md
npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
```
Expected: project created, `npm run dev` script exists. If it complains about conflicting files, list them and move them aside temporarily (`docs/` is allowed).

- [ ] **Step 2: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Add scripts to `package.json`** — in `"scripts"` add:

```json
"test": "vitest run",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Verify tooling**

Run: `npm run typecheck && npm run lint && npx vitest run --passWithNoTests`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

### Task 2: Types and card helpers

**Files:**
- Create: `lib/game/types.ts`, `lib/game/cards.ts`
- Test: `lib/game/__tests__/cards.test.ts`

- [ ] **Step 1: Create `lib/game/types.ts`** (types only, no logic to test)

```ts
export const SUITS = ['rosu', 'verde', 'ghinda', 'duba'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [2, 3, 4, 10, 11] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Seat = 0 | 1 | 2 | 3;
export type Team = 'A' | 'B';

export type Bid =
  | { kind: 'pass' }
  | { kind: 'ciuri' }
  | { kind: 'adunare' }
  | { kind: 'mare' }
  | { kind: 'mica' }
  | { kind: 'tromf'; suit: Suit };

export type ContractBid = Exclude<Bid, { kind: 'pass' }>;
export type ContractKind = ContractBid['kind'];
export type Mode = 'normal' | ContractKind;

export interface TrickPlay {
  seat: Seat;
  card: Card;
}

export interface RoundResult {
  winner: Team;
  points: number;
  reason: 'normal' | 'stop' | 'contract-made' | 'contract-failed';
  mode: Mode;
  bidder: Seat | null;
  stopBy?: Seat;
  adunareSum?: number;
  revealed?: { seat: Seat; cards: Card[] }[];
}

export interface Round {
  dealer: Seat;
  /** index = seat */
  hands: Card[][];
  /** 8 cards left after the first deal; seat at offset k from first player owns stock[2k..2k+1] */
  stock: Card[];
  bids: { seat: Seat; bid: Bid }[];
  mode: Mode;
  bidder: Seat | null;
  trump: Suit | null;
  trumpCard: Card | null;
  /** seats taking part in card play, clockwise order does not matter */
  active: Seat[];
  turn: Seat;
  leader: Seat;
  trick: TrickPlay[];
  lastTrick: TrickPlay[] | null;
  lastTrickWinner: Seat | null;
  tricksTaken: Record<Team, number>;
  /** card points + declarations */
  points: Record<Team, number>;
  declared: { seat: Seat; suit: Suit; points: number }[];
  tricksPlayed: number;
  result: RoundResult | null;
}

export type Phase = 'bidding' | 'playing' | 'roundOver' | 'matchOver';

export interface GameState {
  phase: Phase;
  score: Record<Team, number>;
  roundNumber: number;
  round: Round;
}

export type Action =
  | { type: 'bid'; seat: Seat; bid: Bid }
  | { type: 'play'; seat: Seat; card: Card; declare?: boolean }
  | { type: 'stop'; seat: Seat }
  | { type: 'nextRound' };

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}
```

- [ ] **Step 2: Write the failing test `lib/game/__tests__/cards.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  fullDeck, marriageSuit, nextSeat, otherTeam, partnerOf, removeCard,
  sameCard, seatsFrom, shuffle, sumPoints, teamOf,
} from '../cards';
import type { Card, Rank, Suit } from '../types';

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });

describe('cards', () => {
  it('builds a 20-card deck worth 120 points with unique cards', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(20);
    expect(sumPoints(deck)).toBe(120);
    const ids = new Set(deck.map((x) => `${x.suit}-${x.rank}`));
    expect(ids.size).toBe(20);
  });

  it('shuffle keeps the same cards and is deterministic for a given rng', () => {
    const rng = () => 0.3;
    const a = shuffle(fullDeck(), rng);
    const b = shuffle(fullDeck(), rng);
    expect(a).toEqual(b);
    expect(sumPoints(a)).toBe(120);
    expect(a).toHaveLength(20);
  });

  it('maps seats to teams, partners and clockwise order', () => {
    expect(teamOf(0)).toBe('A');
    expect(teamOf(1)).toBe('B');
    expect(teamOf(2)).toBe('A');
    expect(teamOf(3)).toBe('B');
    expect(otherTeam('A')).toBe('B');
    expect(partnerOf(1)).toBe(3);
    expect(nextSeat(3)).toBe(0);
    expect(seatsFrom(2)).toEqual([2, 3, 0, 1]);
  });

  it('finds a marriage (3 + 4 of the same suit)', () => {
    expect(marriageSuit([c('verde', 3), c('rosu', 11), c('verde', 4)])).toBe('verde');
    expect(marriageSuit([c('verde', 3), c('rosu', 4), c('verde', 11)])).toBeNull();
  });

  it('compares and removes cards', () => {
    expect(sameCard(c('duba', 10), c('duba', 10))).toBe(true);
    expect(sameCard(c('duba', 10), c('rosu', 10))).toBe(false);
    expect(removeCard([c('duba', 10), c('rosu', 2)], c('duba', 10))).toEqual([c('rosu', 2)]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/game/__tests__/cards.test.ts`
Expected: FAIL — cannot resolve `../cards`.

- [ ] **Step 4: Create `lib/game/cards.ts`**

```ts
import { RANKS, SUITS, type Card, type Seat, type Suit, type Team } from './types';

export function fullDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

export function shuffle(cards: Card[], rng: () => number = Math.random): Card[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function removeCard(hand: Card[], card: Card): Card[] {
  const index = hand.findIndex((x) => sameCard(x, card));
  return index === -1 ? hand : [...hand.slice(0, index), ...hand.slice(index + 1)];
}

/** Rank equals the card's point value. */
export function sumPoints(cards: Card[]): number {
  return cards.reduce((total, card) => total + card.rank, 0);
}

export function teamOf(seat: Seat): Team {
  return seat % 2 === 0 ? 'A' : 'B';
}

export function otherTeam(team: Team): Team {
  return team === 'A' ? 'B' : 'A';
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

/** All four seats clockwise, starting with `start`. */
export function seatsFrom(start: Seat): Seat[] {
  return [0, 1, 2, 3].map((k) => ((start + k) % 4) as Seat);
}

export function marriageSuit(hand: Card[]): Suit | null {
  const has = (suit: Suit, rank: 3 | 4) => hand.some((x) => x.suit === suit && x.rank === rank);
  return SUITS.find((suit) => has(suit, 3) && has(suit, 4)) ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/game/__tests__/cards.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/game
git commit -m "feat: add Ciuri card types and deck helpers"
```

---

### Task 3: Trick rules (who wins, what may be played)

Spec §1.5 (trump games) and §1.9 (Mare/Mica: follow suit only).

**Files:**
- Create: `lib/game/play.ts`
- Test: `lib/game/__tests__/play.test.ts`

- [ ] **Step 1: Write the failing test `lib/game/__tests__/play.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { legalCards, trickWinner } from '../play';
import type { Card, Rank, Seat, Suit, TrickPlay } from '../types';

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });
const t = (...cards: Card[]): TrickPlay[] => cards.map((card, i) => ({ seat: i as Seat, card }));

describe('trickWinner', () => {
  it('highest card of the led suit wins without trumps', () => {
    expect(trickWinner(t(c('rosu', 10), c('rosu', 11), c('duba', 11)), 'verde').seat).toBe(1);
  });
  it('any trump beats the led suit', () => {
    expect(trickWinner(t(c('rosu', 11), c('verde', 2)), 'verde').seat).toBe(1);
  });
  it('highest trump wins', () => {
    expect(trickWinner(t(c('rosu', 11), c('verde', 2), c('verde', 10)), 'verde').seat).toBe(2);
  });
  it('off-suit cards never win when there is no trump', () => {
    expect(trickWinner(t(c('rosu', 3), c('duba', 11)), null).seat).toBe(0);
  });
});

describe('legalCards (strict, trump game)', () => {
  const trump = 'verde';
  it('leader may play anything', () => {
    const hand = [c('rosu', 2), c('verde', 3)];
    expect(legalCards(hand, [], trump, true)).toEqual(hand);
  });
  it('must follow suit and beat when possible', () => {
    expect(legalCards([c('rosu', 2), c('rosu', 11), c('verde', 3)], t(c('rosu', 10)), trump, true))
      .toEqual([c('rosu', 11)]);
  });
  it('must follow suit even when unable to beat', () => {
    expect(legalCards([c('rosu', 2), c('rosu', 3), c('verde', 3)], t(c('rosu', 10)), trump, true))
      .toEqual([c('rosu', 2), c('rosu', 3)]);
  });
  it('after the trick is trumped, any card of the led suit is allowed', () => {
    expect(legalCards([c('rosu', 2), c('rosu', 11)], t(c('rosu', 10), c('verde', 2)), trump, true))
      .toEqual([c('rosu', 2), c('rosu', 11)]);
  });
  it('must trump when void in the led suit', () => {
    expect(legalCards([c('duba', 2), c('verde', 3)], t(c('rosu', 10)), trump, true))
      .toEqual([c('verde', 3)]);
  });
  it('must over-trump when possible', () => {
    expect(legalCards([c('verde', 3), c('verde', 11), c('duba', 2)], t(c('rosu', 10), c('verde', 4)), trump, true))
      .toEqual([c('verde', 11)]);
  });
  it('must still trump when unable to over-trump', () => {
    expect(legalCards([c('verde', 3), c('duba', 2)], t(c('rosu', 10), c('verde', 4)), trump, true))
      .toEqual([c('verde', 3)]);
  });
  it('anything goes with neither the led suit nor trumps', () => {
    const hand = [c('duba', 2), c('ghinda', 3)];
    expect(legalCards(hand, t(c('rosu', 10)), trump, true)).toEqual(hand);
  });
});

describe('legalCards (non-strict, Mare/Mica)', () => {
  it('must follow suit but need not beat', () => {
    expect(legalCards([c('rosu', 2), c('rosu', 11), c('verde', 3)], t(c('rosu', 10)), null, false))
      .toEqual([c('rosu', 2), c('rosu', 11)]);
  });
  it('anything when void', () => {
    const hand = [c('duba', 2), c('verde', 3)];
    expect(legalCards(hand, t(c('rosu', 10)), null, false)).toEqual(hand);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/game/__tests__/play.test.ts`
Expected: FAIL — cannot resolve `../play`.

- [ ] **Step 3: Create `lib/game/play.ts`**

```ts
import type { Card, Suit, TrickPlay } from './types';

function beats(card: Card, best: Card, trump: Suit | null): boolean {
  if (card.suit === best.suit) return card.rank > best.rank;
  // Different suits: only a trump can beat the current best (which is then not a trump).
  return trump !== null && card.suit === trump;
}

export function trickWinner(trick: TrickPlay[], trump: Suit | null): TrickPlay {
  let best = trick[0];
  for (const play of trick.slice(1)) {
    if (beats(play.card, best.card, trump)) best = play;
  }
  return best;
}

/**
 * Cards a player may play into `trick`.
 * strict = trump-game obligations (follow, beat, trump, over-trump); otherwise only follow suit.
 */
export function legalCards(hand: Card[], trick: TrickPlay[], trump: Suit | null, strict: boolean): Card[] {
  if (trick.length === 0) return hand;
  const led = trick[0].card.suit;
  const follow = hand.filter((x) => x.suit === led);
  if (!strict) return follow.length > 0 ? follow : hand;

  const winning = trickWinner(trick, trump).card;
  if (follow.length > 0) {
    if (winning.suit !== led) return follow;
    const higher = follow.filter((x) => x.rank > winning.rank);
    return higher.length > 0 ? higher : follow;
  }
  const trumps = trump === null ? [] : hand.filter((x) => x.suit === trump);
  if (trumps.length > 0) {
    if (winning.suit !== trump) return trumps;
    const higher = trumps.filter((x) => x.rank > winning.rank);
    return higher.length > 0 ? higher : trumps;
  }
  return hand;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/game/__tests__/play.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/game
git commit -m "feat: add trick winner and card-play obligations"
```

---

### Task 4: Bidding rules

Spec §1.4. Bids happen on the first 3 cards; each seat speaks once starting with the first player; a bid must be strictly higher than the current highest; Mare/Mica/Tromful tău only for the first player; Ciuri only with a marriage; bidding ends after 4 bids or as soon as a 12-point bid is made.

**Files:**
- Create: `lib/game/bidding.ts`, `lib/game/engine.ts` (only `dealRound` for now), `lib/game/__tests__/helpers.ts`
- Test: `lib/game/__tests__/bidding.test.ts`

- [ ] **Step 1: Create a minimal `lib/game/engine.ts` with `dealRound`** (needed by test helpers; the rest of the engine comes in Task 5)

```ts
import { nextSeat, seatsFrom } from './cards';
import type { Card, Round, Seat } from './types';

/** Deals 3 cards to each seat starting with the first player; the other 8 cards stay in the stock. */
export function dealRound(dealer: Seat, deck: Card[]): Round {
  const first = nextSeat(dealer);
  const hands: Card[][] = [[], [], [], []];
  seatsFrom(first).forEach((seat, k) => {
    hands[seat] = deck.slice(3 * k, 3 * k + 3);
  });
  return {
    dealer,
    hands,
    stock: deck.slice(12),
    bids: [],
    mode: 'normal',
    bidder: null,
    trump: null,
    trumpCard: null,
    active: [0, 1, 2, 3],
    turn: first,
    leader: first,
    trick: [],
    lastTrick: null,
    lastTrickWinner: null,
    tricksTaken: { A: 0, B: 0 },
    points: { A: 0, B: 0 },
    declared: [],
    tricksPlayed: 0,
    result: null,
  };
}
```

- [ ] **Step 2: Create `lib/game/__tests__/helpers.ts`**

```ts
import { fullDeck, sameCard, seatsFrom, nextSeat } from '../cards';
import { dealRound } from '../engine';
import type { Card, GameState, Rank, Seat, Suit } from '../types';

export const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });

type Hands = Partial<Record<Seat, Card[]>>;

/**
 * Builds a 20-card deck so that `first[seat]` are the seat's first 3 cards and
 * `second[seat]` its 2 extra cards. Unspecified slots are filled from the remaining deck.
 */
export function buildDeck(dealer: Seat, first: Hands, second: Hands = {}): Card[] {
  const order = seatsFrom(nextSeat(dealer));
  const used = order.flatMap((seat) => [...(first[seat] ?? []), ...(second[seat] ?? [])]);
  const rest = fullDeck().filter((x) => !used.some((u) => sameCard(u, x)));
  const deck: Card[] = [];
  for (const seat of order) {
    const h = first[seat] ?? [];
    deck.push(...h, ...rest.splice(0, 3 - h.length));
  }
  for (const seat of order) {
    const h = second[seat] ?? [];
    deck.push(...h, ...rest.splice(0, 2 - h.length));
  }
  return deck;
}

export function stateWith(dealer: Seat, first: Hands, second: Hands = {}): GameState {
  return {
    phase: 'bidding',
    score: { A: 0, B: 0 },
    roundNumber: 1,
    round: dealRound(dealer, buildDeck(dealer, first, second)),
  };
}

/** Deterministic PRNG for reproducible tests. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 3: Write the failing test `lib/game/__tests__/bidding.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { bidValue, biddingDone, legalBids, sameBid, winningBid } from '../bidding';
import type { Bid } from '../types';
import { c, stateWith } from './helpers';

const kinds = (bids: Bid[]) => bids.map((b) => (b.kind === 'tromf' ? `tromf:${b.suit}` : b.kind));

describe('bidding', () => {
  it('values contracts', () => {
    expect(bidValue({ kind: 'pass' })).toBe(0);
    expect(bidValue({ kind: 'mica' })).toBe(4);
    expect(bidValue({ kind: 'mare' })).toBe(6);
    expect(bidValue({ kind: 'tromf', suit: 'rosu' })).toBe(6);
    expect(bidValue({ kind: 'ciuri' })).toBe(12);
    expect(bidValue({ kind: 'adunare' })).toBe(12);
  });

  it('first player may bid everything; ciuri only with a marriage', () => {
    const s = stateWith(0, { 1: [c('verde', 3), c('verde', 4), c('rosu', 2)] });
    expect(kinds(legalBids(s.round, 1))).toEqual([
      'pass', 'ciuri', 'adunare', 'mare', 'mica',
      'tromf:rosu', 'tromf:verde', 'tromf:ghinda', 'tromf:duba',
    ]);
  });

  it('other players may only bid ciuri/adunare, and ciuri needs a marriage', () => {
    const s = stateWith(0, { 2: [c('verde', 3), c('rosu', 4), c('rosu', 2)] });
    s.round.bids.push({ seat: 1, bid: { kind: 'pass' } });
    expect(kinds(legalBids(s.round, 2))).toEqual(['pass', 'adunare']);
  });

  it('a bid must be strictly higher than the current highest', () => {
    const s = stateWith(0, {});
    s.round.bids.push({ seat: 1, bid: { kind: 'mare' } });
    expect(kinds(legalBids(s.round, 2))).toEqual(['pass', 'adunare']);
    s.round.bids.push({ seat: 2, bid: { kind: 'adunare' } });
    expect(kinds(legalBids(s.round, 3))).toEqual(['pass']);
  });

  it('ends after four bids or immediately after a 12-point bid', () => {
    const s = stateWith(0, {});
    s.round.bids.push({ seat: 1, bid: { kind: 'mica' } });
    expect(biddingDone(s.round)).toBe(false);
    s.round.bids.push({ seat: 2, bid: { kind: 'adunare' } });
    expect(biddingDone(s.round)).toBe(true);
  });

  it('picks the highest bid, earliest on ties', () => {
    expect(winningBid([
      { seat: 1, bid: { kind: 'mica' } },
      { seat: 2, bid: { kind: 'adunare' } },
      { seat: 3, bid: { kind: 'pass' } },
    ])).toEqual({ seat: 2, bid: { kind: 'adunare' } });
    expect(winningBid([{ seat: 1, bid: { kind: 'pass' } }])).toBeNull();
  });

  it('compares bids including the tromf suit', () => {
    expect(sameBid({ kind: 'tromf', suit: 'rosu' }, { kind: 'tromf', suit: 'rosu' })).toBe(true);
    expect(sameBid({ kind: 'tromf', suit: 'rosu' }, { kind: 'tromf', suit: 'duba' })).toBe(false);
    expect(sameBid({ kind: 'mare' }, { kind: 'mica' })).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run lib/game/__tests__/bidding.test.ts`
Expected: FAIL — cannot resolve `../bidding`.

- [ ] **Step 5: Create `lib/game/bidding.ts`**

```ts
import { marriageSuit, nextSeat } from './cards';
import { SUITS, type Bid, type ContractBid, type Round, type Seat } from './types';

export const MAX_BID_VALUE = 12;

export function bidValue(bid: Bid): number {
  switch (bid.kind) {
    case 'pass':
      return 0;
    case 'mica':
      return 4;
    case 'mare':
    case 'tromf':
      return 6;
    case 'ciuri':
    case 'adunare':
      return 12;
  }
}

function highestValue(round: Round): number {
  return round.bids.reduce((max, b) => Math.max(max, bidValue(b.bid)), 0);
}

export function legalBids(round: Round, seat: Seat): Bid[] {
  const candidates: ContractBid[] = [{ kind: 'ciuri' }, { kind: 'adunare' }];
  if (seat === nextSeat(round.dealer)) {
    candidates.push({ kind: 'mare' }, { kind: 'mica' }, ...SUITS.map((suit) => ({ kind: 'tromf' as const, suit })));
  }
  const highest = highestValue(round);
  const allowed = candidates.filter(
    (bid) => bidValue(bid) > highest && (bid.kind !== 'ciuri' || marriageSuit(round.hands[seat]) !== null),
  );
  return [{ kind: 'pass' }, ...allowed];
}

export function sameBid(a: Bid, b: Bid): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'tromf' || (b.kind === 'tromf' && a.suit === b.suit);
}

export function biddingDone(round: Round): boolean {
  return round.bids.length === 4 || highestValue(round) === MAX_BID_VALUE;
}

export function winningBid(bids: Round['bids']): { seat: Seat; bid: ContractBid } | null {
  let best: { seat: Seat; bid: ContractBid } | null = null;
  for (const entry of bids) {
    const bid = entry.bid;
    if (bid.kind === 'pass') continue;
    if (best === null || bidValue(bid) > bidValue(best.bid)) best = { seat: entry.seat, bid };
  }
  return best;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/game/__tests__/bidding.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/game
git commit -m "feat: add bidding rules"
```

---

### Task 5: Engine — normal game, declarations, Stop, match flow

Spec §1.3, §1.6, §1.11, §1.12.

**Files:**
- Modify: `lib/game/engine.ts` (replace whole file)
- Modify: `lib/game/__tests__/helpers.ts` (add action shortcuts)
- Test: `lib/game/__tests__/engine.normal.test.ts`

The fixed deal used below (dealer = seat 0, all 20 cards specified; trump = verde, the dealer's 5th card):

| Seat | First 3 | Extra 2 |
|---|---|---|
| 1 (B) | verde 3, verde 4, rosu 2 | ghinda 3, ghinda 4 |
| 2 (A) | ghinda 11, rosu 10, duba 2 | duba 10, duba 11 |
| 3 (B) | verde 11, rosu 3, duba 3 | verde 10, ghinda 10 |
| 0 (A) | rosu 4, duba 4, ghinda 2 | rosu 11, **verde 2** |

- [ ] **Step 1: Append action shortcuts to `lib/game/__tests__/helpers.ts`**

Add these imports at the top (merge with existing import lines):

```ts
import { applyAction, legalCardsFor } from '../engine';
import type { Bid } from '../types';
```

Add at the bottom:

```ts
export const bid = (s: GameState, seat: Seat, b: Bid): GameState =>
  applyAction(s, { type: 'bid', seat, bid: b });

export const play = (s: GameState, seat: Seat, card: Card, declare = false): GameState =>
  applyAction(s, { type: 'play', seat, card, declare });

export function passAll(s: GameState): GameState {
  let out = s;
  for (const seat of seatsFrom(nextSeat(s.round.dealer))) out = bid(out, seat, { kind: 'pass' });
  return out;
}

/** Plays the first legal card for whoever is on turn until the round ends. */
export function autoplay(s: GameState): GameState {
  let out = s;
  while (out.phase === 'playing') {
    const seat = out.round.turn;
    out = play(out, seat, legalCardsFor(out.round, seat)[0]);
  }
  return out;
}
```

(The final import list of `helpers.ts` must be: `../cards` → `fullDeck, sameCard, seatsFrom, nextSeat`; `../engine` → `applyAction, dealRound, legalCardsFor`; `../types` → `Bid, Card, GameState, Rank, Seat, Suit`.)

- [ ] **Step 2: Write the failing test `lib/game/__tests__/engine.normal.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { applyAction, canStop, createMatch, dealRound, scoreNormal } from '../engine';
import { fullDeck } from '../cards';
import type { GameState } from '../types';
import { c, mulberry32, passAll, play, stateWith } from './helpers';

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
const fresh = (): GameState => passAll(stateWith(0, FIRST, SECOND));

describe('dealing', () => {
  it('deals 3 cards each starting after the dealer', () => {
    const deck = fullDeck();
    const r = dealRound(0, deck);
    expect(r.hands[1]).toEqual(deck.slice(0, 3));
    expect(r.hands[0]).toEqual(deck.slice(9, 12));
    expect(r.stock).toHaveLength(8);
    expect(r.turn).toBe(1);
  });

  it('createMatch starts in bidding with an empty score', () => {
    const s = createMatch(mulberry32(1), 2);
    expect(s.phase).toBe('bidding');
    expect(s.score).toEqual({ A: 0, B: 0 });
    expect(s.round.dealer).toBe(2);
    expect(s.round.turn).toBe(3);
  });
});

describe('normal game (everyone passes)', () => {
  it('deals 2 more cards; trump is the dealer’s last card; first player leads', () => {
    const s = fresh();
    expect(s.phase).toBe('playing');
    expect(s.round.mode).toBe('normal');
    expect(s.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(s.round.trumpCard).toEqual(c('verde', 2));
    expect(s.round.trump).toBe('verde');
    expect(s.round.turn).toBe(1);
  });

  it('rejects playing out of turn and cards not in hand', () => {
    const s = fresh();
    expect(() => play(s, 2, c('duba', 2))).toThrow('Nu e rândul tău');
    expect(() => play(s, 1, c('duba', 2))).toThrow('Carte nepermisă');
  });

  it('declaring a trump marriage gives 40 and only the played card leaves the hand', () => {
    const s = play(fresh(), 1, c('verde', 3), true);
    expect(s.round.points.B).toBe(40);
    expect(s.round.declared).toEqual([{ seat: 1, suit: 'verde', points: 40 }]);
    expect(s.round.hands[1]).toContainEqual(c('verde', 4));
    expect(s.round.hands[1]).toHaveLength(4);
  });

  it('rejects invalid declarations', () => {
    expect(() => play(fresh(), 1, c('rosu', 2), true)).toThrow('Nu poți striga');
    const afterLead = play(fresh(), 1, c('verde', 3));
    expect(() => play(afterLead, 2, c('ghinda', 11), true)).toThrow('Nu poți striga');
  });

  it('enforces follow-suit and resolves the trick to the highest trump', () => {
    let s = play(fresh(), 1, c('verde', 3), true);
    s = play(s, 2, c('ghinda', 11));
    expect(() => play(s, 3, c('rosu', 3))).toThrow('Carte nepermisă');
    s = play(s, 3, c('verde', 11));
    s = play(s, 0, c('verde', 2));
    expect(s.round.tricksPlayed).toBe(1);
    expect(s.round.lastTrickWinner).toBe(3);
    expect(s.round.tricksTaken).toEqual({ A: 0, B: 1 });
    expect(s.round.points.B).toBe(40 + 3 + 11 + 11 + 2);
    expect(s.round.turn).toBe(3);
  });
});

describe('Stop', () => {
  function afterFirstTrick(declare: boolean): GameState {
    let s = play(fresh(), 1, c('verde', 3), declare);
    s = play(s, 2, c('ghinda', 11));
    s = play(s, 3, c('verde', 11));
    return play(s, 0, c('verde', 2));
  }

  it('is not allowed before the first trick or out of turn', () => {
    const s = fresh();
    expect(canStop(s, 1)).toBe(false);
    expect(() => applyAction(s, { type: 'stop', seat: 1 })).toThrow('Nu poți opri acum');
    expect(() => applyAction(afterFirstTrick(true), { type: 'stop', seat: 1 })).toThrow('Nu poți opri acum');
  });

  it('with 66 or more the stopping team gets 3 points', () => {
    const s = applyAction(afterFirstTrick(true), { type: 'stop', seat: 3 });
    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'B', points: 3, reason: 'stop', stopBy: 3 });
    expect(s.score).toEqual({ A: 0, B: 3 });
  });

  it('with less than 66 the other team gets 3 points', () => {
    const s = applyAction(afterFirstTrick(false), { type: 'stop', seat: 3 });
    expect(s.round.result).toMatchObject({ winner: 'A', points: 3, reason: 'stop' });
    expect(s.score).toEqual({ A: 3, B: 0 });
  });

  it('reaching 21 ends the match', () => {
    const s = { ...afterFirstTrick(true), score: { A: 0, B: 19 } };
    const out = applyAction(s, { type: 'stop', seat: 3 });
    expect(out.phase).toBe('matchOver');
    expect(out.score.B).toBe(22);
  });
});

describe('normal game scoring', () => {
  it('3 when opponents took no trick, 2 below 33, 1 from 33 up', () => {
    expect(scoreNormal(0, 0)).toBe(3);
    expect(scoreNormal(0, 20)).toBe(3);
    expect(scoreNormal(1, 32)).toBe(2);
    expect(scoreNormal(2, 33)).toBe(1);
  });

  it('the team taking the last trick wins the round', () => {
    let s = fresh();
    while (s.phase === 'playing') {
      const seat = s.round.turn;
      const hand = s.round.hands[seat];
      // try cards in hand order until a legal one is accepted
      for (const card of hand) {
        try { s = play(s, seat, card); break; } catch { /* illegal, try next */ }
      }
    }
    const r = s.round;
    expect(r.tricksPlayed).toBe(5);
    expect(r.points.A + r.points.B).toBe(120);
    const winnerTeam = r.lastTrickWinner! % 2 === 0 ? 'A' : 'B';
    expect(r.result?.winner).toBe(winnerTeam);
    expect(r.result?.reason).toBe('normal');
  });
});

describe('next round', () => {
  it('rotates the dealer and deals a new round', () => {
    const over = applyAction(
      (() => { let s = play(fresh(), 1, c('verde', 3), true); s = play(s, 2, c('ghinda', 11)); s = play(s, 3, c('verde', 11)); return play(s, 0, c('verde', 2)); })(),
      { type: 'stop', seat: 3 },
    );
    const next = applyAction(over, { type: 'nextRound' }, mulberry32(7));
    expect(next.phase).toBe('bidding');
    expect(next.roundNumber).toBe(2);
    expect(next.round.dealer).toBe(1);
    expect(next.round.turn).toBe(2);
    expect(next.round.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(next.score).toEqual(over.score);
  });

  it('is rejected while a round is in progress', () => {
    expect(() => applyAction(fresh(), { type: 'nextRound' })).toThrow('Acțiunea nu e permisă acum');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/game/__tests__/engine.normal.test.ts`
Expected: FAIL — `applyAction` / `createMatch` not exported.

- [ ] **Step 4: Replace `lib/game/engine.ts` with the full engine**

```ts
import { bidValue, biddingDone, legalBids, sameBid, winningBid } from './bidding';
import {
  fullDeck, marriageSuit, nextSeat, otherTeam, partnerOf, removeCard,
  sameCard, seatsFrom, shuffle, sumPoints, teamOf,
} from './cards';
import { legalCards, trickWinner } from './play';
import {
  IllegalActionError,
  type Action, type Bid, type Card, type GameState, type Phase,
  type Round, type RoundResult, type Seat,
} from './types';

export const WIN_SCORE = 21;
export const TARGET_POINTS = 66;

export function createMatch(rng: () => number = Math.random, firstDealer?: Seat): GameState {
  const dealer = firstDealer ?? (Math.floor(rng() * 4) as Seat);
  return {
    phase: 'bidding',
    score: { A: 0, B: 0 },
    roundNumber: 1,
    round: dealRound(dealer, shuffle(fullDeck(), rng)),
  };
}

/** Deals 3 cards to each seat starting with the first player; the other 8 cards stay in the stock. */
export function dealRound(dealer: Seat, deck: Card[]): Round {
  const first = nextSeat(dealer);
  const hands: Card[][] = [[], [], [], []];
  seatsFrom(first).forEach((seat, k) => {
    hands[seat] = deck.slice(3 * k, 3 * k + 3);
  });
  return {
    dealer,
    hands,
    stock: deck.slice(12),
    bids: [],
    mode: 'normal',
    bidder: null,
    trump: null,
    trumpCard: null,
    active: [0, 1, 2, 3],
    turn: first,
    leader: first,
    trick: [],
    lastTrick: null,
    lastTrickWinner: null,
    tricksTaken: { A: 0, B: 0 },
    points: { A: 0, B: 0 },
    declared: [],
    tricksPlayed: 0,
    result: null,
  };
}

export function applyAction(state: GameState, action: Action, rng: () => number = Math.random): GameState {
  const s = structuredClone(state);
  switch (action.type) {
    case 'bid':
      applyBid(s, action.seat, action.bid);
      break;
    case 'play':
      applyPlay(s, action.seat, action.card, action.declare ?? false);
      break;
    case 'stop':
      applyStop(s, action.seat);
      break;
    case 'nextRound':
      applyNextRound(s, rng);
      break;
  }
  return s;
}

/** Points for the team that took the last trick in a normal game. */
export function scoreNormal(loserTricks: number, loserPoints: number): number {
  if (loserTricks === 0) return 3;
  return loserPoints < 33 ? 2 : 1;
}

function isFollowOnlyMode(round: Round): boolean {
  return round.mode === 'mare' || round.mode === 'mica';
}

export function legalCardsFor(round: Round, seat: Seat): Card[] {
  const hand = round.hands[seat];
  // Ciuri: the bidder's first lead must be a trump (the marriage suit).
  if (round.mode === 'ciuri' && seat === round.bidder && round.tricksPlayed === 0 && round.trick.length === 0) {
    return hand.filter((x) => x.suit === round.trump);
  }
  return legalCards(hand, round.trick, round.trump, !isFollowOnlyMode(round));
}

export function canDeclare(round: Round, seat: Seat, card: Card): boolean {
  if (round.mode !== 'normal' && round.mode !== 'ciuri' && round.mode !== 'tromf') return false;
  if (round.turn !== seat || round.trick.length !== 0) return false;
  if (card.rank !== 3 && card.rank !== 4) return false;
  if (round.declared.some((d) => d.suit === card.suit)) return false;
  const pair = card.rank === 3 ? 4 : 3;
  const hand = round.hands[seat];
  return hand.some((x) => sameCard(x, card)) && hand.some((x) => x.suit === card.suit && x.rank === pair);
}

export function canStop(state: GameState, seat: Seat): boolean {
  const r = state.round;
  return state.phase === 'playing' && r.mode === 'normal' && r.turn === seat && r.tricksPlayed >= 1;
}

function requirePhase(s: GameState, phase: Phase): void {
  if (s.phase !== phase) throw new IllegalActionError('Acțiunea nu e permisă acum');
}

function requireTurn(round: Round, seat: Seat): void {
  if (round.turn !== seat) throw new IllegalActionError('Nu e rândul tău');
}

function applyBid(s: GameState, seat: Seat, bid: Bid): void {
  requirePhase(s, 'bidding');
  const r = s.round;
  requireTurn(r, seat);
  if (!legalBids(r, seat).some((b) => sameBid(b, bid))) throw new IllegalActionError('Licitație nepermisă');
  r.bids.push({ seat, bid });
  if (biddingDone(r)) resolveBidding(s);
  else r.turn = nextSeat(seat);
}

/** Gives each of `seats` its 2-card packet from the stock (packet index = offset from first player). */
function dealSecond(r: Round, seats: Seat[]): void {
  const order = seatsFrom(nextSeat(r.dealer));
  for (const seat of seats) {
    const k = order.indexOf(seat);
    r.hands[seat] = [...r.hands[seat], ...r.stock.slice(2 * k, 2 * k + 2)];
  }
}

function startPlay(s: GameState, leader: Seat): void {
  s.phase = 'playing';
  s.round.leader = leader;
  s.round.turn = leader;
}

function resolveBidding(s: GameState): void {
  const r = s.round;
  const win = winningBid(r.bids);
  if (win === null) {
    dealSecond(r, seatsFrom(nextSeat(r.dealer)));
    r.trumpCard = r.hands[r.dealer][4];
    r.trump = r.trumpCard.suit;
    startPlay(s, nextSeat(r.dealer));
    return;
  }

  const { seat: bidder, bid } = win;
  r.mode = bid.kind;
  r.bidder = bidder;
  r.active = seatsFrom(bidder).filter((seat) => seat !== partnerOf(bidder));

  if (bid.kind === 'adunare') {
    const revealed = r.active.map((seat) => ({ seat, cards: [...r.hands[seat]] }));
    const sum = sumPoints(revealed.flatMap((x) => x.cards));
    finishRound(s, { ...contractResult(r, sum >= TARGET_POINTS), adunareSum: sum, revealed });
    return;
  }
  if (bid.kind === 'ciuri') r.trump = marriageSuit(r.hands[bidder]);
  if (bid.kind === 'tromf') {
    r.trump = bid.suit;
    dealSecond(r, r.active);
  }
  startPlay(s, bidder);
}

function nextActive(r: Round, seat: Seat): Seat {
  let next = nextSeat(seat);
  while (!r.active.includes(next)) next = nextSeat(next);
  return next;
}

function applyPlay(s: GameState, seat: Seat, card: Card, declare: boolean): void {
  requirePhase(s, 'playing');
  const r = s.round;
  requireTurn(r, seat);
  if (!legalCardsFor(r, seat).some((x) => sameCard(x, card))) throw new IllegalActionError('Carte nepermisă');

  const autoDeclare = r.mode === 'ciuri' && seat === r.bidder && card.suit === r.trump;
  if ((declare || autoDeclare) && canDeclare(r, seat, card)) {
    const points = card.suit === r.trump ? 40 : 20;
    r.points[teamOf(seat)] += points;
    r.declared.push({ seat, suit: card.suit, points });
  } else if (declare) {
    throw new IllegalActionError('Nu poți striga cu această carte');
  }

  r.hands[seat] = removeCard(r.hands[seat], card);
  r.trick.push({ seat, card });

  if (isFollowOnlyMode(r) && seat !== r.bidder) {
    const led = r.trick[0].card;
    const broken = card.suit === led.suit && (r.mode === 'mare' ? card.rank > led.rank : card.rank < led.rank);
    if (broken) {
      r.lastTrick = r.trick;
      r.trick = [];
      finishRound(s, contractResult(r, false));
      return;
    }
  }

  if (r.trick.length < r.active.length) {
    r.turn = nextActive(r, seat);
    return;
  }
  completeTrick(s);
}

function completeTrick(s: GameState): void {
  const r = s.round;
  const played = r.trick;
  r.lastTrick = played;
  r.trick = [];
  r.tricksPlayed += 1;

  if (isFollowOnlyMode(r)) {
    const bidder = r.bidder as Seat;
    if (r.hands[bidder].length === 0) {
      finishRound(s, contractResult(r, true));
    } else {
      r.leader = bidder;
      r.turn = bidder;
    }
    return;
  }

  const winner = trickWinner(played, r.trump);
  const team = teamOf(winner.seat);
  r.tricksTaken[team] += 1;
  r.points[team] += sumPoints(played.map((p) => p.card));
  r.lastTrickWinner = winner.seat;

  if (r.active.every((seat) => r.hands[seat].length === 0)) {
    finishPlayedRound(s);
    return;
  }
  r.leader = winner.seat;
  r.turn = winner.seat;
}

function contractResult(r: Round, made: boolean): RoundResult {
  const bidder = r.bidder as Seat;
  const team = teamOf(bidder);
  const entry = r.bids.find((b) => b.seat === bidder);
  return {
    winner: made ? team : otherTeam(team),
    points: entry ? bidValue(entry.bid) : 0,
    reason: made ? 'contract-made' : 'contract-failed',
    mode: r.mode,
    bidder,
  };
}

function finishPlayedRound(s: GameState): void {
  const r = s.round;
  if (r.mode === 'normal') {
    const winner = teamOf(r.lastTrickWinner as Seat);
    const loser = otherTeam(winner);
    finishRound(s, {
      winner,
      points: scoreNormal(r.tricksTaken[loser], r.points[loser]),
      reason: 'normal',
      mode: 'normal',
      bidder: null,
    });
    return;
  }
  finishRound(s, contractResult(r, r.points[teamOf(r.bidder as Seat)] >= TARGET_POINTS));
}

function applyStop(s: GameState, seat: Seat): void {
  if (!canStop(s, seat)) throw new IllegalActionError('Nu poți opri acum');
  const team = teamOf(seat);
  const made = s.round.points[team] >= TARGET_POINTS;
  finishRound(s, {
    winner: made ? team : otherTeam(team),
    points: 3,
    reason: 'stop',
    mode: 'normal',
    bidder: null,
    stopBy: seat,
  });
}

function finishRound(s: GameState, result: RoundResult): void {
  s.round.result = result;
  s.score[result.winner] += result.points;
  s.phase = s.score.A >= WIN_SCORE || s.score.B >= WIN_SCORE ? 'matchOver' : 'roundOver';
}

function applyNextRound(s: GameState, rng: () => number): void {
  requirePhase(s, 'roundOver');
  s.round = dealRound(nextSeat(s.round.dealer), shuffle(fullDeck(), rng));
  s.roundNumber += 1;
  s.phase = 'bidding';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/game`
Expected: PASS — all tests in `cards`, `play`, `bidding`, `engine.normal` (includes 13 new engine tests).

- [ ] **Step 6: Commit**

```bash
git add lib/game
git commit -m "feat: add game engine with normal game, declarations and stop"
```

---

### Task 6: Contracts — Ciuri, Adunare, Mare, Mica, Tromful tău

Spec §1.7–§1.10. The engine code from Task 5 already implements them; this task pins every contract rule with tests. If any test fails, fix `engine.ts` (not the test) — the test encodes the spec.

**Files:**
- Test: `lib/game/__tests__/engine.contracts.test.ts`
- Modify (only if a test fails): `lib/game/engine.ts`

- [ ] **Step 1: Write the test `lib/game/__tests__/engine.contracts.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { legalCardsFor } from '../engine';
import { autoplay, bid, c, play, stateWith } from './helpers';

// Dealer is seat 0 everywhere: first player = seat 1 (team B), partner = seat 3,
// opponents = seats 2 and 0 (team A). Play order among active seats: 1 → 2 → 0.

describe('Ciuri', () => {
  it('made: trump = marriage suit, 3 cards, partner out, auto 40, +12', () => {
    let s = stateWith(0, {
      1: [c('verde', 3), c('verde', 4), c('verde', 11)],
      2: [c('rosu', 11), c('rosu', 10), c('rosu', 2)],
      0: [c('duba', 11), c('duba', 10), c('duba', 2)],
    });
    s = bid(s, 1, { kind: 'ciuri' });
    expect(s.phase).toBe('playing');
    expect(s.round.mode).toBe('ciuri');
    expect(s.round.trump).toBe('verde');
    expect(s.round.active).toEqual([1, 2, 0]);
    expect(s.round.hands[1]).toHaveLength(3);
    expect(s.round.turn).toBe(1);

    s = play(s, 1, c('verde', 11));
    s = play(s, 2, c('rosu', 11));
    expect(s.round.turn).toBe(0); // partner (seat 3) is skipped
    s = play(s, 0, c('duba', 11));
    expect(s.round.points.B).toBe(33);

    s = play(s, 1, c('verde', 4)); // automatic declaration
    expect(s.round.points.B).toBe(73);
    s = play(s, 2, c('rosu', 10));
    s = play(s, 0, c('duba', 10));

    // play continues to the end even though 66 is already reached
    expect(s.phase).toBe('playing');
    s = play(s, 1, c('verde', 3));
    s = play(s, 2, c('rosu', 2));
    s = play(s, 0, c('duba', 2));

    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'B', points: 12, reason: 'contract-made', mode: 'ciuri' });
    expect(s.score).toEqual({ A: 0, B: 12 });
  });

  it('first lead must be a trump when the third card is another suit', () => {
    let s = stateWith(0, {
      1: [c('verde', 3), c('verde', 4), c('rosu', 2)],
      2: [c('verde', 11), c('verde', 10), c('rosu', 11)],
      0: [c('duba', 11), c('duba', 10), c('verde', 2)],
    });
    s = bid(s, 1, { kind: 'ciuri' });
    expect(legalCardsFor(s.round, 1)).toEqual([c('verde', 3), c('verde', 4)]);
    expect(() => play(s, 1, c('rosu', 2))).toThrow('Carte nepermisă');
  });

  it('failed: under 66 gives 12 to the opponents', () => {
    let s = stateWith(0, {
      1: [c('verde', 3), c('verde', 4), c('rosu', 2)],
      2: [c('verde', 11), c('verde', 10), c('rosu', 11)],
      0: [c('duba', 11), c('duba', 10), c('verde', 2)],
    });
    s = bid(s, 1, { kind: 'ciuri' });
    s = play(s, 1, c('verde', 4));
    expect(s.round.points.B).toBe(40);
    s = play(s, 2, c('verde', 11));
    s = play(s, 0, c('verde', 2));
    expect(s.round.turn).toBe(2);
    s = play(s, 2, c('rosu', 11));
    s = play(s, 0, c('duba', 10));
    s = play(s, 1, c('rosu', 2));
    s = play(s, 2, c('verde', 10));
    s = play(s, 0, c('duba', 11));
    s = play(s, 1, c('verde', 3));
    expect(s.round.result).toMatchObject({ winner: 'A', points: 12, reason: 'contract-failed' });
    expect(s.score).toEqual({ A: 12, B: 0 });
  });
});

describe('Adunare', () => {
  const bidder = [c('rosu', 11), c('verde', 11), c('ghinda', 11)]; // 33
  const opp2 = [c('rosu', 10), c('verde', 10), c('duba', 2)]; // 22

  it('66 or more wins 12 immediately, partner cards are not revealed', () => {
    let s = stateWith(0, { 1: bidder, 2: opp2, 0: [c('rosu', 4), c('verde', 4), c('rosu', 3)] }); // 11
    s = bid(s, 1, { kind: 'adunare' });
    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'B', points: 12, reason: 'contract-made', adunareSum: 66 });
    expect(s.round.result?.revealed?.map((x) => x.seat)).toEqual([1, 2, 0]);
    expect(s.score).toEqual({ A: 0, B: 12 });
  });

  it('65 gives 12 to the opponents', () => {
    let s = stateWith(0, { 1: bidder, 2: opp2, 0: [c('rosu', 4), c('verde', 4), c('rosu', 2)] }); // 10
    s = bid(s, 1, { kind: 'adunare' });
    expect(s.round.result).toMatchObject({ winner: 'A', points: 12, adunareSum: 65 });
  });

  it('a later player can outbid the first player’s small contract', () => {
    let s = stateWith(0, { 2: bidder });
    s = bid(s, 1, { kind: 'mica' });
    s = bid(s, 2, { kind: 'adunare' });
    expect(s.phase).toBe('roundOver');
    expect(s.round.bidder).toBe(2);
    expect(s.round.mode).toBe('adunare');
  });
});

describe('Mare', () => {
  it('made when nobody plays a higher card of the led suit: +6', () => {
    let s = stateWith(0, { 1: [c('rosu', 11), c('verde', 11), c('ghinda', 11)] });
    s = bid(s, 1, { kind: 'mare' });
    expect(s.round.trump).toBeNull();
    s = autoplay(s);
    expect(s.round.result).toMatchObject({ winner: 'B', points: 6, reason: 'contract-made', mode: 'mare' });
    expect(s.round.tricksPlayed).toBe(3);
  });

  it('fails immediately when an opponent plays higher of the led suit', () => {
    let s = stateWith(0, {
      1: [c('rosu', 10), c('verde', 11), c('ghinda', 11)],
      2: [c('rosu', 11), c('duba', 2), c('duba', 3)],
    });
    s = bid(s, 1, { kind: 'mare' });
    s = play(s, 1, c('rosu', 10));
    s = play(s, 2, c('rosu', 11));
    expect(s.phase).toBe('roundOver');
    expect(s.round.result).toMatchObject({ winner: 'A', points: 6, reason: 'contract-failed' });
  });

  it('opponents must follow suit but are not forced to beat', () => {
    let s = stateWith(0, {
      1: [c('rosu', 3), c('verde', 11), c('ghinda', 11)],
      2: [c('rosu', 11), c('rosu', 2), c('duba', 3)],
    });
    s = bid(s, 1, { kind: 'mare' });
    s = play(s, 1, c('rosu', 3));
    expect(legalCardsFor(s.round, 2)).toEqual([c('rosu', 11), c('rosu', 2)]);
  });
});

describe('Mica', () => {
  it('made with only twos: +4', () => {
    let s = stateWith(0, { 1: [c('rosu', 2), c('verde', 2), c('ghinda', 2)] });
    s = bid(s, 1, { kind: 'mica' });
    s = autoplay(s);
    expect(s.round.result).toMatchObject({ winner: 'B', points: 4, reason: 'contract-made', mode: 'mica' });
  });

  it('fails immediately when an opponent plays lower of the led suit', () => {
    let s = stateWith(0, {
      1: [c('rosu', 3), c('verde', 2), c('ghinda', 2)],
      2: [c('rosu', 2), c('duba', 3), c('duba', 4)],
    });
    s = bid(s, 1, { kind: 'mica' });
    s = play(s, 1, c('rosu', 3));
    s = play(s, 2, c('rosu', 2));
    expect(s.round.result).toMatchObject({ winner: 'A', points: 4, reason: 'contract-failed' });
  });
});

describe('Tromful tău', () => {
  it('bidder picks trump; bidder and opponents get 5 cards; partner sits out', () => {
    let s = stateWith(0, {});
    s = bid(s, 1, { kind: 'tromf', suit: 'ghinda' });
    for (const seat of [2, 3, 0] as const) s = bid(s, seat, { kind: 'pass' });
    expect(s.phase).toBe('playing');
    expect(s.round.mode).toBe('tromf');
    expect(s.round.trump).toBe('ghinda');
    expect(s.round.hands.map((h) => h.length)).toEqual([5, 5, 5, 3]);
    expect(s.round.turn).toBe(1);
  });

  it('is scored at the end: 66+ for the bidder team gives 6, otherwise 6 to opponents', () => {
    let s = stateWith(0, {});
    s = bid(s, 1, { kind: 'tromf', suit: 'ghinda' });
    for (const seat of [2, 3, 0] as const) s = bid(s, seat, { kind: 'pass' });
    s = autoplay(s);
    expect(s.round.tricksPlayed).toBe(5);
    const made = s.round.points.B >= 66;
    expect(s.round.result).toMatchObject({ winner: made ? 'B' : 'A', points: 6, mode: 'tromf' });
  });

  it('only the first player may bid it', () => {
    let s = stateWith(0, {});
    s = bid(s, 1, { kind: 'pass' });
    expect(() => bid(s, 2, { kind: 'tromf', suit: 'rosu' })).toThrow('Licitație nepermisă');
    expect(() => bid(s, 2, { kind: 'mare' })).toThrow('Licitație nepermisă');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run lib/game/__tests__/engine.contracts.test.ts`
Expected: PASS (15 tests). If any fail, fix `lib/game/engine.ts` to match the spec and rerun.

- [ ] **Step 3: Commit**

```bash
git add lib/game
git commit -m "test: cover Ciuri, Adunare, Mare, Mica and Tromful tău contracts"
```

---

### Task 7: Views — legal moves, timeout action, public view

Spec §2.5 (timeout: bidding → pass; play → lowest legal card, ties by suit order rosu, verde, ghinda, duba; no declaration except Ciuri auto; roundOver → next round) and §3.2 (public state never contains hands or stock).

**Files:**
- Create: `lib/game/views.ts`
- Test: `lib/game/__tests__/views.test.ts`

- [ ] **Step 1: Write the failing test `lib/game/__tests__/views.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine';
import { legalMoves, pendingSeat, publicView, timeoutAction } from '../views';
import { bid, c, passAll, play, stateWith } from './helpers';

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

describe('pendingSeat / legalMoves', () => {
  it('only the seat on turn has moves', () => {
    const s = stateWith(0, FIRST, SECOND);
    expect(pendingSeat(s)).toBe(1);
    expect(legalMoves(s, 2)).toEqual({ bids: [], cards: [], declarable: [], canStop: false });
    expect(legalMoves(s, 1).bids.map((b) => b.kind)).toContain('ciuri');
  });

  it('lists playable and declarable cards during play', () => {
    const s = passAll(stateWith(0, FIRST, SECOND));
    const m = legalMoves(s, 1);
    expect(m.cards).toHaveLength(5);
    // seat 1 holds two marriages: verde (trump) and ghinda
    expect(m.declarable).toEqual([c('verde', 3), c('verde', 4), c('ghinda', 3), c('ghinda', 4)]);
    expect(m.canStop).toBe(false);
  });
});

describe('timeoutAction', () => {
  it('passes during bidding', () => {
    expect(timeoutAction(stateWith(0, FIRST, SECOND))).toEqual({ type: 'bid', seat: 1, bid: { kind: 'pass' } });
  });

  it('plays the lowest legal card', () => {
    let s = passAll(stateWith(0, FIRST, SECOND));
    s = play(s, 1, c('verde', 3));
    s = play(s, 2, c('ghinda', 11));
    expect(timeoutAction(s)).toEqual({ type: 'play', seat: 3, card: c('verde', 10) });
  });

  it('breaks rank ties by suit order (rosu, verde, ghinda, duba)', () => {
    let s = stateWith(0, { 1: [c('ghinda', 2), c('verde', 2), c('rosu', 2)] });
    s = bid(s, 1, { kind: 'mica' });
    expect(timeoutAction(s)).toEqual({ type: 'play', seat: 1, card: c('rosu', 2) });
  });

  it('in Ciuri the automatic first lead is a trump and is auto-declared', () => {
    let s = stateWith(0, {
      1: [c('verde', 3), c('verde', 4), c('rosu', 2)],
      2: [c('verde', 11), c('verde', 10), c('rosu', 11)],
      0: [c('duba', 11), c('duba', 10), c('verde', 2)],
    });
    s = bid(s, 1, { kind: 'ciuri' });
    const action = timeoutAction(s);
    expect(action).toEqual({ type: 'play', seat: 1, card: c('verde', 3) });
    s = applyAction(s, action!);
    expect(s.round.points.B).toBe(40);
  });

  it('starts the next round after roundOver and does nothing after matchOver', () => {
    let s = stateWith(0, { 1: [c('rosu', 11), c('verde', 11), c('ghinda', 11)] });
    s = bid(s, 1, { kind: 'adunare' });
    expect(timeoutAction(s)).toEqual({ type: 'nextRound' });
    expect(timeoutAction({ ...s, phase: 'matchOver' })).toBeNull();
  });
});

describe('publicView', () => {
  it('hides hands and stock but exposes hand sizes', () => {
    const s = passAll(stateWith(0, FIRST, SECOND));
    const view = publicView(s);
    expect('hands' in view.round).toBe(false);
    expect('stock' in view.round).toBe(false);
    expect(view.round.handCounts).toEqual([5, 5, 5, 5]);
    expect(view.round.trumpCard).toEqual(c('verde', 2));
    expect(JSON.stringify(view)).not.toContain('"ghinda","rank":11');
  });
});
```

Note on the last assertion: `ghinda 11` sits in seat 2's hand and must not leak. The `JSON.stringify` check matches `{"suit":"ghinda","rank":11}`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/game/__tests__/views.test.ts`
Expected: FAIL — cannot resolve `../views`.

- [ ] **Step 3: Create `lib/game/views.ts`**

```ts
import { legalBids } from './bidding';
import { canDeclare, canStop, legalCardsFor } from './engine';
import { SUITS, type Action, type Bid, type Card, type GameState, type Round, type Seat } from './types';

export function pendingSeat(state: GameState): Seat | null {
  return state.phase === 'bidding' || state.phase === 'playing' ? state.round.turn : null;
}

export interface LegalMoves {
  bids: Bid[];
  cards: Card[];
  declarable: Card[];
  canStop: boolean;
}

export function legalMoves(state: GameState, seat: Seat): LegalMoves {
  const none: LegalMoves = { bids: [], cards: [], declarable: [], canStop: false };
  if (pendingSeat(state) !== seat) return none;
  if (state.phase === 'bidding') return { ...none, bids: legalBids(state.round, seat) };
  const cards = legalCardsFor(state.round, seat);
  return {
    bids: [],
    cards,
    declarable: cards.filter((card) => canDeclare(state.round, seat, card)),
    canStop: canStop(state, seat),
  };
}

/** The automatic move applied when the current deadline expires. */
export function timeoutAction(state: GameState): Action | null {
  if (state.phase === 'roundOver') return { type: 'nextRound' };
  const seat = pendingSeat(state);
  if (seat === null) return null;
  if (state.phase === 'bidding') return { type: 'bid', seat, bid: { kind: 'pass' } };
  const [card] = [...legalCardsFor(state.round, seat)].sort(
    (a, b) => a.rank - b.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit),
  );
  return { type: 'play', seat, card };
}

export type PublicRound = Omit<Round, 'hands' | 'stock'> & { handCounts: number[] };

export interface PublicState {
  phase: GameState['phase'];
  score: GameState['score'];
  roundNumber: number;
  round: PublicRound;
}

/** Everything every player may see. Hands and the stock are never included. */
export function publicView(state: GameState): PublicState {
  const copy: Partial<Round> = structuredClone(state.round);
  delete copy.hands;
  delete copy.stock;
  return {
    phase: state.phase,
    score: { ...state.score },
    roundNumber: state.roundNumber,
    round: { ...(copy as Omit<Round, 'hands' | 'stock'>), handCounts: state.round.hands.map((h) => h.length) },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/game/__tests__/views.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/game
git commit -m "feat: add legal moves, timeout action and public view"
```

---

### Task 8: Randomised full-match simulation + public index

Plays many seeded matches with random legal moves to catch crashes, stuck states and scoring invariants.

**Files:**
- Create: `lib/game/index.ts`
- Test: `lib/game/__tests__/simulation.test.ts`

- [ ] **Step 1: Create `lib/game/index.ts`**

```ts
export * from './types';
export { fullDeck, sameCard, teamOf, partnerOf, sumPoints } from './cards';
export { bidValue } from './bidding';
export { applyAction, createMatch, WIN_SCORE, TARGET_POINTS } from './engine';
export { legalMoves, pendingSeat, publicView, timeoutAction } from './views';
export type { LegalMoves, PublicRound, PublicState } from './views';
```

- [ ] **Step 2: Write the test `lib/game/__tests__/simulation.test.ts`** (imports only from the public index)

```ts
import { describe, expect, it } from 'vitest';
import {
  applyAction, createMatch, legalMoves, pendingSeat, publicView, sameCard, type GameState,
} from '../index';
import { mulberry32 } from './helpers';

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function checkFinishedRound(s: GameState): void {
  const r = s.round;
  expect(r.result).not.toBeNull();
  if (r.result?.reason === 'normal') {
    const declared = r.declared.reduce((sum, d) => sum + d.points, 0);
    expect(r.tricksPlayed).toBe(5);
    expect(r.points.A + r.points.B).toBe(120 + declared);
  }
}

describe('random full matches', () => {
  it('200 seeded matches finish at 21+ without illegal states', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      let s = createMatch(rng);
      let steps = 0;
      while (s.phase !== 'matchOver') {
        steps += 1;
        expect(steps).toBeLessThan(5000);
        expect('hands' in publicView(s).round).toBe(false);

        if (s.phase === 'roundOver') {
          checkFinishedRound(s);
          s = applyAction(s, { type: 'nextRound' }, rng);
          continue;
        }
        const seat = pendingSeat(s)!;
        const moves = legalMoves(s, seat);
        if (s.phase === 'bidding') {
          s = applyAction(s, { type: 'bid', seat, bid: pick(moves.bids, rng) });
        } else if (moves.canStop && rng() < 0.05) {
          s = applyAction(s, { type: 'stop', seat });
        } else {
          expect(moves.cards.length).toBeGreaterThan(0);
          const card = pick(moves.cards, rng);
          const declare = moves.declarable.some((d) => sameCard(d, card)) && rng() < 0.7;
          s = applyAction(s, { type: 'play', seat, card, declare });
        }
      }
      checkFinishedRound(s);
      expect(Math.max(s.score.A, s.score.B)).toBeGreaterThanOrEqual(21);
    }
  });
});
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS — all test files green.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. Fix any reported issue in the source (do not disable rules).

- [ ] **Step 5: Commit**

```bash
git add lib/game
git commit -m "test: add randomised full-match simulation and public engine index"
```

---

## Done criteria for Plan 1

- `npm test`, `npm run typecheck`, `npm run lint` all pass.
- Every rule in spec §1 is covered by at least one test (cards/play/bidding/engine.normal/engine.contracts/views/simulation).
- `lib/game` has no imports from React, Next.js or Supabase.

Next: write Plan 2 (Supabase schema, RLS, API routes, timeouts, chat) against `lib/game/index.ts`.
