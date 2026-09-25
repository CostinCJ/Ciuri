'use client';

import { useState } from 'react';

const NAME_KEY = 'ciuri:name';

export function nameLength(name: string): number {
  return [...name.trim()].length;
}

export function isValidName(name: string): boolean {
  const length = nameLength(name);
  return length >= 2 && length <= 20;
}

export function readSavedName(): string | null {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    return saved && isValidName(saved) ? saved.trim() : null;
  } catch {
    return null;
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // storage unavailable (private mode): the name is simply not remembered
  }
}

export function NameForm({ onSubmit, submitLabel = 'Continuă' }: { onSubmit: (name: string) => void; submitLabel?: string }) {
  const [value, setValue] = useState('');
  const valid = isValidName(value);
  return (
    <form
      className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-4 rounded-xl bg-stone-900/80 p-6 shadow-xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSubmit(value.trim());
      }}
    >
      <label className="flex flex-col gap-2 text-sm">
        Numele tău
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={20}
          autoFocus
          className="rounded-md bg-stone-100 px-3 py-2 text-base text-stone-900"
        />
      </label>
      <button type="submit" disabled={!valid} className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-stone-900 disabled:opacity-50">
        {submitLabel}
      </button>
    </form>
  );
}
