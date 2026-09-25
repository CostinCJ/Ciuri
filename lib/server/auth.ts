import { HttpError } from './errors';
import { adminClient } from './supabase-admin';

/** Resolves the Supabase user (anonymous sessions included) from `Authorization: Bearer <token>`. */
export async function requireUserId(request: Request): Promise<string> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) throw new HttpError(401, 'Autentificare necesară');
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sesiune invalidă, reîncarcă pagina');
  return data.user.id;
}
