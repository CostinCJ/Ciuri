'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRoom } from '@/lib/client/use-room';
import { Table } from '@/components/table/Table';
import { Chat } from './Chat';
import { Lobby } from './Lobby';
import { NameForm, readSavedName, saveName } from './NameForm';
import { Ticker } from './Ticker';

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>;
}

function Room({ code, name }: { code: string; name: string }) {
  const state = useRoom(code, name);
  if (state.kind === 'loading') return <Centered>Se încarcă camera…</Centered>;
  if (state.kind === 'error') {
    return (
      <Centered>
        <p className="text-lg">{state.message}</p>
        <Link href="/" className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-stone-900">
          Înapoi la început
        </Link>
      </Centered>
    );
  }
  const { data } = state;
  const dueAt =
    data.room.status === 'lobby' ? data.room.start_at
    : data.room.status === 'playing' ? (data.game?.deadline ?? null)
    : null;
  return (
    <div className="felt flex min-h-dvh flex-col gap-3 p-3 lg:flex-row">
      <Ticker code={data.room.code} dueAt={dueAt} />
      <main className="flex min-w-0 flex-1 flex-col">
        {data.room.status === 'lobby' ? <Lobby room={state} /> : <Table room={state} />}
      </main>
      <aside className="lg:w-80">
        <Chat code={data.room.code} messages={data.messages} userId={state.userId} />
      </aside>
    </div>
  );
}

export function RoomScreen({ code }: { code: string }) {
  const [name, setName] = useState<string | null>(() => readSavedName());
  if (!name) {
    return (
      <NameForm
        onSubmit={(value) => {
          saveName(value);
          setName(value);
        }}
      />
    );
  }
  return <Room code={code} name={name} />;
}
