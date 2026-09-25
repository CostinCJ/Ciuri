import { describe, expect, it } from 'vitest';
import type { PublicState } from '@/lib/game';
import type { GameSnapshot } from '@/lib/server/service';
import {
  MESSAGE_LIMIT, parseMessageRow, parsePublicGameRow, parseRoomRow, withGame, withMessage, withPublicGame, withRoom, withSnapshot,
} from '../room-merge';
import type { GameRow, HandRow, MessageRow, RoomData } from '../use-room';

const view = (roundNumber: number) => ({ roundNumber }) as unknown as PublicState;
const game = (version: number): GameRow => ({ version, view: view(version), log: [], deadline: null });
const moves = { bids: [], cards: [{ suit: 'rosu', rank: 'A' }], declarable: [], canStop: true } as unknown as HandRow['moves'];
const hand = (label: string): HandRow => ({ seat: 0, cards: [], moves: { ...moves, bids: [label] as never } });
const message = (id: number): MessageRow => ({ id, user_id: 'u', name: 'Ana', text: `m${id}`, created_at: '2026-01-01T00:00:00Z' });

function data(overrides: Partial<RoomData> = {}): RoomData {
  return {
    room: { id: 'r', code: 'ABCD', status: 'playing', start_at: null },
    players: [],
    game: game(5),
    hand: hand('v5'),
    messages: [],
    ...overrides,
  };
}

describe('withGame', () => {
  it('applies the same or a newer version with its hand', () => {
    expect(withGame(data(), game(5), hand('again')).hand).toEqual(hand('again'));
    expect(withGame(data(), game(6), hand('v6'))).toMatchObject({ game: game(6), hand: hand('v6') });
  });

  it('ignores an older version or a missing game once a game is shown', () => {
    const current = data();
    expect(withGame(current, game(4), hand('v4'))).toBe(current);
    expect(withGame(current, null, null)).toBe(current);
  });

  it('accepts the first game', () => {
    expect(withGame(data({ game: null, hand: null }), game(1), hand('v1')).game).toEqual(game(1));
  });
});

describe('withSnapshot', () => {
  const snapshot = (version: number, roomStatus: GameSnapshot['roomStatus']): GameSnapshot => ({
    ...game(version), hand: hand(`v${version}`), roomStatus,
  });

  it('shows the committed game and hand', () => {
    expect(withSnapshot(data(), snapshot(6, 'playing'))).toMatchObject({ game: game(6), hand: hand('v6') });
  });

  it('moves the room out of the lobby when the snapshot started the match', () => {
    const lobby = data({ room: { id: 'r', code: 'ABCD', status: 'lobby', start_at: 'x' }, game: null, hand: null });
    expect(withSnapshot(lobby, snapshot(1, 'playing')).room).toEqual({ id: 'r', code: 'ABCD', status: 'playing', start_at: null });
  });

  it('ignores a snapshot older than the game shown', () => {
    const current = data();
    expect(withSnapshot(current, snapshot(4, 'finished'))).toBe(current);
  });
});

describe('withPublicGame', () => {
  it('shows a newer view and withholds the moves of the older hand', () => {
    const next = withPublicGame(data(), game(6));
    expect(next.game).toEqual(game(6));
    expect(next.hand?.cards).toEqual([]);
    expect(next.hand?.moves).toEqual({ bids: [], cards: [], declarable: [], canStop: false });
  });

  it('ignores the version already shown (e.g. from the move response) or older', () => {
    const current = data();
    expect(withPublicGame(current, game(5))).toBe(current);
    expect(withPublicGame(current, game(3))).toBe(current);
  });

  it('works for spectators without a hand', () => {
    expect(withPublicGame(data({ hand: null }), game(6)).hand).toBeNull();
  });
});

describe('withRoom', () => {
  it('applies changes and keeps the same object when nothing changed', () => {
    const current = data();
    expect(withRoom(current, { ...current.room })).toBe(current);
    expect(withRoom(current, { ...current.room, status: 'finished' }).room.status).toBe('finished');
  });

  it('never goes back to the lobby', () => {
    const current = data();
    expect(withRoom(current, { ...current.room, status: 'lobby' })).toBe(current);
  });
});

describe('withMessage', () => {
  it('adds a message once, ordered by id, keeping the newest ones', () => {
    const full = data({ messages: Array.from({ length: MESSAGE_LIMIT }, (_, i) => message(i + 1)) });
    const next = withMessage(full, message(MESSAGE_LIMIT + 1));
    expect(next.messages).toHaveLength(MESSAGE_LIMIT);
    expect(next.messages[0].id).toBe(2);
    expect(next.messages.at(-1)?.id).toBe(MESSAGE_LIMIT + 1);
    expect(withMessage(next, message(MESSAGE_LIMIT + 1))).toBe(next);
  });
});

describe('payload parsing', () => {
  it('accepts complete rows and rejects incomplete ones', () => {
    expect(parseRoomRow({ id: 'r', code: 'ABCD', status: 'playing', start_at: null, created_by: 'u' }))
      .toEqual({ id: 'r', code: 'ABCD', status: 'playing', start_at: null });
    expect(parseRoomRow({ id: 'r', code: 'ABCD', status: 'weird', start_at: null })).toBeNull();
    expect(parseRoomRow({})).toBeNull();

    expect(parsePublicGameRow({ room_id: 'r', ...game(6) })).toEqual(game(6));
    expect(parsePublicGameRow({ version: 6, view: view(6), deadline: null })).toBeNull();
    expect(parsePublicGameRow({ version: 6, view: null, log: [], deadline: null })).toBeNull();

    expect(parseMessageRow({ room_id: 'r', ...message(1) })).toEqual(message(1));
    expect(parseMessageRow({ id: '1', user_id: 'u', name: 'Ana', text: 'x', created_at: 'y' })).toBeNull();
  });
});
