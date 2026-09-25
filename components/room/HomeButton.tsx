'use client';

import Link from 'next/link';

export const LEAVE_CONFIRM = 'Ieși din cameră? Poți reveni cu același link.';

/** Link back to the start page; asks first when leaving would interrupt a game in progress. */
export function HomeButton({ confirmLeave, className = '' }: { confirmLeave: boolean; className?: string }) {
  return (
    <Link
      href="/"
      onClick={(event) => {
        if (confirmLeave && !window.confirm(LEAVE_CONFIRM)) event.preventDefault();
      }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-stone-800 px-3 py-1.5 text-sm font-semibold text-stone-100 hover:bg-stone-700 short:px-2 short:py-0.5 short:text-xs ${className}`}
    >
      <span aria-hidden="true">←</span> Acasă
    </Link>
  );
}
