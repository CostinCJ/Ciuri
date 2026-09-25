import { legalBids } from './bidding';
import { breaksContract, canDeclare, canStop, legalCardsFor } from './engine';
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

/** The Ciuri bidder's trump marriage is declared automatically, so it is never offered as a choice. */
function isAutoDeclared(round: Round, seat: Seat, card: Card): boolean {
  return round.mode === 'ciuri' && seat === round.bidder && card.suit === round.trump;
}

export function legalMoves(state: GameState, seat: Seat): LegalMoves {
  const none: LegalMoves = { bids: [], cards: [], declarable: [], canStop: false };
  if (pendingSeat(state) !== seat) return none;
  if (state.phase === 'bidding') return { ...none, bids: legalBids(state.round, seat) };
  const cards = legalCardsFor(state.round, seat);
  return {
    bids: [],
    cards,
    declarable: cards.filter((card) => canDeclare(state.round, seat, card) && !isAutoDeclared(state.round, seat, card)),
    canStop: canStop(state, seat),
  };
}

/** The automatic move applied when the current deadline expires. */
export function timeoutAction(state: GameState): Action | null {
  if (state.phase === 'roundOver') return { type: 'nextRound' };
  const seat = pendingSeat(state);
  if (seat === null) return null;
  if (state.phase === 'bidding') return { type: 'bid', seat, bid: { kind: 'pass' } };
  const legal = [...legalCardsFor(state.round, seat)].sort(
    (a, b) => a.rank - b.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit),
  );
  // A timed-out Mare/Mica opponent must not profit: avoid breaking the contract when possible.
  const [card] = legal.filter((x) => !breaksContract(state.round, seat, x)).concat(legal);
  if (card === undefined) throw new Error(`Invariant: seat ${seat} is on turn but has no legal card`);
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
