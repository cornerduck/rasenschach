/**
 * Namensabgleich zwischen Torschützen aus OpenLigaDB ("F. Nmecha", "Lennart Karl", "Romulo")
 * und Spielern aus dem Kader. Rein, ohne Datenbank.
 */

/** Kleinbuchstaben, ohne Akzente und Satzzeichen: "Demirović" → "demirovic". */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface NameCandidate {
  fullName: string;
  shortName: string;
}

/** Passt der Torschützen-Name aus der Quelle zu diesem Spieler? */
export function scorerMatchesPlayer(raw: string, player: NameCandidate): boolean {
  const full = normalizeName(player.fullName);
  const short = normalizeName(player.shortName);
  const abbrev = raw.trim().match(/^(\p{L})\.\s*(.+)$/u); // "F. Nmecha"

  if (abbrev) {
    const initial = normalizeName(abbrev[1]);
    const last = normalizeName(abbrev[2]);
    return full.startsWith(initial) && (full.endsWith(" " + last) || short === last);
  }

  const r = normalizeName(raw);
  if (!r) return false;
  if (r === full) return true;
  // Einzelname ("Romulo") oder Kartenname
  if (!r.includes(" ")) return r === short || full.split(" ").at(-1) === r;
  // Voller Name mit zusätzlichem/fehlendem Mittelnamen: Vor- und Nachname gleich
  const rp = r.split(" ");
  const fp = full.split(" ");
  return rp[0] === fp[0] && rp.at(-1) === fp.at(-1);
}

/** Findet genau einen passenden Spieler, sonst null (kein Treffer oder mehrdeutig). */
export function findUniqueScorer<T extends NameCandidate>(raw: string, candidates: T[]): T | null {
  const hits = candidates.filter((c) => scorerMatchesPlayer(raw, c));
  return hits.length === 1 ? hits[0] : null;
}
