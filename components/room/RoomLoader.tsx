'use client';

import dynamic from 'next/dynamic';

/** Client-only: the room reads the saved name and the Supabase session from localStorage. */
export const RoomLoader = dynamic(() => import('./RoomScreen').then((m) => m.RoomScreen), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-stone-300">Se încarcă…</p>,
});
