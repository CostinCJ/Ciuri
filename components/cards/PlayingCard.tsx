import type { Card } from '@/lib/game';
import { RANK_LABELS, RANK_NAMES, cardName } from '@/lib/ui/format';
import { SUIT_COLORS, SuitIcon } from './SuitIcon';

const SIZES = {
  sm: 'w-10 h-15',
  md: 'w-16 h-24',
  lg: 'w-20 h-30',
} as const;
export type CardSize = keyof typeof SIZES;

interface PlayingCardProps {
  card: Card;
  size?: CardSize;
  /** Interactive cards render as buttons; `playable` enables them. */
  onClick?: () => void;
  playable?: boolean;
  dimmed?: boolean;
}

function Face({ card, dimmed }: { card: Card; dimmed: boolean }) {
  const color = SUIT_COLORS[card.suit];
  return (
    <span
      className={`relative flex h-full w-full flex-col items-center justify-center rounded-lg border border-stone-400 bg-amber-50 shadow-md ${dimmed ? 'opacity-50' : ''}`}
    >
      <span className="absolute left-1 top-0.5 flex flex-col items-center leading-none" style={{ color }}>
        <span className="text-sm font-bold">{RANK_LABELS[card.rank]}</span>
        <SuitIcon suit={card.suit} className="h-3 w-3" />
      </span>
      <SuitIcon suit={card.suit} className="h-1/2 w-1/2" />
      <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-stone-700">{RANK_NAMES[card.rank]}</span>
    </span>
  );
}

export function PlayingCard({ card, size = 'md', onClick, playable = false, dimmed = false }: PlayingCardProps) {
  const base = `${SIZES[size]} block shrink-0 transition-transform`;
  if (!onClick) {
    return (
      <span role="img" aria-label={cardName(card)} className={base}>
        <Face card={card} dimmed={dimmed} />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!playable}
      aria-label={cardName(card)}
      className={`${base} ${playable ? '-translate-y-1 cursor-pointer hover:-translate-y-3' : 'cursor-not-allowed'}`}
    >
      <Face card={card} dimmed={dimmed} />
    </button>
  );
}

export function CardBack({ size = 'sm' }: { size?: CardSize }) {
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} block shrink-0 rounded-lg border border-stone-500 bg-[repeating-linear-gradient(45deg,#7f1d1d_0_6px,#991b1b_6px_12px)] shadow`}
    />
  );
}
