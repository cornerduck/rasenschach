/**
 * Spielerbilder per Ordner: Dateinamen lesen und Spielern zuordnen. Rein, ohne Datenbank.
 * Format: VEREIN_Name.png, z. B. "SVW_Marco Grüll.png".
 * Zuordnung nur innerhalb des Vereins, mit derselben Namenslogik wie bei den Torschützen
 * (Akzente, Groß-/Kleinschreibung, Bindestriche, "Nachname, Vorname", Initiale, feste Zuordnungen).
 */
import { matchScorer, normalizeName } from "@/lib/roster/names";

const EXT = /\.(png|jpe?g|webp)$/i;

export type ParsedFile = { ok: true; file: string; club: string; name: string } | { ok: false; file: string; error: string };

export function parsePhotoFilename(file: string): ParsedFile {
  const base = file.normalize("NFC").split(/[\\/]/).at(-1)!;
  if (base.startsWith(".")) return { ok: false, file, error: "versteckte Datei" };
  if (!EXT.test(base)) return { ok: false, file, error: "kein PNG-, JPG- oder WebP-Bild" };
  const stem = base.replace(EXT, "");
  const i = stem.indexOf("_");
  if (i <= 0) return { ok: false, file, error: "Name nicht im Format VEREIN_Name" };
  const club = stem.slice(0, i).trim().toUpperCase();
  const name = stem.slice(i + 1).replace(/_/g, " ").trim();
  if (!club || !name) return { ok: false, file, error: "Name nicht im Format VEREIN_Name" };
  return { ok: true, file, club, name };
}

export interface SquadPlayer {
  playerId: number;
  clubCode: string;
  fullName: string;
  shortName: string;
  aliases?: string[];
}

export interface PhotoPlan {
  matched: { file: string; playerId: number; playerName: string; clubCode: string }[];
  problems: { file: string; reason: string }[];
}

/** Ordnet Dateien Spielern zu. Unbekannt, mehrdeutig oder doppelt → nur melden. */
export function planPhotoImport(files: string[], squad: SquadPlayer[]): PhotoPlan {
  const byClub = new Map<string, SquadPlayer[]>();
  for (const p of squad) byClub.set(p.clubCode.toUpperCase(), [...(byClub.get(p.clubCode.toUpperCase()) ?? []), p]);

  const plan: PhotoPlan = { matched: [], problems: [] };
  for (const f of [...files].sort((a, b) => a.localeCompare(b, "de"))) {
    const parsed = parsePhotoFilename(f);
    if (!parsed.ok) {
      plan.problems.push({ file: f, reason: parsed.error });
      continue;
    }
    const pool = byClub.get(parsed.club);
    if (!pool) {
      plan.problems.push({ file: f, reason: `Verein „${parsed.club}“ unbekannt` });
      continue;
    }
    // exakter voller Name geht vor (z. B. zwei Brüder mit gleichem Nachnamen)
    const exact = pool.filter((p) => normalizeName(p.fullName) === normalizeName(parsed.name));
    const m = exact.length === 1 ? { kind: "eindeutig" as const, player: exact[0] } : matchScorer(parsed.name, pool);
    if (m.kind === "keiner") plan.problems.push({ file: f, reason: `kein Spieler „${parsed.name}“ bei ${parsed.club}` });
    else if (m.kind === "mehrdeutig") plan.problems.push({ file: f, reason: `mehrdeutig: ${m.players.map((p) => p.fullName).join(", ")}` });
    else plan.matched.push({ file: f, playerId: m.player.playerId, playerName: m.player.fullName, clubCode: parsed.club });
  }

  // Zwei Dateien für denselben Spieler: keine hochladen
  const count = new Map<number, number>();
  for (const x of plan.matched) count.set(x.playerId, (count.get(x.playerId) ?? 0) + 1);
  for (const x of plan.matched.filter((x) => count.get(x.playerId)! > 1)) {
    plan.problems.push({ file: x.file, reason: `mehrere Dateien für ${x.playerName}` });
  }
  plan.matched = plan.matched.filter((x) => count.get(x.playerId) === 1);
  return plan;
}

/** Nur Bilder aus dem eigenen Speicher anzeigen, nie fremde Adressen */
export function ownPhotoUrl(url: string | null | undefined): string | null {
  return url && url.includes("/storage/v1/object/public/spielerbilder/") ? url : null;
}

/** Pfad im Bucket, z. B. "428.webp" */
export const photoPath = (playerId: number, ext: string) => `${playerId}.${ext}`;
