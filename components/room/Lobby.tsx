'use client';

import { useState } from 'react';
import type { Seat } from '@/lib/game';
import { api } from '@/lib/client/api';
import { useNow } from '@/lib/client/use-now';
import type { ReadyRoom } from '@/lib/client/use-room';
import { isBotId } from '@/lib/bots';
import { SEATS, isOffline } from '@/lib/ui/seats';
import { HomeButton } from './HomeButton';

const TEAM_STYLE = { A: 'border-sky-400 bg-sky-900/60', B: 'border-orange-400 bg-orange-900/60' } as const;

export function Lobby({ room }: { room: ReadyRoom }) {
  const { data, userId, online } = room;
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');
  const me = data.players.find((p) => p.user_id === userId);
  const waiting = data.players.filter((p) => p.seat === null);
  const link = `${window.location.origin}/room/${data.room.code}`;
  const countdown = data.room.start_at
    ? Math.max(0, Math.ceil((new Date(data.room.start_at).getTime() - now) / 1000))
    : null;

  async function sit(seat: Seat | null) {
    setError(null);
    try {
      await api.takeSeat(data.room.code, seat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut schimba locul.');
    }
  }

  async function bot(seat: Seat, add: boolean) {
    setError(null);
    try {
      await api.setBot(data.room.code, seat, add);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut schimba calculatorul.');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <HomeButton confirmLeave={false} />
        <h1 className="text-3xl font-bold">
          Camera <span className="font-mono text-amber-400">{data.room.code}</span>
        </h1>
        <button
          type="button"
          className="rounded-md bg-stone-800 px-3 py-2 text-sm"
          onClick={() => {
            // navigator.clipboard is missing on plain-http LAN addresses and may be denied.
            Promise.resolve()
              .then(() => navigator.clipboard.writeText(link))
              .then(
                () => setCopied('yes'),
                () => setCopied('failed'),
              );
          }}
        >
          {copied === 'yes' ? 'Link copiat!' : copied === 'failed' ? 'Copiază manual' : 'Copiază linkul de invitație'}
        </button>
      </header>
      {copied === 'failed' && (
        <p className="-mt-4 select-all break-all rounded-md bg-stone-900/70 px-3 py-2 font-mono text-sm">{link}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {SEATS.map((seat) => {
          const player = data.players.find((p) => p.seat === seat);
          const team = seat % 2 === 0 ? 'A' : 'B';
          const mine = player?.user_id === userId;
          const botSeat = isBotId(player?.user_id);
          return (
            <div key={seat} className="flex flex-col gap-1">
              <button
                type="button"
                disabled={Boolean(player) && !mine}
                onClick={() => void sit(mine ? null : seat)}
                className={`flex flex-1 flex-col items-start gap-1 rounded-xl border-2 p-4 text-left ${TEAM_STYLE[team]} ${mine ? 'ring-2 ring-amber-400' : ''} disabled:cursor-default`}
              >
                <span className="text-xs uppercase tracking-wide text-stone-300">
                  Locul {seat + 1} · Echipa {team}
                </span>
                <span className="text-lg font-semibold">
                  {player ? player.name : 'Liber — apasă ca să te așezi'}
                  {player && isOffline(online, player.user_id) ? ' (deconectat)' : ''}
                </span>
                {mine && <span className="text-xs text-amber-300">Tu · apasă ca să te ridici</span>}
              </button>
              {(!player || botSeat) && (
                <button
                  type="button"
                  onClick={() => void bot(seat, !player)}
                  className="self-start rounded-md bg-stone-800 px-3 py-1 text-sm hover:bg-stone-700"
                >
                  {player ? 'Scoate calculatorul' : '+ Pune calculatorul'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-lg" aria-live="polite">
        {countdown !== null ? `Jocul începe în ${countdown}…` : 'Așteptăm să se ocupe toate cele 4 locuri (poți pune calculatorul pe locurile libere).'}
      </p>

      {waiting.length > 0 && (
        <p className="text-sm text-stone-400">În cameră, fără loc: {waiting.map((p) => p.name).join(', ')}</p>
      )}
      {me && me.seat === null && <p className="text-sm text-stone-300">Alege un loc liber. Coechipierii stau față în față.</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
