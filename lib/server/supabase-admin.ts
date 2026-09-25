import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';
import { cryptoRandom } from './random';
import type { ServiceDeps } from './service';
import { SupabaseStore } from './supabase-store';

let admin: SupabaseClient | null = null;

/** Service-role client. Server only — never import from client components. */
export function adminClient(): SupabaseClient {
  if (!admin) {
    const env = serverEnv();
    admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export function serviceDeps(): ServiceDeps {
  return { store: new SupabaseStore(adminClient()), now: () => new Date(), rng: cryptoRandom };
}
