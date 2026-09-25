import type { GameEvent } from '@/lib/server/events';
import { describeEvent } from '@/lib/ui/format';

const VISIBLE = 8;

export function EventLog({ log, names }: { log: GameEvent[]; names: string[] }) {
  const recent = log.slice(-VISIBLE).reverse();
  return (
    <section aria-label="Jurnal" className="rounded-xl bg-stone-900/70 p-3 text-sm">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Jurnal</h2>
      <ol className="space-y-0.5">
        {recent.map((event, i) => (
          <li key={log.length - i} className={i === 0 ? 'text-stone-100' : 'text-stone-400'}>
            {describeEvent(event, names)}
          </li>
        ))}
      </ol>
    </section>
  );
}
