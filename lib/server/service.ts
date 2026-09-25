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
