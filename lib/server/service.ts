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

/** The user's seat in a game (from the game's own seat → user mapping), or null. */
function gameSeat(game: GameRecord, userId: string): Seat | null {
  return SEATS.find((seat) => game.users[seat] === userId) ?? null;
}

/** Attaches the server-side seat to a validated client action. */
function toAction(input: PlayerActionInput, seat: Seat): Action {
  switch (input.type) {
    case 'bid':
      return { type: 'bid', seat, bid: input.bid };
    case 'play':
      return { type: 'play', seat, card: input.card, declare: input.declare };
    case 'stop':
      return { type: 'stop', seat };
  }
}

function countdownEnd(deps: ServiceDeps): string {
  return new Date(deps.now().getTime() + START_COUNTDOWN_SECONDS * 1000).toISOString();
}

export function buildWrite(state: GameState, log: GameEvent[], users: string[], now: Date): GameWrite {
  return {
    state,
    view: publicView(state),
    log,
    deadline: deadlineFor(state, now)?.toISOString() ?? null,
    users,
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

/**
 * Lobby: members may always come back; newcomers only while a seat is free.
 * Started or finished room: only players with a seat may come back (spec §2.2).
 */
export async function joinRoom(deps: ServiceDeps, code: string, userId: string, name: string): Promise<string> {
  const room = await requireRoom(deps.store, code);
  const players = await deps.store.listPlayers(room.id);
  const member = players.find((p) => p.userId === userId);
  const allowed = room.status === 'lobby'
    ? member !== undefined || seatUsers(players) === null
    : member !== undefined && member.seat !== null;
  if (!allowed) throw new HttpError(409, 'Camera e plină');
  await deps.store.upsertPlayer(room.id, userId, name);
  return room.code;
}

/**
 * Sits down (or stands up with null). The countdown starts when the table becomes full and is
 * cancelled when it stops being full; seat calls on a table that stays full keep it unchanged.
 */
export async function takeSeat(deps: ServiceDeps, code: string, userId: string, seat: Seat | null): Promise<void> {
  const room = await requireRoom(deps.store, code);
  requireMember(await deps.store.listPlayers(room.id), userId);
  const seated = await deps.store.setSeat(room.id, userId, seat);
  const current = (await deps.store.findRoom(room.code)) ?? room;
  if (!seated) throw new HttpError(409, current.status === 'lobby' ? 'Locul e ocupat' : 'Jocul a început deja');

  const full = seatUsers(await deps.store.listPlayers(room.id)) !== null;
  if (full && current.startAt === null) await deps.store.setStartAt(room.id, countdownEnd(deps));
  else if (!full && current.startAt !== null) await deps.store.setStartAt(room.id, null);
}

/** Applies an action and commits it. False when another request committed first. */
async function commitAction(deps: ServiceDeps, roomId: string, game: GameRecord, action: Action, automatic: boolean): Promise<boolean> {
  let next: GameState;
  try {
    next = applyAction(game.state, action, deps.rng);
  } catch (error) {
    if (error instanceof IllegalActionError) throw new HttpError(400, error.message);
    throw error;
  }
  const log = appendLog(game.log, describeTransition(game.state, next, action, automatic));
  return deps.store.commitGame(roomId, game.version, buildWrite(next, log, game.users, deps.now()));
}

/** False when the store refused the start (seats changed, or someone else started it first). */
async function startMatch(deps: ServiceDeps, roomId: string, users: string[], expectedVersion: number): Promise<boolean> {
  const state = createMatch(deps.rng);
  const log: GameEvent[] = [{ type: 'matchStart', dealer: state.round.dealer }];
  return deps.store.commitGame(roomId, expectedVersion, buildWrite(state, log, users, deps.now()));
}

export async function act(deps: ServiceDeps, code: string, userId: string, input: PlayerActionInput): Promise<void> {
  const room = await requireRoom(deps.store, code);
  requireMember(await deps.store.listPlayers(room.id), userId);
  const game = room.status === 'playing' ? await deps.store.loadGame(room.id) : null;
  if (!game) throw new HttpError(409, 'Jocul nu e în desfășurare');
  const seat = gameSeat(game, userId);
  if (seat === null) throw new HttpError(409, 'Nu ai loc la această masă');
  if (!(await commitAction(deps, room.id, game, toAction(input, seat), false))) {
    throw new HttpError(409, 'Starea jocului s-a schimbat, reîncearcă');
  }
}

/**
 * Advances time-based transitions: starts the match after the lobby countdown, or applies
 * the automatic move once the current deadline has passed. Safe to call by every client;
 * returns false when nothing changed (including when another client was faster).
 */
export async function tick(deps: ServiceDeps, code: string, userId: string): Promise<boolean> {
  const room = await requireRoom(deps.store, code);
  const players = await deps.store.listPlayers(room.id);
  requireMember(players, userId);
  const now = deps.now();

  if (room.status === 'lobby') {
    const users = seatUsers(players);
    if (!users) {
      // Self-heal: a countdown left over on a table that is no longer full (e.g. a lost write).
      if (room.startAt !== null) await deps.store.setStartAt(room.id, null);
      return false;
    }
    if (room.startAt === null) {
      // Self-heal: a full table without a countdown (e.g. a lost write) gets a fresh one.
      await deps.store.setStartAt(room.id, countdownEnd(deps));
      return false;
    }
    if (new Date(room.startAt) > now) return false;
    return startMatch(deps, room.id, users, 0);
  }
  if (room.status !== 'playing') return false;

  const game = await deps.store.loadGame(room.id);
  if (!game?.deadline || new Date(game.deadline) > now) return false;
  const action = timeoutAction(game.state);
  if (!action) return false;
  return commitAction(deps, room.id, game, action, true);
}

export async function rematch(deps: ServiceDeps, code: string, userId: string): Promise<boolean> {
  const room = await requireRoom(deps.store, code);
  requireMember(await deps.store.listPlayers(room.id), userId);
  const game = await deps.store.loadGame(room.id);
  if (room.status !== 'finished' || !game) throw new HttpError(409, 'Meciul nu s-a terminat');
  if (gameSeat(game, userId) === null) throw new HttpError(409, 'Nu ai loc la această masă');
  return startMatch(deps, room.id, game.users, game.version);
}

export async function sendMessage(deps: ServiceDeps, code: string, userId: string, text: string): Promise<void> {
  const room = await requireRoom(deps.store, code);
  const player = requireMember(await deps.store.listPlayers(room.id), userId);
  if (!(await deps.store.insertMessage(room.id, userId, player.name, text))) {
    throw new HttpError(429, 'Prea multe mesaje, așteaptă o secundă');
  }
}
