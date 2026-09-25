'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import type { MessageRow } from '@/lib/client/use-room';

export function Chat({ code, messages, userId }: { code: string; messages: MessageRow[]; userId: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  // The list is capped, so its length stops changing; the newest message id always does.
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lastId]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      await api.sendMessage(code, trimmed);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mesajul nu a fost trimis.');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <section aria-label="Chat" className="flex h-72 flex-col gap-2 rounded-xl bg-stone-900/80 p-3 lg:h-full">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">Chat</h2>
      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto text-sm">
        {messages.length === 0 && <p className="text-stone-500">Niciun mesaj încă.</p>}
        {messages.map((m) => (
          <p key={m.id} className="break-words">
            <span className={`font-semibold ${m.user_id === userId ? 'text-amber-400' : 'text-emerald-300'}`}>{m.name}:</span> {m.text}
          </p>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={300}
          placeholder="Scrie un mesaj…"
          aria-label="Mesaj"
          className="min-w-0 flex-1 rounded-md bg-stone-100 px-2 py-1 text-sm text-stone-900"
        />
        <button type="submit" disabled={sending} className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold disabled:opacity-50">
          Trimite
        </button>
      </form>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </section>
  );
}
