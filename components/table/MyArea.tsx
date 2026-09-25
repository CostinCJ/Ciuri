'use client';

import { useState } from 'react';
import type { Bid, Card, PublicState } from '@/lib/game';
import { sameCard } from '@/lib/game';
import type { HandRow } from '@/lib/client/use-room';
import { api } from '@/lib/client/api';
import type { PlayerActionInput } from '@/lib/server/schemas';
import { PlayingCard } from '@/components/cards/PlayingCard';
import { SuitIcon } from '@/components/cards/SuitIcon';
import { bidLabel, cardName } from '@/lib/ui/format';

interface MyAreaProps {
  code: string;
  view: PublicState;
  hand: HandRow;
  secondsLeft: number | null;
}

export function MyArea({ code, view, hand, secondsLeft }: MyAreaProps) {
  const [sending, setSending] = useState(false);
  // The hand row an accepted move was made from. Its `moves` are stale until the realtime
  // re-fetch delivers a new row, so controls stay disabled while it is still the current one.
  const [acceptedFrom, setAcceptedFrom] = useState<HandRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState<Card | null>(null);
  const busy = sending || acceptedFrom === hand;
  const moves = hand.moves;
  const myTurn = moves.bids.length > 0 || moves.cards.length > 0;

  async function send(action: PlayerActionInput) {
    const from = hand;
    setSending(true);
    setError(null);
    setDeclaring(null);
    try {
      await api.act(code, action);
      setAcceptedFrom(from);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mutarea nu a fost acceptată.');
    } finally {
      setSending(false);
    }
  }

  function onCard(card: Card) {
    if (moves.declarable.some((d) => sameCard(d, card))) setDeclaring(card);
    else void send({ type: 'play', card });
  }

  const simpleBids = moves.bids.filter((b) => b.kind !== 'tromf');
  const tromfBids = moves.bids.filter((b): b is Extract<Bid, { kind: 'tromf' }> => b.kind === 'tromf');
  const declarePoints = declaring && view.round.trump === declaring.suit ? 40 : 20;

  return (
    <div className="flex flex-col items-center gap-3">
      {myTurn && (
        <p className="text-sm font-semibold text-amber-300" aria-live="polite">
          E rândul tău{secondsLeft !== null ? ` · ${secondsLeft}s` : ''}
        </p>
      )}

      {moves.bids.length > 0 && (
        <div role="group" aria-label="Licitație" className="flex flex-wrap items-center justify-center gap-2">
          {simpleBids.map((b) => (
            <button
              key={b.kind}
              type="button"
              disabled={busy}
              onClick={() => void send({ type: 'bid', bid: b })}
              className={`rounded-md px-4 py-2 font-semibold ${b.kind === 'pass' ? 'bg-stone-200 text-stone-900' : 'bg-amber-500 text-stone-900'} disabled:opacity-50`}
            >
              {bidLabel(b)}
            </button>
          ))}
          {tromfBids.length > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-stone-900/70 px-2 py-1 text-sm">
              Tromful tău:
              {tromfBids.map((b) => (
                <button
                  key={b.suit}
                  type="button"
                  disabled={busy}
                  aria-label={bidLabel(b)}
                  onClick={() => void send({ type: 'bid', bid: b })}
                  className="rounded bg-amber-50 p-1 disabled:opacity-50"
                >
                  <SuitIcon suit={b.suit} className="h-6 w-6" />
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {declaring && (
        <div role="dialog" aria-label="Strigare" className="flex flex-wrap items-center justify-center gap-2 rounded-md bg-stone-900/80 px-3 py-2 text-sm">
          Strigi {declarePoints} cu {cardName(declaring)}?
          <button type="button" className="rounded bg-amber-500 px-3 py-1 font-semibold text-stone-900" onClick={() => void send({ type: 'play', card: declaring, declare: true })}>
            Da, strig
          </button>
          <button type="button" className="rounded bg-stone-200 px-3 py-1 font-semibold text-stone-900" onClick={() => void send({ type: 'play', card: declaring })}>
            Nu
          </button>
          <button type="button" className="px-2 text-stone-400" onClick={() => setDeclaring(null)}>
            Renunță
          </button>
        </div>
      )}

      <div role="group" aria-label="Mâna ta" className="flex flex-wrap justify-center gap-2">
        {hand.cards.map((card) => {
          const playable = !busy && moves.cards.some((c) => sameCard(c, card));
          return (
            <PlayingCard
              key={`${card.suit}-${card.rank}`}
              card={card}
              size="lg"
              playable={playable}
              dimmed={moves.cards.length > 0 && !playable}
              onClick={() => onCard(card)}
            />
          );
        })}
      </div>

      {moves.canStop && (
        <button type="button" disabled={busy} onClick={() => void send({ type: 'stop' })} className="rounded-md bg-red-600 px-4 py-2 font-semibold disabled:opacity-50">
          Stop (am 66)
        </button>
      )}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
