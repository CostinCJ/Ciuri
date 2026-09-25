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
export type BiddingStage = 'first' | 'second';

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
  /**
   * Stage 1 ('first', 3 cards): every seat speaks once from the first player: Pas, Ciuri or Adunare.
   * Stage 2 ('second', 5 cards, after four passes): only the first player speaks: Pas, Mare, Mica or Tromful tău.
   */
  biddingStage: BiddingStage;
  /** How many times this round was redealt because the dealer's opponents held no trump. */
  redeals: number;
  /** Stage 1 bids in order, followed by the first player's stage 2 bid (if any). */
  bids: { seat: Seat; bid: Bid }[];
  mode: Mode;
  bidder: Seat | null;
  trump: Suit | null;
  trumpCard: Card | null;
  /**
   * Seats taking part in card play, clockwise starting with the leader (the bidder in a contract).
   * The order is significant: e.g. Adunare reveals hands in this order.
   */
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
