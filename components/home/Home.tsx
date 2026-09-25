'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { isValidName, readSavedName, saveName } from '@/components/room/NameForm';

export function Home() {
  const router = useRouter();
  const [name, setName] = useState(() => readSavedName() ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validName = isValidName(name);
  const normalizedCode = code.trim().toUpperCase();

  async function createRoom() {
    if (!validName) return;
    setBusy(true);
    setError(null);
    try {
      saveName(name);
      const created = await api.createRoom(name.trim());
      router.push(`/room/${created.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut crea camera.');
      setBusy(false);
    }
  }

  return (
    <main className="felt flex min-h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-stone-900/85 p-8 shadow-2xl">
        <header className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-amber-400">Ciuri</h1>
          <p className="mt-2 text-sm text-stone-300">Joc de cărți în echipe, cu pachet unguresc. 4 jucători, până la 21.</p>
        </header>

        <label className="flex flex-col gap-2 text-sm">
          Numele tău
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            className="rounded-md bg-stone-100 px-3 py-2 text-base text-stone-900"
          />
        </label>

        <button
          type="button"
          onClick={createRoom}
          disabled={!validName || busy}
          className="rounded-md bg-amber-500 px-4 py-3 text-lg font-semibold text-stone-900 disabled:opacity-50"
        >
          Creează cameră
        </button>

        <div className="flex items-center gap-3 text-xs uppercase text-stone-400">
          <span className="h-px flex-1 bg-stone-700" /> sau <span className="h-px flex-1 bg-stone-700" />
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!validName || normalizedCode.length !== 4) return;
            saveName(name);
            router.push(`/room/${normalizedCode}`);
          }}
        >
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={4}
            placeholder="COD"
            aria-label="Codul camerei"
            className="w-28 rounded-md bg-stone-100 px-3 py-2 text-center font-mono text-lg uppercase tracking-widest text-stone-900"
          />
          <button
            type="submit"
            disabled={!validName || normalizedCode.length !== 4}
            className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-semibold disabled:opacity-50"
          >
            Intră
          </button>
        </form>

        {error && <p role="alert" className="text-center text-sm text-red-300">{error}</p>}
      </div>
    </main>
  );
}
