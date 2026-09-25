import { bidValue, biddingDone, legalBids, sameBid, winningBid } from './bidding';
import {
  fullDeck, marriageSuit, nextSeat, otherTeam, partnerOf, removeCard,
  sameCard, seatsFrom, shuffle, sumPoints, teamOf,
} from './cards';
import { legalCards, trickWinner } from './play';
import {
  IllegalActionError,
  type Action, type Bid, type Card, type GameState, type Phase,
  type Round, type RoundResult, type Seat,
} from './types';

export const WIN_SCORE = 21;
export const TARGET_POINTS = 66;

export function createMatch(rng: () => number = Math.random, firstDealer?: Seat): GameState {
  const dealer = firstDealer ?? (Math.floor(rng() * 4) as Seat);
  return {
    phase: 'bidding',
    score: { A: 0, B: 0 },
    roundNumber: 1,
    round: dealRound(dealer, shuffle(fullDeck(), rng)),
  };
}

/** Deals 3 cards to each seat starting with the first player; the other 8 cards stay in the stock. */
export function dealRound(dealer: Seat, deck: Card[]): Round {
  const first = nextSeat(dealer);
  const hands: Card[][] = [[], [], [], []];
  seatsFrom(first).forEach((seat, k) => {
    hands[seat] = deck.slice(3 * k, 3 * k + 3);
  });
  return {
    dealer,
    hands,
    stock: deck.slice(12),
    bids: [],
    mode: 'normal',
    bidder: null,
    trump: null,
    trumpCard: null,
    active: [0, 1, 2, 3],
    turn: first,
    leader: first,
    trick: [],
    lastTrick: null,
    lastTrickWinner: null,
    tricksTaken: { A: 0, B: 0 },
    points: { A: 0, B: 0 },
    declared: [],
    tricksPlayed: 0,
    result: null,
  };
}

export function applyAction(state: GameState, action: Action, rng: () => number = Math.random): GameState {
  const s = structuredClone(state);
  switch (action.type) {
    case 'bid':
      applyBid(s, action.seat, action.bid);
      break;
    case 'play':
      applyPlay(s, action.seat, action.card, action.declare ?? false);
      break;
    case 'stop':
      applyStop(s, action.seat);
      break;
    case 'nextRound':
      applyNextRound(s, rng);
      break;
    default: {
      const unknown: never = action;
      throw new IllegalActionError(`Acțiune necunoscută: ${(unknown as { type?: unknown }).type}`);
    }
  }
  return s;
}

/** Points for the team that took the last trick in a normal game. */
export function scoreNormal(loserTricks: number, loserPoints: number): number {
  if (loserTricks === 0) return 3;
  return loserPoints < 33 ? 2 : 1;
}

function isFollowOnlyMode(round: Round): boolean {
  return round.mode === 'mare' || round.mode === 'mica';
}

export function legalCardsFor(round: Round, seat: Seat): Card[] {
  const hand = round.hands[seat];
  // Ciuri: the bidder's first lead must be a trump (the marriage suit).
  if (round.mode === 'ciuri' && seat === round.bidder && round.tricksPlayed === 0 && round.trick.length === 0) {
    return hand.filter((x) => x.suit === round.trump);
  }
  return legalCards(hand, round.trick, round.trump, !isFollowOnlyMode(round));
}

export function canDeclare(round: Round, seat: Seat, card: Card): boolean {
  if (round.mode !== 'normal' && round.mode !== 'ciuri' && round.mode !== 'tromf') return false;
  if (round.turn !== seat || round.trick.length !== 0) return false;
  if (card.rank !== 3 && card.rank !== 4) return false;
  if (round.declared.some((d) => d.suit === card.suit)) return false;
  const pair = card.rank === 3 ? 4 : 3;
  const hand = round.hands[seat];
  return hand.some((x) => sameCard(x, card)) && hand.some((x) => x.suit === card.suit && x.rank === pair);
}

export function canStop(state: GameState, seat: Seat): boolean {
  const r = state.round;
  return state.phase === 'playing' && r.mode === 'normal' && r.turn === seat && r.tricksPlayed >= 1;
}

function requirePhase(s: GameState, phase: Phase): void {
  if (s.phase !== phase) throw new IllegalActionError('Acțiunea nu e permisă acum');
}

function requireTurn(round: Round, seat: Seat): void {
  if (round.turn !== seat) throw new IllegalActionError('Nu e rândul tău');
}

function applyBid(s: GameState, seat: Seat, bid: Bid): void {
  requirePhase(s, 'bidding');
  const r = s.round;
  requireTurn(r, seat);
  const legal = legalBids(r, seat).find((b) => sameBid(b, bid));
  if (!legal) throw new IllegalActionError('Licitație nepermisă');
  r.bids.push({ seat, bid: legal });
  if (biddingDone(r)) resolveBidding(s);
  else r.turn = nextSeat(seat);
}

/** Gives each of `seats` its 2-card packet from the stock (packet index = offset from first player). */
function dealSecond(r: Round, seats: Seat[]): void {
  const order = seatsFrom(nextSeat(r.dealer));
  for (const seat of seats) {
    const k = order.indexOf(seat);
    r.hands[seat] = [...r.hands[seat], ...r.stock.slice(2 * k, 2 * k + 2)];
  }
}

function startPlay(s: GameState, leader: Seat): void {
  s.phase = 'playing';
  s.round.leader = leader;
  s.round.turn = leader;
}

function resolveBidding(s: GameState): void {
  const r = s.round;
  const win = winningBid(r.bids);
  if (win === null) {
    dealSecond(r, seatsFrom(nextSeat(r.dealer)));
    r.trumpCard = r.hands[r.dealer][4];
    r.trump = r.trumpCard.suit;
    startPlay(s, nextSeat(r.dealer));
    return;
  }

  const { seat: bidder, bid } = win;
  r.mode = bid.kind;
  r.bidder = bidder;
  r.active = seatsFrom(bidder).filter((seat) => seat !== partnerOf(bidder));

  if (bid.kind === 'adunare') {
    const revealed = r.active.map((seat) => ({ seat, cards: [...r.hands[seat]] }));
    const sum = sumPoints(revealed.flatMap((x) => x.cards));
    finishRound(s, { ...contractResult(r, sum >= TARGET_POINTS), adunareSum: sum, revealed });
    return;
  }
  if (bid.kind === 'ciuri') r.trump = marriageSuit(r.hands[bidder]);
  if (bid.kind === 'tromf') {
    r.trump = bid.suit;
    dealSecond(r, r.active);
  }
  startPlay(s, bidder);
}

function nextActive(r: Round, seat: Seat): Seat {
  let next = nextSeat(seat);
  while (!r.active.includes(next)) next = nextSeat(next);
  return next;
}

function applyPlay(s: GameState, seat: Seat, requested: Card, declare: boolean): void {
  requirePhase(s, 'playing');
  const r = s.round;
  requireTurn(r, seat);
  // Use the card object from the hand, never the caller's object (which may carry extra fields).
  const card = legalCardsFor(r, seat).find((x) => sameCard(x, requested));
  if (!card) throw new IllegalActionError('Carte nepermisă');

  const autoDeclare = r.mode === 'ciuri' && seat === r.bidder && card.suit === r.trump;
  if ((declare || autoDeclare) && canDeclare(r, seat, card)) {
    const points = card.suit === r.trump ? 40 : 20;
    r.points[teamOf(seat)] += points;
    r.declared.push({ seat, suit: card.suit, points });
  } else if (declare) {
    throw new IllegalActionError('Nu poți striga cu această carte');
  }

  r.hands[seat] = removeCard(r.hands[seat], card);
  r.trick.push({ seat, card });

  if (isFollowOnlyMode(r) && seat !== r.bidder) {
    const led = r.trick[0].card;
    const broken = card.suit === led.suit && (r.mode === 'mare' ? card.rank > led.rank : card.rank < led.rank);
    if (broken) {
      r.lastTrick = r.trick;
      r.trick = [];
      finishRound(s, contractResult(r, false));
      return;
    }
  }

  if (r.trick.length < r.active.length) {
    r.turn = nextActive(r, seat);
    return;
  }
  completeTrick(s);
}

function completeTrick(s: GameState): void {
  const r = s.round;
  const played = r.trick;
  r.lastTrick = played;
  r.trick = [];
  r.tricksPlayed += 1;

  if (isFollowOnlyMode(r)) {
    const bidder = r.bidder as Seat;
    if (r.hands[bidder].length === 0) {
      finishRound(s, contractResult(r, true));
    } else {
      r.leader = bidder;
      r.turn = bidder;
    }
    return;
  }

  const winner = trickWinner(played, r.trump);
  const team = teamOf(winner.seat);
  r.tricksTaken[team] += 1;
  r.points[team] += sumPoints(played.map((p) => p.card));
  r.lastTrickWinner = winner.seat;

  if (r.active.every((seat) => r.hands[seat].length === 0)) {
    finishPlayedRound(s);
    return;
  }
  r.leader = winner.seat;
  r.turn = winner.seat;
}

function contractResult(r: Round, made: boolean): RoundResult {
  const bidder = r.bidder as Seat;
  const team = teamOf(bidder);
  const entry = r.bids.find((b) => b.seat === bidder);
  if (!entry) throw new Error(`Invariant: no bid recorded for bidder seat ${bidder}`);
  return {
    winner: made ? team : otherTeam(team),
    points: bidValue(entry.bid),
    reason: made ? 'contract-made' : 'contract-failed',
    mode: r.mode,
    bidder,
  };
}

function finishPlayedRound(s: GameState): void {
  const r = s.round;
  if (r.mode === 'normal') {
    const winner = teamOf(r.lastTrickWinner as Seat);
    const loser = otherTeam(winner);
    finishRound(s, {
      winner,
      points: scoreNormal(r.tricksTaken[loser], r.points[loser]),
      reason: 'normal',
      mode: 'normal',
      bidder: null,
    });
    return;
  }
  finishRound(s, contractResult(r, r.points[teamOf(r.bidder as Seat)] >= TARGET_POINTS));
}

function applyStop(s: GameState, seat: Seat): void {
  if (!canStop(s, seat)) throw new IllegalActionError('Nu poți opri acum');
  const team = teamOf(seat);
  const made = s.round.points[team] >= TARGET_POINTS;
  finishRound(s, {
    winner: made ? team : otherTeam(team),
    points: 3,
    reason: 'stop',
    mode: 'normal',
    bidder: null,
    stopBy: seat,
  });
}

function finishRound(s: GameState, result: RoundResult): void {
  s.round.result = result;
  s.score[result.winner] += result.points;
  s.phase = s.score.A >= WIN_SCORE || s.score.B >= WIN_SCORE ? 'matchOver' : 'roundOver';
}

function applyNextRound(s: GameState, rng: () => number): void {
  requirePhase(s, 'roundOver');
  s.round = dealRound(nextSeat(s.round.dealer), shuffle(fullDeck(), rng));
  s.roundNumber += 1;
  s.phase = 'bidding';
}
