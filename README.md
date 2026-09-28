# Ciuri

**A real-time, four-player online card game played with a Hungarian deck.**

**Play it:** [ciuri.vercel.app](https://ciuri.vercel.app)

Ciuri is a Transylvanian team card game (in the family of *Cruce*/*Tromf*) that had no good online version, so I built one. Four players join a room by link, pair up into two teams, bid for contracts in two stages and play to 21 points, with chat, turn timers and computer players filling any empty seat.

> The interface is in Romanian, matching its players. Code and docs are in English, and the full rules are on the in-app [Reguli](https://ciuri.vercel.app/reguli) page.

---

## Features

- **Rooms by link.** Create a room, share the link, pick seats. No accounts: players sign in anonymously.
- **The full rule set.** Two-stage bidding (*Ciuri*, *Adunare*, *Tromful tău*, *Mare*, *Mica*), a hidden trump card revealed once the first player passes, trump marriages, *Stop* at any point in normal play, redeals and match scoring to 21.
- **Computer players.** Any empty seat can be filled by a bot, so a game can start with fewer than four people.
- **Turn timers.** Every bid and card has a deadline; if a player walks away, the server makes a legal move for them so the table never stalls.
- **Live table.** Moves, chat and the event log arrive in real time over Supabase Realtime.
- **Real card art.** Hungarian Tell deck images, with the trump suit and scores always visible.

## How it works

The interesting part is keeping a card game **fair** when the browser can't be trusted.

- **Pure game engine** (`lib/game/`). Bidding, legal moves, trick resolution and scoring are pure TypeScript functions over an immutable `GameState`. No I/O, so they're fully unit-tested, including a simulation test that plays 200 seeded matches to 21 and checks that no illegal state ever appears and every round's points add up.
- **Server-authoritative moves** (`lib/server/`, `app/api/`). Clients send *intents* ("play this card") to Next.js route handlers. The server validates them with Zod, checks them against the engine's `legalMoves`, applies them and commits the new state atomically.
- **Hidden information stays hidden.** Each player's hand lives in its own table (`game_hands`) behind a Postgres row-level-security policy, so a player can only read **their own** cards. Everyone else just gets the public table state. Writes go through `SECURITY DEFINER` functions whose `EXECUTE` is revoked from client roles.
- **Deadlines.** Each state carries its next deadline; an expired turn is resolved server-side with an automatic legal move (bots use a shorter delay).

```
Browser ──intent──▶ Next.js API (Zod + engine) ──commit──▶ Postgres (RLS)
   ▲                                                         │
   └──────────── Supabase Realtime (public state + own hand) ◀┘
```

## Tech stack

`Next.js 16 (App Router)` `React 19` `TypeScript` `Tailwind CSS 4` `Supabase (Postgres, Realtime, Anonymous Auth, RLS)` `Zod` `Vitest` `Playwright` `Vercel`

## Testing

- **Unit tests (Vitest):** the engine (bidding, contracts, normal play, bots, views) plus the server layer (service, events, HTTP, store), run against an in-memory store.
- **End-to-end (Playwright):** four browser contexts join the same room, bid, play a card and chat.

```bash
npm test          # unit tests
npm run e2e       # end-to-end
npm run typecheck
```

## Running locally

```bash
cp .env.example .env.local   # Supabase URL + keys
npm install
npm run dev
```

Database schema and policies live in `supabase/migrations/`. The design spec and implementation plans are in `docs/`.
