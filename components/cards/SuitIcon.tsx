import type { Suit } from '@/lib/game';

export const SUIT_COLORS: Record<Suit, string> = {
  rosu: '#c62828',
  verde: '#2e7d32',
  ghinda: '#8d5524',
  duba: '#c79100',
};

/** Our own simple drawings of the Hungarian suits: heart, leaf, acorn, bell. */
export function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
  const color = SUIT_COLORS[suit];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {suit === 'rosu' && (
        <path fill={color} d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z" />
      )}
      {suit === 'verde' && (
        <>
          <path fill={color} d="M12 2C7.5 5.5 4.5 9.5 4.5 13.5A7.5 7.5 0 0 0 12 21a7.5 7.5 0 0 0 7.5-7.5C19.5 9.5 16.5 5.5 12 2z" />
          <path stroke="#1b4d1e" strokeWidth="1.2" fill="none" d="M12 6v17" />
        </>
      )}
      {suit === 'ghinda' && (
        <>
          <path fill="#5d3a1a" d="M4.5 10.5C4.5 6.9 7.9 4 12 4s7.5 2.9 7.5 6.5z" />
          <path fill={color} d="M6.5 10.5h11V13c0 4-2.5 8-5.5 8s-5.5-4-5.5-8z" />
          <path stroke="#5d3a1a" strokeWidth="1.5" d="M12 1.5V4" />
        </>
      )}
      {suit === 'duba' && (
        <>
          <path fill={color} d="M12 3a6 6 0 0 0-6 6v5l-2.5 3.5h17L18 14V9a6 6 0 0 0-6-6z" />
          <circle cx="12" cy="20" r="2" fill="#7a5a00" />
        </>
      )}
    </svg>
  );
}
