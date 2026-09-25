import type { Seat } from '@/lib/game';
import type { PlayerActionInput } from '@/lib/server/schemas';
import type { GameSnapshot } from '@/lib/server/service';
import { ensureSession } from './supabase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const session = await ensureSession();
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Eroare necunoscută');
  return data as T;
}

const room = (code: string) => `/api/rooms/${encodeURIComponent(code)}`;

export const api = {
  createRoom: (name: string) => post<{ code: string }>('/api/rooms', { name }),
  joinRoom: (code: string, name: string) => post<{ code: string }>(`${room(code)}/join`, { name }),
  takeSeat: (code: string, seat: Seat | null) => post<{ ok: true }>(`${room(code)}/seat`, { seat }),
  act: (code: string, action: PlayerActionInput) => post<{ game: GameSnapshot }>(`${room(code)}/action`, { action }),
  tick: (code: string) => post<{ changed: boolean; game: GameSnapshot | null }>(`${room(code)}/tick`),
  rematch: (code: string) => post<{ ok: boolean }>(`${room(code)}/rematch`),
  sendMessage: (code: string, text: string) => post<{ ok: true }>(`${room(code)}/chat`, { text }),
};
