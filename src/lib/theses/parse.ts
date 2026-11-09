/**
 * Thesen aus eingefügtem Text lesen und den Spielen zuordnen (rein, ohne Datenbank).
 * Format laut Regelwerk: 12 Thesen, zuerst 3 Spieltagsthesen, dann je 1 These pro Spiel.
 */
import { normalizeName } from "@/lib/roster/names";

export interface ClubInfo {
  id: number;
  code: string;
  name: string;
  shortName: string;
}

export interface MatchInfo {
  id: number;
  homeClubId: number;
  awayClubId: number;
}

export interface DraftThesis {
  text: string;
  kind: "spieltag" | "spiel";
  matchId: number | null;
  /** Wie das Spiel gefunden wurde: per Vereinsname, nach Reihenfolge oder gar nicht */
  matchSource: "name" | "reihenfolge" | null;
}

/** Spitznamen und gängige Kurzformen je Vereinskürzel (zusätzlich zu Name/Kurzname/Kürzel). */
const NICKNAMES: Record<string, string[]> = {
  SVW: ["werder", "bremer", "bremens", "grün weißen", "gruen weissen"],
  FCB: ["bayern", "fc bayern", "münchner", "muenchner", "fcb", "der rekordmeister"],
  BVB: ["dortmund", "dortmunder", "borussia dortmund", "schwarz gelben", "schwarzgelben"],
  B04: ["leverkusen", "bayer", "werkself", "leverkusener"],
  RBL: ["leipzig", "rb", "rasenballer", "leipziger"],
  VFB: ["stuttgart", "vfb", "stuttgarter", "schwaben"],
  SGE: ["frankfurt", "eintracht", "frankfurter", "adler"],
  SCF: ["freiburg", "freiburger", "breisgauer", "sc freiburg"],
  TSG: ["hoffenheim", "tsg", "hoffenheimer", "kraichgauer"],
  BMG: ["gladbach", "mönchengladbach", "moenchengladbach", "fohlen", "gladbacher", "borussia mönchengladbach"],
  FCA: ["augsburg", "augsburger", "fuggerstädter"],
  M05: ["mainz", "mainzer", "nullfünfer", "nullfuenfer", "05er"],
  FCU: ["union", "union berlin", "eisernen", "köpenicker", "koepenicker"],
  KOE: ["köln", "koeln", "kölner", "koelner", "effzeh", "geißböcke", "geissboecke", "fc köln"],
  HSV: ["hsv", "hamburg", "hamburger", "rothosen"],
  S04: ["schalke", "s04", "knappen", "königsblauen", "koenigsblauen", "schalker"],
  SCP: ["paderborn", "paderborner", "sc paderborn"],
  SVE: ["elversberg", "elversberger", "sve"],
};

/** Entfernt Nummerierung und Aufzählungszeichen: "1. ", "1) ", "- ", "• ". */
export function cleanLine(line: string): string {
  return line
    .replace(/^\s*(?:\(?\d{1,2}[.):]\)?|[-•*–—])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ist die Zeile eine Überschrift wie "Spieltagsthesen:" oder "Thesen zu den Spielen"? */
function isHeading(line: string): boolean {
  const l = line.toLowerCase();
  return (line.endsWith(":") && line.length < 40) || /^(spieltags?thesen|thesen zu den spielen|spielthesen|thesen)\b:?$/.test(l);
}

/** Zerlegt eingefügten Text in einzelne Thesen. */
export function splitTheses(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l.length > 0 && !isHeading(l));
}

/** Welche Vereine werden in einem Text genannt? */
export function mentionedClubs(text: string, clubs: ClubInfo[]): Set<number> {
  const t = ` ${normalizeName(text)} `;
  const found = new Set<number>();
  for (const c of clubs) {
    const aliases = [c.name, c.shortName, c.code, ...(NICKNAMES[c.code] ?? [])].map(normalizeName).filter((a) => a.length >= 2);
    if (aliases.some((a) => t.includes(` ${a} `))) found.add(c.id);
  }
  return found;
}

/** Findet das Spiel, auf das eine These sich eindeutig bezieht (über genannte Vereine). */
export function matchForText(text: string, matches: MatchInfo[], clubs: ClubInfo[]): number | null {
  const named = mentionedClubs(text, clubs);
  if (named.size === 0) return null;
  const hits = matches.filter((m) => named.has(m.homeClubId) || named.has(m.awayClubId));
  // Beide Vereine eines Spiels genannt: eindeutig, auch wenn noch ein dritter vorkommt
  const both = hits.filter((m) => named.has(m.homeClubId) && named.has(m.awayClubId));
  if (both.length === 1) return both[0].id;
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Teilt Thesen auf: die ersten 3 sind Spieltagsthesen, der Rest Spielthesen.
 * Spielthesen werden zuerst über Vereinsnamen zugeordnet, übrige nach Reihenfolge
 * auf die noch freien Spiele (Spiele in Anstoß-Reihenfolge übergeben).
 */
export function assignTheses(lines: string[], matches: MatchInfo[], clubs: ClubInfo[], matchdayTheses = 3): DraftThesis[] {
  const result: DraftThesis[] = lines.map((text, i) =>
    i < matchdayTheses
      ? { text, kind: "spieltag", matchId: null, matchSource: null }
      : { text, kind: "spiel", matchId: null, matchSource: null },
  );

  const used = new Set<number>();
  for (const t of result) {
    if (t.kind !== "spiel") continue;
    const id = matchForText(t.text, matches, clubs);
    if (id !== null && !used.has(id)) {
      t.matchId = id;
      t.matchSource = "name";
      used.add(id);
    }
  }

  const free = matches.filter((m) => !used.has(m.id));
  for (const t of result) {
    if (t.kind !== "spiel" || t.matchId !== null) continue;
    const next = free.shift();
    if (!next) break;
    t.matchId = next.id;
    t.matchSource = "reihenfolge";
  }
  return result;
}

/** Hinweise, bevor gespeichert wird. Leere Liste = alles passt zum Regelwerk. */
export function validateTheses(theses: DraftThesis[], matchCount: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (theses.length !== 12) errors.push(`Es müssen genau 12 Thesen sein (gerade ${theses.length}).`);
  if (theses.some((t) => !t.text.trim())) errors.push("Mindestens eine These ist leer.");

  const day = theses.filter((t) => t.kind === "spieltag").length;
  const game = theses.filter((t) => t.kind === "spiel");
  if (day !== 3) warnings.push(`Laut Regelwerk 3 Spieltagsthesen, gerade ${day}.`);
  const withoutMatch = game.filter((t) => t.matchId === null).length;
  if (withoutMatch) warnings.push(`${withoutMatch} Spielthese(n) ohne Spiel.`);
  const ids = game.map((t) => t.matchId).filter((x): x is number => x !== null);
  const dupes = ids.length - new Set(ids).size;
  if (dupes) warnings.push("Ein Spiel hat mehr als eine These.");
  if (new Set(ids).size < matchCount && game.length >= matchCount) warnings.push("Nicht jedes Spiel hat eine These.");
  return { errors, warnings };
}
