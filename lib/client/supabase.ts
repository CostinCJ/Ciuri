import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

let client: SupabaseClient | null = null;

/** Browser Supabase client (anon key; persists the anonymous session in localStorage). */
export function browserClient(): SupabaseClient {
  if (!client) {
    const env = publicEnv();
    client = createClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}

/** Returns the current session, signing in anonymously on first visit. */
export async function ensureSession(): Promise<Session> {
  const supabase = browserClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signedIn.session) throw new Error('Nu am putut porni sesiunea. Reîncarcă pagina.');
  return signedIn.session;
}
