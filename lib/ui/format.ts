import { teamOf, type Bid, type Card, type Mode, type Rank, type RoundResult, type Suit, type Team } from '@/lib/game';
import type { GameEvent } from '@/lib/server/events';

export const SUIT_NAMES: Record<Suit, string> = { rosu: 'Roșu', verde: 'Verde', ghinda: 'Ghindă', duba: 'Dubă' };
export const RANK_LABELS: Record<Rank, string> = { 2: '2', 3: '3', 4: '4', 10: '10', 11: 'A' };
export const RANK_NAMES: Record<Rank, string> = { 2: 'Doi', 3: 'Trei', 4: 'Patru', 10: 'Zece', 11: 'As' };

const MODE_NAMES: Record<Mode, string> = {
  normal: 'Joc normal',
  ciuri: 'Ciuri',
  adunare: 'Adunare',
  tromf: 'Tromful tău',
  mare: 'Mare',
  mica: 'Mica',
};

export function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank]} ${SUIT_NAMES[card.suit]}`;
}

export function modeName(mode: Mode): string {
  return MODE_NAMES[mode];
}

export function bidLabel(bid: Bid): string {
  switch (bid.kind) {
    case 'pass':
      return 'Pas';
    case 'tromf':
      return `Tromful tău: ${SUIT_NAMES[bid.suit]}`;
    default:
      return MODE_NAMES[bid.kind];
  }
}

export function teamName(team: Team): string {
  return `Echipa ${team}`;
}

/** Romanian: "1 punct", "12 puncte", "20 de puncte", "101 puncte". */
export function pointsText(n: number): string {
  if (n === 1) return '1 punct';
  const lastTwo = n % 100;
  const needsDe = n >= 20 && !(lastTwo >= 1 && lastTwo <= 19);
  return `${n} ${needsDe ? 'de puncte' : 'puncte'}`;
}

export function resultText(result: RoundResult, names: string[]): string {
  const gain = `${teamName(result.winner)} primește ${pointsText(result.points)}.`;
  switch (result.reason) {
    case 'normal':
      return `${teamName(result.winner)} primește ${pointsText(result.points)} (a luat ultima mână).`;
    case 'stop': {
      const stopBy = result.stopBy ?? 0;
      const failed = teamOf(stopBy) !== result.winner;
      return `${names[stopBy]} a zis Stop${failed ? ', dar nu avea 66' : ''}. ${gain}`;
    }
    case 'contract-made':
    case 'contract-failed': {
      const verb = result.reason === 'contract-made' ? 'a făcut' : 'n-a făcut';
      const revealed = result.adunareSum === undefined ? '' : ` Cărțile arătate: ${pointsText(result.adunareSum)}.`;
      return `${names[result.bidder ?? 0]} ${verb} ${modeName(result.mode)}.${revealed} ${gain}`;
    }
  }
}

export function describeEvent(event: GameEvent, names: string[]): string {
  switch (event.type) {
    case 'matchStart':
      return `Meci nou. Împarte ${names[event.dealer]}.`;
    case 'newRound':
      return `Runda ${event.roundNumber}. Împarte ${names[event.dealer]}.`;
    case 'timeout':
      return `${names[event.seat]} n-a mutat la timp.`;
    case 'bid':
      return event.bid.kind === 'pass' ? `${names[event.seat]}: Pas.` : `${names[event.seat]} a zis ${bidLabel(event.bid)}.`;
    case 'declare':
      return `${names[event.seat]} a strigat ${event.points} (${SUIT_NAMES[event.suit]}).`;
    case 'trick':
      return event.winner === null ? 'Mână jucată.' : `${names[event.winner]} ia mâna (${pointsText(event.points)}).`;
    case 'roundEnd':
      return resultText(event.result, names);
  }
}
