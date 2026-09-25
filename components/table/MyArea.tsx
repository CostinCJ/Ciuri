'use client';

import { useRef, useState } from 'react';
import type { Bid, Card, PublicState } from '@/lib/game';
import { sameCard } from '@/lib/game';
import type { HandRow } from '@/lib/client/use-room';
import { api } from '@/lib/client/api';
import type { PlayerActionInput } from '@/lib/server/schemas';
import type { GameSnapshot } from '@/lib/server/service';
import { PlayingCard } from '@/components/cards/PlayingCard';
import { SuitIcon } from '@/components/cards/SuitIcon';
import { bidLabel, cardName } from '@/lib/ui/format';
import { SecondsLeft } from './Countdown';

interface MyAreaProps {
  code: string;
  view: PublicState;
  /** game_public version the hand belongs to; it grows with every accepted move. */
  version: number;
  hand: HandRow;
  /** Move deadline while it is this player's turn, else null. */
  deadline: string | null;
  /** Shows the game returned by an accepted move right away. */
  onMove: (game: GameSnapshot) => void;
}

export function MyArea({ code, view, version, hand, deadline, onMove }: MyAreaProps) {
  const [sending, setSending] = useState(false);
  // The card being played leaves the hand at once; it comes back if the move is refused.
  const [playing, setPlaying] = useState<Card | null>(null);
  const inFlight = useRef(false);
  // The game version an accepted move was made at. Its `moves` are stale until the realtime
  // re-fetch delivers a newer version, so controls stay locked while it is still the current one.
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The "Strigi?" prompt belongs to the version it was opened at; any newer state (e.g. an
  // automatic move) closes it.
  const [prompt, setPrompt] = useState<{ card: Card; version: number } | null>(null);
  const declaring = prompt && prompt.version === version ? prompt.card : null;
  const busy = sending || lockedAt === version;
  const moves = hand.moves;
  const myTurn = moves.bids.length > 0 || moves.cards.length > 0;

  async function send(action: PlayerActionInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    const at = version;
    setSending(true);
    setPlaying(action.type === 'play' ? action.card : null);
    setError(null);
    setPrompt(null);
    try {
      const { game } = await api.act(code, action);
      onMove(game);
      setLockedAt(at);
    } catch (err) {
      setLockedAt(null);
      setError(err instanceof Error ? err.message : 'Mutarea nu a fost acceptată.');
    } finally {
      inFlight.current = false;
      setSending(false);
      setPlaying(null);
    }
  }

  function onCard(card: Card) {
    if (moves.declarable.some((d) => sameCard(d, card))) setPrompt({ card, version });
    else void send({ type: 'play', card });
  }

  const simpleBids = moves.bids.filter((b) => b.kind !== 'tromf');
  const tromfBids = moves.bids.filter((b): b is Extract<Bid, { kind: 'tromf' }> => b.kind === 'tromf');
  const declarePoints = declaring && view.round.trump === declaring.suit ? 40 : 20;

  return (
    <div className="flex flex-col items-center gap-3 short:sticky short:bottom-0 short:z-10 short:gap-1 short:bg-[#155236]/90 short:pb-1">
      <div className="contents short:flex short:flex-wrap short:items-center short:justify-center short:gap-2">
        <p className={myTurn ? 'text-sm font-semibold text-amber-300' : 'sr-only'}>
          <span aria-live="polite">{myTurn ? 'E rândul tău' : ''}</span>
          {myTurn && deadline !== null && (
            <span className="tabular-nums">
              {' · '}
              <SecondsLeft deadline={deadline} />s
            </span>
          )}
        </p>

        {moves.bids.length > 0 && (
          <div role="group" aria-label="Licitație" className="flex flex-wrap items-center justify-center gap-2 short:gap-1">
            {simpleBids.map((b) => (
              <button
                key={b.kind}
                type="button"
                disabled={busy}
                onClick={() => void send({ type: 'bid', bid: b })}
                className={`rounded-md px-4 py-2 font-semibold short:px-3 short:py-1 short:text-sm ${b.kind === 'pass' ? 'bg-stone-200 text-stone-900' : 'bg-amber-500 text-stone-900'} disabled:opacity-50`}
              >
                {bidLabel(b)}
              </button>
            ))}
            {tromfBids.length > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-stone-900/70 px-2 py-1 text-sm short:py-0.5">
                Tromful tău:
                {tromfBids.map((b) => (
                  <button
                    key={b.suit}
                    type="button"
                    disabled={busy}
                    aria-label={bidLabel(b)}
                    onClick={() => void send({ type: 'bid', bid: b })}
                    className="rounded bg-amber-50 p-1 disabled:opacity-50 short:p-0.5"
                  >
                    <SuitIcon suit={b.suit} className="h-6 w-6 short:h-5 short:w-5" />
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
      </div>

      {declaring && (
        <div role="dialog" aria-label="Strigare" className="flex flex-wrap items-center justify-center gap-2 rounded-md bg-stone-900/80 px-3 py-2 text-sm">
          Strigi {declarePoints} cu {cardName(declaring)}?
          <button type="button" className="rounded bg-amber-500 px-3 py-1 font-semibold text-stone-900" onClick={() => void send({ type: 'play', card: declaring, declare: true })}>
            Da, strig
          </button>
          <button type="button" className="rounded bg-stone-200 px-3 py-1 font-semibold text-stone-900" onClick={() => void send({ type: 'play', card: declaring })}>
            Nu
          </button>
          <button type="button" className="px-2 text-stone-400" onClick={() => setPrompt(null)}>
            Renunță
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 short:flex-nowrap short:gap-2">
        <div role="group" aria-label="Mâna ta" className="flex flex-wrap justify-center gap-2 short:gap-1">
          {hand.cards.filter((card) => !playing || !sameCard(card, playing)).map((card) => {
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
          <button type="button" disabled={busy} onClick={() => void send({ type: 'stop' })} className="rounded-md bg-red-600 px-4 py-2 font-semibold disabled:opacity-50 short:py-1 short:text-sm">
            Stop (am 66)
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
