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
