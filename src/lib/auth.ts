import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Prüft serverseitig, ob der eingeloggte Nutzer Admin (Bent) ist. */
export async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403; error: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, status: 401, error: "Nicht eingeloggt" };
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", auth.user.id).single();
  if (!profile?.is_admin) return { ok: false, status: 403, error: "Nur für Admin" };
  return { ok: true, userId: auth.user.id };
}
