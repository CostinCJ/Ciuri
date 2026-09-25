import type { Bid } from '@/lib/game';
import { CardBack } from '@/components/cards/PlayingCard';
import { bidLabel } from '@/lib/ui/format';

interface PlayerSeatProps {
  name: string;
  team: 'A' | 'B';
  cardCount: number;
  isTurn: boolean;
  isDealer: boolean;
  offline: boolean;
  sittingOut: boolean;
  bid: Bid | null;
  /** 0..1 fraction of the move time left, or null when this seat is not on turn. */
  timeLeft: number | null;
  secondsLeft: number | null;
}

export function PlayerSeat(props: PlayerSeatProps) {
  const { name, team, cardCount, isTurn, isDealer, offline, sittingOut, bid, timeLeft, secondsLeft } = props;
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 short:grid short:grid-cols-[auto_auto] short:gap-x-2 short:gap-y-0.5 short:px-2 short:py-1 ${isTurn ? 'bg-amber-500/20 ring-2 ring-amber-400' : 'bg-stone-900/50'}`}
      aria-label={`${name}${isTurn ? ', la rând' : ''}`}
    >
      <span className="flex items-center gap-1 text-sm font-semibold short:col-start-1">
        <span className={`h-2 w-2 rounded-full ${team === 'A' ? 'bg-sky-400' : 'bg-orange-400'}`} />
        {name}
        {isDealer && <span className="rounded bg-stone-700 px-1 text-[0.6rem] uppercase">împarte</span>}
      </span>
      {offline && <span className="text-xs text-red-300 short:col-start-1">deconectat</span>}
      {sittingOut ? (
        <span className="text-xs text-stone-400 short:col-start-2 short:row-span-4 short:row-start-1">stă (joacă singur coechipierul)</span>
      ) : (
        <span className="flex -space-x-6 short:col-start-2 short:row-span-4 short:row-start-1 short:-space-x-4">
          {Array.from({ length: cardCount }, (_, i) => (
            <CardBack key={i} size="sm" />
          ))}
        </span>
      )}
      {bid && <span className="text-xs text-amber-200 short:col-start-1">{bidLabel(bid)}</span>}
      {isTurn && timeLeft !== null && (
        <span className="flex w-full items-center gap-1 text-xs tabular-nums short:col-start-1">
          <span className="h-1 flex-1 overflow-hidden rounded bg-stone-700">
            <span className="block h-full bg-amber-400" style={{ width: `${Math.round(timeLeft * 100)}%` }} />
          </span>
          {secondsLeft}s
        </span>
      )}
    </div>
  );
}
