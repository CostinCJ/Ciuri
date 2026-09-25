import { describe, expect, it } from 'vitest';
import { createMatch, legalMoves, publicView, type Seat } from '@/lib/game';
import { mulberry32 } from '@/lib/game/__tests__/helpers';
import { MemoryStore } from '../memory-store';
import type { GameWrite } from '../store';

const USERS = ['u0', 'u1', 'u2', 'u3'];

function write(users: string[] = USERS): GameWrite {
  const state = createMatch(mulberry32(1), 0);
  return {
    state,
    view: publicView(state),
    log: [],
    deadline: null,
    users,
    hands: ([0, 1, 2, 3] as Seat[]).map((seat) => ({ seat, userId: users[seat], cards: state.round.hands[seat], moves: legalMoves(state, seat) })),
    roomStatus: 'playing',
  };
}

/** A lobby room with u0..u3 seated at 0..3. */
async function seatedRoom(store: MemoryStore) {
  const room = (await store.insertRoom('ABCD', 'u0'))!;
  for (let i = 0; i < 4; i++) {
    await store.upsertPlayer(room.id, USERS[i], `P${i}`);
    expect(await store.setSeat(room.id, USERS[i], i as Seat)).toBe(true);
  }
  return room;
}

describe('MemoryStore', () => {
  it('rejects duplicate room codes and taken seats', async () => {
    const store = new MemoryStore();
    const room = (await store.insertRoom('ABCD', 'u0'))!;
    expect(store.creators.get(room.id)).toBe('u0');
    expect(await store.insertRoom('ABCD', 'u1')).toBeNull();
    await store.upsertPlayer(room.id, 'u0', 'Ana');
    await store.upsertPlayer(room.id, 'u1', 'Bogdan');
    expect(await store.setSeat(room.id, 'u0', 2)).toBe(true);
    expect(await store.setSeat(room.id, 'u1', 2)).toBe(false);
    expect(await store.setSeat(room.id, 'nobody', 1)).toBe(false);
  });

  it('commits games with optimistic versioning', async () => {
    const store = new MemoryStore();
    const room = await seatedRoom(store);
    await store.setStartAt(room.id, '2026-01-01T00:00:03Z');
    expect(await store.commitGame(room.id, 1, write())).toBe(false);
    expect(await store.commitGame(room.id, 0, write())).toBe(true);
    expect(await store.commitGame(room.id, 0, write())).toBe(false);
    const game = await store.loadGame(room.id);
    expect(game?.version).toBe(1);
    expect(game?.users).toEqual(USERS);
    expect(await store.findRoom('ABCD')).toMatchObject({ status: 'playing', startAt: null });
    expect(await store.commitGame(room.id, 1, write())).toBe(true);
    expect((await store.loadGame(room.id))?.version).toBe(2);
  });

  it('refuses to start a game unless the lobby seats match the users exactly', async () => {
    const store = new MemoryStore();
    const room = await seatedRoom(store);
    expect(await store.commitGame(room.id, 0, write(['u1', 'u0', 'u2', 'u3']))).toBe(false);
    expect(await store.commitGame(room.id, 0, write(['u0', 'u1', 'u2']))).toBe(false);
    await store.setSeat(room.id, 'u3', null);
    expect(await store.commitGame(room.id, 0, write())).toBe(false);
    expect(await store.loadGame(room.id)).toBeNull();
    expect(await store.findRoom('ABCD')).toMatchObject({ status: 'lobby' });
    expect(await store.commitGame('room-missing', 0, write())).toBe(false);
  });

  it('freezes seats once the room left the lobby', async () => {
    const store = new MemoryStore();
    const room = await seatedRoom(store);
    await store.upsertPlayer(room.id, 'u4', 'Eva');
    expect(await store.commitGame(room.id, 0, write())).toBe(true);
    expect(await store.setSeat(room.id, 'u0', null)).toBe(false);
    expect(await store.setSeat(room.id, 'u4', null)).toBe(false);
    expect((await store.listPlayers(room.id)).find((p) => p.userId === 'u0')?.seat).toBe(0);
  });

  it('changes startAt only while the room is in the lobby', async () => {
    const store = new MemoryStore();
    const room = await seatedRoom(store);
    await store.setStartAt(room.id, '2026-01-01T00:00:03Z');
    expect((await store.findRoom('ABCD'))?.startAt).toBe('2026-01-01T00:00:03Z');
    expect(await store.commitGame(room.id, 0, write())).toBe(true);
    await store.setStartAt(room.id, '2026-01-01T00:00:09Z');
    expect(await store.findRoom('ABCD')).toMatchObject({ status: 'playing', startAt: null });
  });

  it('returns JSON copies that callers cannot mutate', async () => {
    const store = new MemoryStore();
    const room = await seatedRoom(store);
    const w = write();
    // Like jsonb, undefined properties do not survive a round trip.
    (w.state.round as unknown as Record<string, unknown>).probe = undefined;
    await store.commitGame(room.id, 0, w);
    w.users[0] = 'hacker';
    const game = (await store.loadGame(room.id))!;
    expect(game.users[0]).toBe('u0');
    expect('probe' in game.state.round).toBe(false);
    game.users[0] = 'hacker';
    expect((await store.loadGame(room.id))!.users[0]).toBe('u0');
  });

  it('rate-limits chat to one message per user per second using its own clock', async () => {
    let time = new Date('2026-01-01T00:00:00Z').getTime();
    const store = new MemoryStore(() => new Date(time));
    const room = (await store.insertRoom('ABCD', 'u0'))!;
    expect(await store.insertMessage(room.id, 'u0', 'Ana', 'salut')).toBe(true);
    expect(await store.insertMessage(room.id, 'u1', 'Bogdan', 'hei')).toBe(true);
    time += 999;
    expect(await store.insertMessage(room.id, 'u0', 'Ana', 'iar')).toBe(false);
    time += 1;
    expect(await store.insertMessage(room.id, 'u0', 'Ana', 'iar')).toBe(true);
    expect(store.messages.map((m) => m.text)).toEqual(['salut', 'hei', 'iar']);
  });
});
