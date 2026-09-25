import Image from 'next/image';
import type { Card } from '@/lib/game';
import { cardName } from '@/lib/ui/format';

const SIZES = {
  sm: 'w-10 h-15 short:w-8 short:h-12',
  md: 'w-16 h-24 short:w-11 short:h-16',
  lg: 'w-20 h-30 short:w-13 short:h-19',
} as const;
export type CardSize = keyof typeof SIZES;

/** Source images are 240×387 (Hungarian Tell pattern, see public/cards/CREDITS.md). */
const IMG_WIDTH = 240;
const IMG_HEIGHT = 387;

interface PlayingCardProps {
  card: Card;
  size?: CardSize;
  /** Interactive cards render as buttons; `playable` enables them. */
  onClick?: () => void;
  playable?: boolean;
  dimmed?: boolean;
}

function Face({ card, dimmed }: { card: Card; dimmed: boolean }) {
  return (
    <Image
      src={`/cards/${card.suit}-${card.rank}.webp`}
      alt=""
      width={IMG_WIDTH}
      height={IMG_HEIGHT}
      unoptimized
      draggable={false}
      className={`h-full w-full select-none object-contain drop-shadow-md ${dimmed ? 'brightness-75' : ''}`}
    />
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
    <span aria-hidden="true" className={`${SIZES[size]} flex shrink-0 items-center justify-center`}>
      {/* Same aspect ratio and corner radius as the card faces. */}
      <span className="block aspect-[240/387] h-full max-w-full rounded-[6%/3.8%] border-2 border-white bg-[repeating-linear-gradient(45deg,#7f1d1d_0_6px,#991b1b_6px_12px)] shadow" />
    </span>
  );
}
