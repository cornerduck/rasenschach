import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase-Client mit geheimem Schlüssel: umgeht Row Level Security.
 * Nur serverseitig für Admin-Aufgaben (z. B. Kader-Import) verwenden, nie im Browser.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY fehlt");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
