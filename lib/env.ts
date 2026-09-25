function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Lipsește variabila de mediu ${name} (vezi .env.example)`);
  return value;
}

/** Safe to use in the browser. Literal `process.env.NEXT_PUBLIC_*` access so Next.js inlines the values. */
export function publicEnv() {
  return {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

/** Server only: includes the service-role key. */
export function serverEnv() {
  return {
    ...publicEnv(),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
