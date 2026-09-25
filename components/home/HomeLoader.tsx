'use client';

import dynamic from 'next/dynamic';

/** Client-only: the start page reads the saved name from localStorage. */
export const HomeLoader = dynamic(() => import('./Home').then((m) => m.Home), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-stone-300">Se încarcă…</p>,
});
