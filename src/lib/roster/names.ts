/**
 * Namensabgleich zwischen Torschützen aus OpenLigaDB ("F. Nmecha", " Poulsen, Yussuf",
 * "Lee Jae-sung", "Romulo") und Spielern aus dem Kader. Rein, ohne Datenbank.
 */

/**
 * Kleinbuchstaben, ohne Akzente und Satzzeichen, Bindestriche als Leerzeichen:
 * "Demirović" → "demirovic", "Jae-Sung" → "jae sung".
 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .replace(/ł/gi, "l")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[‐-―−-]/g, " ") // alle Arten von Bindestrichen
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Nachname, Vorname" → "Vorname Nachname"; Leerzeichen am Rand weg. */
export function unflipName(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^([^,]+),\s*([^,]+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : s;
}

export interface NameCandidate {
  fullName: string;
  shortName: string;
  /** feste Zuordnungen per Hand, z. B. ["D. Mokwa"] */
  aliases?: string[];
}

const tokens = (s: string) => normalizeName(s).split(" ").filter(Boolean);
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");
/** kommt b als zusammenhängende Folge in a vor? */
const containsRun = (a: string[], b: string[]) => {
  for (let i = 0; i + b.length <= a.length; i++) if (b.every((t, j) => a[i + j] === t)) return true;
  return false;
};

/** Passt der Name per fester Zuordnung (Alias)? */
export function aliasMatches(raw: string, player: NameCandidate): boolean {
  const r = normalizeName(unflipName(raw));
  return !!r && (player.aliases ?? []).some((a) => normalizeName(unflipName(a)) === r);
}

/** Passt der Torschützen-Name aus der Quelle zu diesem Spieler? */
export function scorerMatchesPlayer(raw: string, player: NameCandidate): boolean {
  if (aliasMatches(raw, player)) return true;
  const name = unflipName(raw);
  const full = tokens(player.fullName);
  const short = tokens(player.shortName);
  if (!full.length) return false;

  // "F. Nmecha", "D. Mokwa": Initiale passt zum Vornamen, Rest steht im Namen
  const abbrev = name.match(/^(\p{L})\.\s*(.+)$/u);
  if (abbrev) {
    const initial = normalizeName(abbrev[1]);
    const rest = tokens(abbrev[2]);
    if (!rest.length) return false;
    return full[0].startsWith(initial) && (containsRun(full.slice(1), rest) || sameSet(rest, short));
  }

  const r = tokens(name);
  if (!r.length) return false;
  // gleiche Namensteile, egal in welcher Reihenfolge ("Lee Jae-sung" = "Jae-Sung Lee")
  if (sameSet(r, full) || sameSet(r, short)) return true;
  // Einzelname ("Romulo") oder Kartenname
  if (r.length === 1) return r[0] === short.join(" ") || r[0] === full.at(-1);
  // Vor- und Nachname gleich, Mittelnamen fehlen oder sind zusätzlich (auch vertauscht)
  if (full.length >= 2) {
    if (r[0] === full[0] && r.at(-1) === full.at(-1)) return true;
    if (r[0] === full.at(-1) && r.at(-1) === full[0]) return true;
  }
  // alle Namensteile kommen im vollen Namen vor ("Mokwa Ntusu" in "David Mokwa Ntusu")
  return r.every((t) => full.includes(t));
}

export type ScorerMatch<T> = { kind: "eindeutig"; player: T } | { kind: "keiner" } | { kind: "mehrdeutig"; players: T[] };

/**
 * Sucht den Spieler zu einem Torschützen-Namen. Feste Zuordnungen (Alias) gehen vor.
 * Mehrere Treffer werden nicht geraten, sondern als mehrdeutig gemeldet.
 */
export function matchScorer<T extends NameCandidate>(raw: string, candidates: T[]): ScorerMatch<T> {
  const byAlias = candidates.filter((c) => aliasMatches(raw, c));
  const hits = byAlias.length ? byAlias : candidates.filter((c) => scorerMatchesPlayer(raw, c));
  if (hits.length === 1) return { kind: "eindeutig", player: hits[0] };
  return hits.length ? { kind: "mehrdeutig", players: hits } : { kind: "keiner" };
}

/** Findet genau einen passenden Spieler, sonst null (kein Treffer oder mehrdeutig). */
export function findUniqueScorer<T extends NameCandidate>(raw: string, candidates: T[]): T | null {
  const m = matchScorer(raw, candidates);
  return m.kind === "eindeutig" ? m.player : null;
}
