"use server";

import { revalidatePath } from "next/cache";
import { checkImage } from "@/lib/logos/image";
import { deletePlayerPhoto, savePlayerPhoto } from "@/lib/photos/store";
import { getMe } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type PhotoResult = { ok: true } | { ok: false; error: string };

/**
 * Admin: Bild eines Spielers hochladen oder ersetzen. Geprüft wird im Server:
 * Admin-Recht, Dateigröße (max. 1 MB), Format am Dateiinhalt (PNG, JPG, WebP).
 */
export async function uploadPlayerPhoto(formData: FormData): Promise<PhotoResult> {
  const me = await getMe();
  if (!me?.isAdmin) return { ok: false, error: "Nur für Admin" };
  const playerId = Number(formData.get("playerId"));
  const file = formData.get("bild");
  if (!Number.isInteger(playerId) || !(file instanceof File)) return { ok: false, error: "Bitte eine Bilddatei auswählen" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImage(bytes);
  if (!check.ok) return check;

  const db = createAdminClient();
  const { data: player } = await db.from("players").select("id").eq("id", playerId).maybeSingle();
  if (!player) return { ok: false, error: "Spieler nicht gefunden" };
  try {
    await savePlayerPhoto(db, playerId, bytes, check.type);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/spielerbilder");
  return { ok: true };
}

/** Admin: Bild löschen (danach wieder Trikot mit Rückennummer) */
export async function removePlayerPhoto(playerId: number): Promise<PhotoResult> {
  const me = await getMe();
  if (!me?.isAdmin) return { ok: false, error: "Nur für Admin" };
  try {
    await deletePlayerPhoto(createAdminClient(), playerId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/spielerbilder");
  return { ok: true };
}
