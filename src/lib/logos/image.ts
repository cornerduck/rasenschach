/**
 * Bildprüfung für Vereinslogos. Rein, ohne Datenbank.
 * Erkennt das Format am Dateiinhalt (nicht an Dateiname oder Angabe des Browsers),
 * damit nur echte PNG-, JPG- oder WebP-Bilder gespeichert werden. SVG ist bewusst nicht
 * erlaubt (kann Skripte enthalten); das Import-Skript wandelt SVG-Logos in PNG um.
 */

export type LogoType = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

export const MAX_LOGO_BYTES = 1024 * 1024;

export function detectImageType(bytes: Uint8Array): LogoType | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

/** Prüft ein hochgeladenes Logo. Gibt den Typ zurück oder eine verständliche Fehlermeldung. */
export function checkLogo(bytes: Uint8Array): { ok: true; type: LogoType } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "Die Datei ist leer" };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, error: "Die Datei ist größer als 1 MB" };
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "Bitte ein PNG-, JPG- oder WebP-Bild hochladen" };
  return { ok: true, type };
}

/** Pfad im Bucket, z. B. "svw.png" */
export const logoPath = (code: string, ext: string) => `${code.toLowerCase()}.${ext}`;

/** Gleiche Prüfung für Spielerbilder */
export const checkImage = checkLogo;
