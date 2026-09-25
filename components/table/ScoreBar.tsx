import type { PublicState } from '@/lib/game';

export function ScoreBar({ view, names }: { view: PublicState; names: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-900/80 px-4 py-2 text-sm">
      <span>
        <span className="font-semibold text-sky-300">Echipa A</span> ({names[0]} & {names[2]})
      </span>
      <span className="text-2xl font-bold tabular-nums" aria-label={`Scor: Echipa A ${view.score.A}, Echipa B ${view.score.B}`}>
        {view.score.A} – {view.score.B}
      </span>
      <span>
        <span className="font-semibold text-orange-300">Echipa B</span> ({names[1]} & {names[3]})
      </span>
      <span className="w-full text-center text-xs text-stone-400">Runda {view.roundNumber} · se joacă până la 21</span>
    </div>
  );
}
