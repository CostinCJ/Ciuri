import type { PublicState, Seat } from '@/lib/game';
import { PlayingCard } from '@/components/cards/PlayingCard';
import { SuitIcon } from '@/components/cards/SuitIcon';
import { SUIT_NAMES, cardName, modeName } from '@/lib/ui/format';
import { positionOf, type Position } from '@/lib/ui/seats';

const SLOT: Record<Position, string> = {
  top: 'col-start-2 row-start-1',
  left: 'col-start-1 row-start-2',
  right: 'col-start-3 row-start-2',
  bottom: 'col-start-2 row-start-3',
};

export function CenterArea({ view, names, viewer }: { view: PublicState; names: string[]; viewer: Seat | null }) {
  const round = view.round;
  const showingLast = round.trick.length === 0 && round.lastTrick !== null;
  const plays = showingLast ? (round.lastTrick ?? []) : round.trick;

  return (
    <div className="flex flex-col items-center gap-3 short:gap-1">
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-stone-200 short:gap-1 short:text-[0.65rem]">
        {round.mode !== 'normal' && round.bidder !== null && (
          <span className="rounded bg-stone-900/70 px-2 py-1">
            {modeName(round.mode)} · {names[round.bidder]}
          </span>
        )}
        <span aria-label={round.trump ? `Tromf: ${SUIT_NAMES[round.trump]}` : 'Fără tromf'} className="flex items-center gap-1 rounded bg-stone-900/70 px-2 py-1">
          Tromf:
          {round.trumpCard ? (
            <span className="font-semibold">{cardName(round.trumpCard)}</span>
          ) : round.trump ? (
            <SuitIcon suit={round.trump} className="h-4 w-4" />
          ) : (
            <span>—</span>
          )}
        </span>
        <span className="rounded bg-stone-900/70 px-2 py-1 tabular-nums">
          Runda: A {round.points.A} · B {round.points.B}
        </span>
      </div>

      <section aria-label="Masa" className={`grid grid-cols-3 grid-rows-[repeat(3,3.5rem)] place-items-center gap-x-1 py-5 short:grid-rows-[repeat(3,2.25rem)] short:py-3.5 ${showingLast ? 'opacity-50' : ''}`}>
        {plays.map((play) => (
          <div key={`${play.seat}-${play.card.suit}-${play.card.rank}`} className={SLOT[positionOf(play.seat, viewer)]}>
            <PlayingCard card={play.card} size="md" />
          </div>
        ))}
      </section>
      {showingLast && <span className="text-xs text-stone-400">Ultima mână</span>}
    </div>
  );
}
