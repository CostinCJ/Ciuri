import type { Card, Suit, TrickPlay } from './types';

function beats(card: Card, best: Card, trump: Suit | null): boolean {
  if (card.suit === best.suit) return card.rank > best.rank;
  // Different suits: only a trump can beat the current best (which is then not a trump).
  return trump !== null && card.suit === trump;
}

/** Winning play of `trick`; the trick must be non-empty. */
export function trickWinner(trick: TrickPlay[], trump: Suit | null): TrickPlay {
  let best = trick[0];
  for (const play of trick.slice(1)) {
    if (beats(play.card, best.card, trump)) best = play;
  }
  return best;
}

/**
 * Cards a player may play into `trick`.
 * strict = trump-game obligations (follow, beat, trump, over-trump); otherwise only follow suit.
 */
export function legalCards(hand: Card[], trick: TrickPlay[], trump: Suit | null, strict: boolean): Card[] {
  if (trick.length === 0) return hand;
  const led = trick[0].card.suit;
  const follow = hand.filter((x) => x.suit === led);
  if (!strict) return follow.length > 0 ? follow : hand;

  const winning = trickWinner(trick, trump).card;
  if (follow.length > 0) {
    if (winning.suit !== led) return follow;
    const higher = follow.filter((x) => x.rank > winning.rank);
    return higher.length > 0 ? higher : follow;
  }
  const trumps = trump === null ? [] : hand.filter((x) => x.suit === trump);
  if (trumps.length > 0) {
    if (winning.suit !== trump) return trumps;
    const higher = trumps.filter((x) => x.rank > winning.rank);
    return higher.length > 0 ? higher : trumps;
  }
  return hand;
}
