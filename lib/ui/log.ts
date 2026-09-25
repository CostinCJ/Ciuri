import type { GameEvent } from '@/lib/server/events';

/**
 * Stable, unique React keys for the (capped) event log. Each event is keyed by the round marker
 * before it (matchStart / newRound) and its offset from that marker, so the key does not depend on
 * how many old events the cap dropped. Events before the first marker still in the log (their
 * marker was cut off) get unique `pre:` keys; they are far older than the few events on screen.
 */
export function logKeys(log: GameEvent[]): string[] {
  const first = log.findIndex((e) => e.type === 'matchStart' || e.type === 'newRound');
  const keys: string[] = [];
  let segment = 'pre';
  let start = first === -1 ? log.length : first;
  log.forEach((event, i) => {
    if (event.type === 'matchStart') {
      segment = 'm';
      start = i;
    } else if (event.type === 'newRound') {
      segment = `r${event.roundNumber}`;
      start = i;
    }
    keys.push(`${segment}:${i - start}`);
  });
  return keys;
}
