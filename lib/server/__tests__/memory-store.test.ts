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
