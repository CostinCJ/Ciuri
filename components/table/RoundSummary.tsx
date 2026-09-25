'use client';

import { useState } from 'react';
import type { PublicState, Seat } from '@/lib/game';
import { api } from '@/lib/client/api';
import { PlayingCard } from '@/components/cards/PlayingCard';
import { resultText, teamName } from '@/lib/ui/format';

interface RoundSummaryProps {
  code: string;
  view: PublicState;
  names: string[];
  mySeat: Seat | null;
  secondsLeft: number | null;
}

export function RoundSummary({ code, view, names, mySeat, secondsLeft }: RoundSummaryProps) {
  const [error, setError] = useState<string | null>(null);
  const result = view.round.result;
  if (!result || (view.phase !== 'roundOver' && view.phase !== 'matchOver')) return null;
  const matchOver = view.phase === 'matchOver';
  const champion = view.score.A >= view.score.B ? 'A' : 'B';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 short:p-2">
      <div role="dialog" aria-label={matchOver ? 'Meci încheiat' : 'Rezultatul rundei'} className="flex max-w-lg flex-col gap-3 rounded-2xl bg-stone-50 p-6 text-stone-900 shadow-2xl short:gap-1.5 short:p-4">
        <h2 className="text-2xl font-bold short:text-xl">{matchOver ? `${teamName(champion)} a câștigat meciul!` : 'Runda s-a încheiat'}</h2>
        <p>{resultText(result, names)}</p>
        {result.revealed && (
          <div className="flex flex-col gap-2">
            {result.revealed.map((r) => (
              <div key={r.seat} className="flex items-center gap-2">
                <span className="w-20 text-sm font-semibold">{names[r.seat]}</span>
                {r.cards.map((card) => (
                  <PlayingCard key={`${card.suit}-${card.rank}`} card={card} size="sm" />
                ))}
              </div>
            ))}
          </div>
        )}
        <p className="text-lg font-semibold tabular-nums">
          Scor: Echipa A {view.score.A} – {view.score.B} Echipa B
        </p>
        {matchOver ? (
          mySeat !== null && (
            <button
              type="button"
              className="rounded-md bg-amber-500 px-4 py-2 font-semibold"
              onClick={() => {
                setError(null);
                api.rematch(code).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Nu am putut porni meciul.'));
              }}
            >
              Încă un meci
            </button>
          )
        ) : (
          <p className="text-sm text-stone-600">Runda următoare în {secondsLeft ?? 0}s…</p>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
