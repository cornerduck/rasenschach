import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logoPath, type LogoType } from "./image";

export const LOGO_BUCKET = "vereinslogos";

/**
 * Speichert ein (geprüftes) Logo im Bucket und trägt die Adresse beim Verein ein.
 * Braucht den Client mit geheimem Schlüssel (createAdminClient).
 * Die Adresse bekommt einen Zeitstempel, damit Browser ein ersetztes Logo neu laden.
 */
export async function saveClubLogo(
  db: SupabaseClient,
  club: { id: number; code: string },
  bytes: Uint8Array,
  type: LogoType,
  manual: boolean,
): Promise<string> {
  const path = logoPath(club.code, type.ext);
  const { error } = await db.storage.from(LOGO_BUCKET).upload(path, bytes, { contentType: type.mime, upsert: true, cacheControl: "31536000" });
  if (error) {
    throw new Error(/bucket/i.test(error.message) ? "Den Speicher „vereinslogos“ gibt es noch nicht. Bitte zuerst die neue Migration ausführen." : `Speichern: ${error.message}`);
  }
  // Alte Datei in anderem Format entfernen
  const others = (["png", "jpg", "webp"] as const).filter((e) => e !== type.ext).map((e) => logoPath(club.code, e));
  await db.storage.from(LOGO_BUCKET).remove(others);

  const url = `${db.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error: e2 } = await db.from("clubs").update({ logo_url: url, logo_is_manual: manual }).eq("id", club.id);
  if (e2) throw new Error(`Datenbank: ${e2.message}`);
  return url;
}
