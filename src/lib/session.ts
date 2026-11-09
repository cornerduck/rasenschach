import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface Me {
  id: string;
  displayName: string;
  slot: "bent" | "bjoern" | null;
  isAdmin: boolean;
}

/** Eingeloggter Nutzer mit Profil, oder null. */
export async function getMe(): Promise<Me | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: p } = await supabase.from("profiles").select("display_name, slot, is_admin").eq("id", auth.user.id).single();
  return {
    id: auth.user.id,
    displayName: p?.display_name || auth.user.email || "",
    slot: p?.slot ?? null,
    isAdmin: !!p?.is_admin,
  };
}
