import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Supabase-Client für Server-Komponenten, Server Actions und Route Handler.
 * Handelt im Namen des eingeloggten Nutzers, Row Level Security greift.
 */
export async function createClient() {
  // Daten immer zur Anfragezeit laden (nie beim Vorrendern), auch Zeitvergleiche wie die Deadline
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Aus einer Server-Komponente heraus nicht möglich; der Proxy frischt die Session auf.
          }
        },
      },
    },
  );
}
