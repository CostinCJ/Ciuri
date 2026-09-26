import { legalBids } from './bidding';
import { marriageSuit, sumPoints, teamOf } from './cards';
import { TARGET_POINTS, breaksContract, canDeclare, canStop, legalCardsFor } from './engine';
import { trickWinner } from './play';
import { RANKS, SUITS, type Action, type Bid, type Card, type GameState, type Round, type Seat, type Suit } from './types';

/**
 * A simple computer player. It sees only what a player at `seat` may know (its own hand, the
 * public table) plus its own team's points, which a careful human would count as well.
 */
export function botAction(state: GameState, seat: Seat): Action | null {
  const r = state.round;
  if ((state.phase !== 'bidding' && state.phase !== 'playing') || r.turn !== seat) return null;
  if (state.phase === 'bidding') return { type: 'bid', seat, bid: chooseBid(r, seat) };
  if (canStop(state, seat) && r.points[teamOf(seat)] >= TARGET_POINTS) return { type: 'stop', seat };
  return chooseCard(r, seat);
}

function isLegal(r: Round, seat: Seat, kind: Bid['kind']): boolean {
  return legalBids(r, seat).some((b) => b.kind === kind);
}

function ofSuit(hand: Card[], suit: Suit): Card[] {
  return hand.filter((x) => x.suit === suit);
}

/** Every card is the best of its suit once the bot's own higher (Mare) or lower (Mica) cards are gone. */
function allSafe(hand: Card[], high: boolean): boolean {
  return hand.every((card) =>
    RANKS.filter((rank) => (high ? rank > card.rank : rank < card.rank))
      .every((rank) => hand.some((x) => x.suit === card.suit && x.rank === rank)));
}

function chooseBid(r: Round, seat: Seat): Bid {
  const hand = r.hands[seat];
  if (isLegal(r, seat, 'ciuri')) {
    // Ciuri: 40 from the marriage, plus a strong third trump to lead with.
    const suit = marriageSuit(hand);
    if (suit && hand.some((x) => x.suit === suit && x.rank >= 10)) return { kind: 'ciuri' };
  }
  if (isLegal(r, seat, 'mare') && allSafe(hand, true)) return { kind: 'mare' };
  if (isLegal(r, seat, 'mica') && allSafe(hand, false)) return { kind: 'mica' };
  if (isLegal(r, seat, 'tromf')) {
    const best = SUITS.map((suit) => ({ suit, cards: ofSuit(hand, suit) }))
      .filter(({ cards }) => cards.some((x) => x.rank === 11))
      .sort((a, b) => b.cards.length - a.cards.length || sumPoints(b.cards) - sumPoints(a.cards))[0];
    const strong = best && (best.cards.length >= 4 || (best.cards.length === 3 && best.cards.some((x) => x.rank === 10)));
    if (strong) return { kind: 'tromf', suit: best.suit };
  }
  return { kind: 'pass' };
}

const byRank = (a: Card, b: Card) => a.rank - b.rank;

function lowest(cards: Card[], trump: Suit | null): Card {
  // Keep trumps for later: the cheapest non-trump first.
  const plain = cards.filter((x) => x.suit !== trump);
  return [...(plain.length > 0 ? plain : cards)].sort(byRank)[0];
}

function highest(cards: Card[], trump: Suit | null): Card {
  const plain = cards.filter((x) => x.suit !== trump);
  return [...(plain.length > 0 ? plain : cards)].sort(byRank).at(-1) as Card;
}

function chooseCard(r: Round, seat: Seat): Action {
  const legal = legalCardsFor(r, seat);
  const play = (card: Card, declare = false): Action => ({ type: 'play', seat, card, ...(declare ? { declare } : {}) });

  if (r.mode === 'mare' || r.mode === 'mica') {
    const high = r.mode === 'mare';
    if (seat === r.bidder) return play([...legal].sort(byRank).at(high ? -1 : 0) as Card);
    // Opponents break the contract whenever they can.
    const breaking = legal.find((x) => breaksContract(r, seat, x));
    return play(breaking ?? [...legal].sort(byRank)[0]);
  }

  if (r.trick.length === 0) {
    const declarable = legal.filter((x) => canDeclare(r, seat, x)).sort((a, b) => Number(b.suit === r.trump) - Number(a.suit === r.trump));
    if (declarable.length > 0) return play(declarable[0], true);
    const aces = legal.filter((x) => x.rank === 11 && x.suit !== r.trump);
    if (aces.length > 0) return play(aces[0]);
    return play(lowest(legal, r.trump));
  }

  const last = r.trick.length === r.active.length - 1;
  const winner = trickWinner(r.trick, r.trump);
  if (teamOf(winner.seat) === teamOf(seat) && winner.seat !== seat) {
    // Partner is winning: give points when nobody can take them away any more.
    return play(last ? highest(legal, r.trump) : lowest(legal, r.trump));
  }
  const winning = legal.filter((x) => trickWinner([...r.trick, { seat, card: x }], r.trump).seat === seat);
  if (winning.length > 0) {
    const plain = winning.filter((x) => x.suit !== r.trump);
    const pool = plain.length > 0 ? plain : winning;
    // Last to play: the cheapest card that wins. Otherwise the strongest, to keep the trick.
    return play([...pool].sort(byRank).at(last ? 0 : -1) as Card);
  }
  return play(lowest(legal, r.trump));
}
