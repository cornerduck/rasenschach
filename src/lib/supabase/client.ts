import { createBrowserClient } from "@supabase/ssr";

/** Supabase-Client für Client-Komponenten im Browser (nur öffentlicher Schlüssel). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
