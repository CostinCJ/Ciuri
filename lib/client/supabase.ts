import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

let client: SupabaseClient | null = null;
let pendingSession: Promise<Session> | null = null;

/** Browser Supabase client (anon key; persists the anonymous session in localStorage). */
export function browserClient(): SupabaseClient {
  if (!client) {
    const env = publicEnv();
    client = createClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}

async function loadOrCreateSession(): Promise<Session> {
  const supabase = browserClient();
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('Nu am putut citi sesiunea. Reîncarcă pagina.');
  if (data.session) return data.session;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signedIn.session) throw new Error('Nu am putut porni sesiunea. Reîncarcă pagina.');
  return signedIn.session;
}

/**
 * Returns the current session, signing in anonymously on first visit.
 * Single-flight: concurrent callers share one in-flight lookup/sign-in.
 */
export function ensureSession(): Promise<Session> {
  if (!pendingSession) {
    pendingSession = loadOrCreateSession().finally(() => {
      pendingSession = null;
    });
  }
  return pendingSession;
}
