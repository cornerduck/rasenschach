"use server";

import { revalidatePath } from "next/cache";
import { checkLogo } from "@/lib/logos/image";
import { saveClubLogo } from "@/lib/logos/store";
import { getMe } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type UploadResult = { ok: true } | { ok: false; error: string };

/**
 * Admin: Logo eines Vereins per Upload ersetzen. Geprüft wird im Server:
 * Admin-Recht, Dateigröße (max. 1 MB) und Format am Dateiinhalt (PNG, JPG, WebP).
 * Gespeichert wird mit dem geheimen Schlüssel, der nie in den Browser gelangt.
 */
export async function uploadClubLogo(formData: FormData): Promise<UploadResult> {
  const me = await getMe();
  if (!me?.isAdmin) return { ok: false, error: "Nur für Admin" };

  const clubId = Number(formData.get("clubId"));
  const file = formData.get("logo");
  if (!Number.isInteger(clubId) || !(file instanceof File)) return { ok: false, error: "Bitte eine Bilddatei auswählen" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkLogo(bytes);
  if (!check.ok) return check;

  const db = createAdminClient();
  const { data: club } = await db.from("clubs").select("id, code").eq("id", clubId).maybeSingle();
  if (!club) return { ok: false, error: "Verein nicht gefunden" };

  try {
    await saveClubLogo(db, club, bytes, check.type, true);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/vereine");
  return { ok: true };
}
