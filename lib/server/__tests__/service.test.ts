import { describe, expect, it } from 'vitest';
import { publicView, type Seat } from '@/lib/game';
import { mulberry32 } from '@/lib/game/__tests__/helpers';
import { MemoryStore } from '../memory-store';
import {
  act, advance, createRoom, joinRoom, rematch, sendMessage, setBot, takeSeat, tick, type ServiceDeps,
} from '../service';
import { botUserId } from '@/lib/bots';
import type { GameWrite } from '../store';

const USERS = ['u0', 'u1', 'u2', 'u3'];
const NAMES = ['Ana', 'Bogdan', 'Cristi', 'Dana'];

/** Simulates another request committing first: while `stale` is set, every commit loses. */
class StaleStore extends MemoryStore {
  stale = false;
  override async commitGame(roomId: string, expectedVersion: number, write: GameWrite): Promise<boolean> {
    return this.stale ? false : super.commitGame(roomId, expectedVersion, write);
  }
}

function setup(makeStore: (now: () => Date) => MemoryStore = (now) => new MemoryStore(now)) {
  let time = new Date('2026-01-01T12:00:00Z').getTime();
  const now = () => new Date(time);
  const store = makeStore(now);
  const deps: ServiceDeps = { store, now, rng: mulberry32(42) };
  return { store, deps, now, advance: (ms: number) => { time += ms; } };
}
type Ctx = ReturnType<typeof setup>;

const roomOf = (ctx: Ctx, code: string) => [...ctx.store.rooms.values()].find((r) => r.code === code)!;
const gameOf = (ctx: Ctx, code: string) => ctx.store.games.get(roomOf(ctx, code).id)!;
const seatOf = (ctx: Ctx, code: string, userId: string) =>
  ctx.store.players.get(roomOf(ctx, code).id)!.find((p) => p.userId === userId)!;
/** Compare instants, not string formats (Postgres and JS format timestamps differently). */
const ms = (iso: string | null) => (iso === null ? null : new Date(iso).getTime());

/** All 4 seats taken; `spectators` join without a seat before the table fills. */
async function seatedTable(ctx: Ctx, spectators: string[] = []): Promise<string> {
  const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
  for (let i = 1; i < 4; i++) await joinRoom(ctx.deps, code, USERS[i], NAMES[i]);
  for (const user of spectators) await joinRoom(ctx.deps, code, user, `Spectator ${user}`);
  for (let i = 0; i < 4; i++) await takeSeat(ctx.deps, code, USERS[i], i as Seat);
  return code;
}

async function startedTable(ctx: Ctx, spectators: string[] = []): Promise<string> {
  const code = await seatedTable(ctx, spectators);
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
    expect(ms(roomOf(ctx, code).startAt)).toBe(ctx.now().getTime() + 3000);
    await takeSeat(ctx.deps, code, USERS[3], null);
    expect(roomOf(ctx, code).startAt).toBeNull();
  });

  it('repeated seat calls do not postpone the start', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx);
    const startAt = roomOf(ctx, code).startAt;
    ctx.advance(2000);
    await takeSeat(ctx.deps, code, USERS[0], 0);
    await takeSeat(ctx.deps, code, USERS[1], 1);
    expect(roomOf(ctx, code).startAt).toBe(startAt);
    ctx.advance(1000);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(true);
  });

  it('seat changes on a table that is not full keep the countdown off', async () => {
    const ctx = setup();
    const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
    await takeSeat(ctx.deps, code, USERS[0], 0);
    await takeSeat(ctx.deps, code, USERS[0], 1);
    expect(roomOf(ctx, code).startAt).toBeNull();
  });

  it('a full room only lets existing members back in', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx);
    await expect(joinRoom(ctx.deps, code, 'u9', 'Nou')).rejects.toMatchObject({ status: 409, message: 'Camera e plină' });
    expect(await joinRoom(ctx.deps, code, USERS[2], NAMES[2])).toBe(code);
  });

  it('a started room only lets seated members back in', async () => {
    const ctx = setup();
    const code = await startedTable(ctx, ['u4']);
    expect(await joinRoom(ctx.deps, code, USERS[2], NAMES[2])).toBe(code);
    await expect(joinRoom(ctx.deps, code, 'u4', 'Eva')).rejects.toMatchObject({ status: 409, message: 'Camera e plină' });
    await expect(joinRoom(ctx.deps, code, 'u9', 'Nou')).rejects.toMatchObject({ status: 409, message: 'Camera e plină' });
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
    expect(game.users).toEqual(USERS);
    expect(game.state.phase).toBe('bidding');
    expect(game.log).toEqual([{ type: 'matchStart', dealer: game.state.round.dealer }]);
    expect(ms(game.deadline)).toBe(ctx.now().getTime() + 20_000);
    const hands = ctx.store.hands.get(room.id)!;
    expect(hands.map((h) => [h.seat, h.userId, h.cards.length])).toEqual([[0, 'u0', 3], [1, 'u1', 3], [2, 'u2', 3], [3, 'u3', 3]]);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(false);
  });

  it('tick restores a missing countdown on a full lobby instead of starting at once', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx);
    await ctx.store.setStartAt(roomOf(ctx, code).id, null);
    ctx.advance(10_000);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(false);
    expect(ms(roomOf(ctx, code).startAt)).toBe(ctx.now().getTime() + 3000);
    ctx.advance(3000);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(true);
  });

  it('tick clears a stale countdown on a table that is no longer full', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx);
    // A lost write left the countdown running although a seat is free again.
    await ctx.store.setSeat(roomOf(ctx, code).id, USERS[3], null);
    expect(roomOf(ctx, code).startAt).not.toBeNull();
    ctx.advance(10_000);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(false);
    expect(roomOf(ctx, code).startAt).toBeNull();
    expect(roomOf(ctx, code).status).toBe('lobby');
  });

  it('tick is refused to non-members', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx);
    await expect(tick(ctx.deps, code, 'stranger')).rejects.toMatchObject({ status: 403 });
  });

  it('a start is not committed when the seats changed after the service read them', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx);
    const roomId = roomOf(ctx, code).id;
    const read = ctx.store.listPlayers.bind(ctx.store);
    ctx.store.listPlayers = async (id) => {
      const snapshot = await read(id);
      // Race: u3 stands up right after this read.
      await ctx.store.setSeat(roomId, USERS[3], null);
      return snapshot;
    };
    ctx.advance(3000);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(false);
    expect(roomOf(ctx, code).status).toBe('lobby');
    expect(ctx.store.games.get(roomId)).toBeUndefined();
  });

  it('seats are frozen once the game started', async () => {
    const ctx = setup();
    const code = await startedTable(ctx);
    await expect(takeSeat(ctx.deps, code, USERS[0], null))
      .rejects.toMatchObject({ status: 409, message: 'Jocul a început deja' });
    expect(seatOf(ctx, code, USERS[0]).seat).toBe(0);
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

  it('returns the committed game with only the caller’s own hand', async () => {
    const ctx = setup();
    const code = await startedTable(ctx);
    const turn = gameOf(ctx, code).state.round.turn;
    const snapshot = await act(ctx.deps, code, USERS[turn], { type: 'bid', bid: { kind: 'pass' } });
    const game = gameOf(ctx, code);
    const stored = ctx.store.hands.get(roomOf(ctx, code).id)!.find((h) => h.userId === USERS[turn])!;
    expect(snapshot).toEqual({
      version: game.version,
      view: publicView(game.state),
      log: game.log,
      deadline: game.deadline,
      hand: { seat: turn, cards: stored.cards, moves: stored.moves },
      roomStatus: 'playing',
    });
  });

  it('advance returns the started game to the caller, and null when nothing changed', async () => {
    const ctx = setup();
    const code = await seatedTable(ctx, ['u4']);
    expect(await advance(ctx.deps, code, USERS[2])).toBeNull();
    ctx.advance(3000);
    const started = await advance(ctx.deps, code, 'u4');
    expect(started).toMatchObject({ version: 1, roomStatus: 'playing', hand: null });
    expect(await advance(ctx.deps, code, USERS[2])).toBeNull();
  });

  it('takes the seat from the game, not from the live seat list', async () => {
    const ctx = setup();
    const code = await startedTable(ctx);
    const turn = gameOf(ctx, code).state.round.turn;
    seatOf(ctx, code, USERS[turn]).seat = null;
    await act(ctx.deps, code, USERS[turn], { type: 'bid', bid: { kind: 'pass' } });
    expect(gameOf(ctx, code).version).toBe(2);
    expect(ctx.store.hands.get(roomOf(ctx, code).id)!.map((h) => h.userId)).toEqual(USERS);
  });

  it('a spectator cannot act', async () => {
    const ctx = setup();
    const code = await startedTable(ctx, ['u4']);
    await expect(act(ctx.deps, code, 'u4', { type: 'stop' })).rejects.toMatchObject({ status: 409 });
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

  it('a lost commit race is a 409 for act and false for tick', async () => {
    const ctx = setup((now) => new StaleStore(now));
    const code = await startedTable(ctx);
    (ctx.store as StaleStore).stale = true;
    const turn = gameOf(ctx, code).state.round.turn;
    await expect(act(ctx.deps, code, USERS[turn], { type: 'bid', bid: { kind: 'pass' } }))
      .rejects.toMatchObject({ status: 409, message: 'Starea jocului s-a schimbat, reîncearcă' });
    ctx.advance(21_000);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(false);
    expect(gameOf(ctx, code).version).toBe(1);
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

describe('Stop from any seat', () => {
  it('every seat gets canStop in a normal game, and a seat not on turn can stop through act', async () => {
    const ctx = setup();
    const code = await startedTable(ctx);
    // Timeouts pass in both bidding stages, so the round becomes a normal game (after any redeals).
    for (let i = 0; gameOf(ctx, code).state.phase === 'bidding'; i++) {
      expect(i).toBeLessThan(100);
      ctx.advance(21_000);
      await tick(ctx.deps, code, USERS[0]);
    }
    const { state } = gameOf(ctx, code);
    expect(state.phase).toBe('playing');
    expect(state.round.mode).toBe('normal');
    const hands = ctx.store.hands.get(roomOf(ctx, code).id)!;
    expect(hands.map((h) => h.moves.canStop)).toEqual([true, true, true, true]);
    expect(hands.filter((h) => h.moves.cards.length > 0).map((h) => h.seat)).toEqual([state.round.turn]);

    const stopper = ((state.round.turn + 1) % 4) as Seat;
    const snapshot = await act(ctx.deps, code, USERS[stopper], { type: 'stop' });
    const after = gameOf(ctx, code);
    expect(after.state.phase).toBe('roundOver');
    expect(after.state.round.result).toMatchObject({ reason: 'stop', stopBy: stopper, points: 3 });
    expect(after.log.at(-1)).toEqual({ type: 'roundEnd', result: after.state.round.result });
    expect(snapshot.hand).toMatchObject({ seat: stopper, moves: { canStop: false } });
    expect(ctx.store.hands.get(roomOf(ctx, code).id)!.every((h) => !h.moves.canStop)).toBe(true);
  });
});

describe('full match and rematch', () => {
  it('a match driven only by timeouts finishes, then rematch starts a fresh one', async () => {
    const ctx = setup();
    const code = await startedTable(ctx, ['u4']);
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
    await expect(rematch(ctx.deps, code, 'u4')).rejects.toMatchObject({ status: 409 });
    await expect(rematch(ctx.deps, code, 'stranger')).rejects.toMatchObject({ status: 403 });
    expect(await rematch(ctx.deps, code, USERS[1])).toBe(true);
    const fresh = gameOf(ctx, code);
    expect(roomOf(ctx, code).status).toBe('playing');
    expect(fresh.version).toBe(finished.version + 1);
    expect(fresh.users).toEqual(USERS);
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

describe('computer players', () => {
  it('fills free seats, starts the countdown when the table is full and cancels it on removal', async () => {
    const ctx = setup();
    const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
    await takeSeat(ctx.deps, code, USERS[0], 0);
    for (const seat of [1, 2, 3] as Seat[]) await setBot(ctx.deps, code, USERS[0], seat, true);
    expect(seatOf(ctx, code, botUserId(1))).toEqual({ userId: botUserId(1), name: 'Calculator 2', seat: 1 });
    expect(roomOf(ctx, code).startAt).not.toBeNull();
    await expect(setBot(ctx.deps, code, USERS[0], 0, true)).rejects.toMatchObject({ status: 409 });

    await setBot(ctx.deps, code, USERS[0], 2, false);
    expect(ctx.store.players.get(roomOf(ctx, code).id)!.some((p) => p.userId === botUserId(2))).toBe(false);
    expect(roomOf(ctx, code).startAt).toBeNull();
  });

  it('refuses strangers and started rooms', async () => {
    const ctx = setup();
    const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
    await expect(setBot(ctx.deps, code, 'stranger', 1, true)).rejects.toMatchObject({ status: 403 });
    await takeSeat(ctx.deps, code, USERS[0], 0);
    for (const seat of [1, 2, 3] as Seat[]) await setBot(ctx.deps, code, USERS[0], seat, true);
    ctx.advance(3000);
    expect(await tick(ctx.deps, code, USERS[0])).toBe(true);
    await expect(setBot(ctx.deps, code, USERS[0], 1, false)).rejects.toMatchObject({ status: 409 });
  });

  it('bots move quickly on their own, without timeout entries, until a person is on turn', async () => {
    const ctx = setup();
    const code = await createRoom(ctx.deps, USERS[0], NAMES[0]);
    await takeSeat(ctx.deps, code, USERS[0], 0);
    for (const seat of [1, 2, 3] as Seat[]) await setBot(ctx.deps, code, USERS[0], seat, true);
    ctx.advance(3000);
    await tick(ctx.deps, code, USERS[0]);

    for (let i = 0; i < 200 && gameOf(ctx, code).state.phase !== 'matchOver'; i++) {
      const game = gameOf(ctx, code);
      const turn = game.state.phase === 'bidding' || game.state.phase === 'playing' ? game.state.round.turn : null;
      const botTurn = turn !== null && turn !== 0;
      if (botTurn) expect(ms(game.deadline)! - ctx.now().getTime()).toBe(1000);
      ctx.advance(botTurn ? 1000 : 30_000);
      expect(await tick(ctx.deps, code, USERS[0])).toBe(true);
    }
    const log = gameOf(ctx, code).log;
    expect(log.filter((e) => e.type === 'timeout').every((e) => e.type === 'timeout' && e.seat === 0)).toBe(true);
    expect(log.some((e) => e.type === 'bid' && e.seat !== 0)).toBe(true);
  });
});
