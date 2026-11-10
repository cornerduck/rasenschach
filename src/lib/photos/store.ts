import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LogoType } from "@/lib/logos/image";
import { photoPath } from "./files";

export const PHOTO_BUCKET = "spielerbilder";
const EXTS = ["png", "jpg", "webp"] as const;

const bucketError = (msg: string) =>
  /bucket/i.test(msg) ? "Den Speicher „spielerbilder“ gibt es noch nicht. Bitte zuerst die neue Migration ausführen." : `Speichern: ${msg}`;

/**
 * Speichert ein (geprüftes) Spielerbild und trägt es in players.photo_url ein.
 * Ein vorhandenes Bild wird ersetzt. Braucht den Client mit geheimem Schlüssel.
 */
export async function savePlayerPhoto(db: SupabaseClient, playerId: number, bytes: Uint8Array, type: LogoType): Promise<string> {
  const path = photoPath(playerId, type.ext);
  const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: type.mime, upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(bucketError(error.message));
  await db.storage.from(PHOTO_BUCKET).remove(EXTS.filter((e) => e !== type.ext).map((e) => photoPath(playerId, e)));
  const url = `${db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error: e2 } = await db.from("players").update({ photo_url: url }).eq("id", playerId);
  if (e2) throw new Error(`Datenbank: ${e2.message}`);
  return url;
}

/** Bild löschen: danach erscheint wieder das Trikot mit Rückennummer */
export async function deletePlayerPhoto(db: SupabaseClient, playerId: number): Promise<void> {
  const { error } = await db.storage.from(PHOTO_BUCKET).remove(EXTS.map((e) => photoPath(playerId, e)));
  if (error) throw new Error(bucketError(error.message));
  const { error: e2 } = await db.from("players").update({ photo_url: null }).eq("id", playerId);
  if (e2) throw new Error(`Datenbank: ${e2.message}`);
}
