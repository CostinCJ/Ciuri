import { HttpError } from './errors';
import { adminClient } from './supabase-admin';

/**
 * Resolves the Supabase user (anonymous sessions included) from `Authorization: Bearer <token>`.
 * getClaims verifies the JWT locally against the cached signing keys when the project uses
 * asymmetric keys, and otherwise asks the Auth server (like getUser).
 */
export async function requireUserId(request: Request): Promise<string> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) throw new HttpError(401, 'Autentificare necesară');
  const { data, error } = await adminClient().auth.getClaims(token);
  const userId = data?.claims.sub;
  if (error || !userId) throw new HttpError(401, 'Sesiune invalidă, reîncarcă pagina');
  return userId;
}
