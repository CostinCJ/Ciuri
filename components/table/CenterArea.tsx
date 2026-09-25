import { biddingStageOf, type PublicRound, type PublicState, type Seat } from '@/lib/game';
import { PlayingCard } from '@/components/cards/PlayingCard';
import { SuitIcon } from '@/components/cards/SuitIcon';
import { SUIT_NAMES, modeName } from '@/lib/ui/format';
import { positionOf, type Position } from '@/lib/ui/seats';

const SLOT: Record<Position, string> = {
  top: 'col-start-2 row-start-1',
  left: 'col-start-1 row-start-2',
  right: 'col-start-3 row-start-2',
  bottom: 'col-start-2 row-start-3',
};

const CHIP = 'flex items-center gap-1 rounded bg-stone-900/70 px-2 py-1';

/**
 * The trump suit as an icon and, when the trump came from the dealer's 5th card, that card.
 * Live round points are deliberately never shown: players count them to decide on Stop.
 */
function TrumpInfo({ round }: { round: PublicRound }) {
  if (round.trump === null) {
    if (round.mode !== 'mare' && round.mode !== 'mica') return null;
    return <span className={CHIP}>Fără tromf</span>;
  }
  return (
    <>
      <span className={CHIP}>
        <span aria-hidden="true">Tromf</span>
        <SuitIcon suit={round.trump} className="h-5 w-5 short:h-4 short:w-4" />
        <span className="sr-only">Tromf: {SUIT_NAMES[round.trump]}</span>
      </span>
      {round.trumpCard && (
        <figure className={`${CHIP} m-0 py-0.5`} aria-label="Cartea de tromf">
          <PlayingCard card={round.trumpCard} size="sm" />
          <figcaption className="max-w-16 leading-tight">Cartea de tromf</figcaption>
        </figure>
      )}
    </>
  );
}

function BiddingInfo({ view, names, viewer }: { view: PublicState; names: string[]; viewer: Seat | null }) {
  const round = view.round;
  const second = biddingStageOf(round) === 'second';
  return (
    <div className="flex flex-col items-center gap-0.5 text-center text-sm short:text-xs" aria-live="polite">
      <span className="font-semibold text-amber-200">
        {second ? 'Licitație — Mică, Mare sau Tromful tău (5 cărți)' : 'Licitație — primele 3 cărți (Ciuri / Adunare)'}
      </span>
      {second && viewer !== round.turn && (
        <span className="text-stone-200">Așteptăm alegerea lui {names[round.turn]}</span>
      )}
    </div>
  );
}

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
        <TrumpInfo round={round} />
      </div>
      {view.phase === 'bidding' && <BiddingInfo view={view} names={names} viewer={viewer} />}

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
