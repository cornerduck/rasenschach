/**
 * Kader-CSV einlesen und prüfen (rein, ohne Datenbank).
 *
 * Spalten (Kopfzeile, Reihenfolge egal, Groß-/Kleinschreibung egal):
 *   name          Pflicht  vollständiger Name, z. B. "Mitchell Weiser"
 *   kurzname      optional Name auf der Karte, Standard: letztes Wort des Namens
 *   verein        Pflicht  Kürzel (SVW) oder Kurzname (Bremen) oder voller Name
 *   position      Pflicht  TW/AB/MF/ST (auch Torwart/Abwehr/Mittelfeld/Sturm, G/D/M/F)
 *   nummer        optional Rückennummer 1–99
 *   sofascore_id  optional
 *   foto_url      optional
 *
 * Trennzeichen Semikolon (Excel auf Deutsch) oder Komma, wird erkannt.
 */

export type Position = "TW" | "AB" | "MF" | "ST";

export interface RosterRow {
  line: number;
  fullName: string;
  shortName: string;
  club: string;
  position: Position;
  shirtNumber: number | null;
  sofascoreId: string | null;
  photoUrl: string | null;
}

export interface RosterParseResult {
  rows: RosterRow[];
  errors: string[];
}

const POSITIONS: Record<string, Position> = {
  tw: "TW", torwart: "TW", torhüter: "TW", torhueter: "TW", g: "TW", gk: "TW", goalkeeper: "TW",
  ab: "AB", abwehr: "AB", verteidiger: "AB", verteidigung: "AB", d: "AB", df: "AB", defender: "AB",
  mf: "MF", mittelfeld: "MF", m: "MF", midfielder: "MF",
  st: "ST", sturm: "ST", stürmer: "ST", stuermer: "ST", angriff: "ST", f: "ST", fw: "ST", forward: "ST",
};

const COLUMNS = {
  name: ["name", "spieler", "vollständiger name"],
  kurzname: ["kurzname", "kartenname"],
  verein: ["verein", "club", "team"],
  position: ["position", "pos"],
  nummer: ["nummer", "rückennummer", "rueckennummer", "nr"],
  sofascore_id: ["sofascore_id", "sofascore", "sofascore-id"],
  foto_url: ["foto_url", "foto", "foto-url", "bild"],
} as const;

/** Zerlegt CSV-Text in Zeilen und Felder (mit Anführungszeichen, "" als Escape). */
export function splitCsv(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

export function parseRosterCsv(input: string): RosterParseResult {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const table = splitCsv(text, delimiter);
  const errors: string[] = [];
  const rows: RosterRow[] = [];

  if (table.length === 0) return { rows, errors: ["Datei ist leer"] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = {} as Record<keyof typeof COLUMNS, number>;
  for (const [key, names] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, readonly string[]][]) {
    col[key] = header.findIndex((h) => names.includes(h));
  }
  for (const required of ["name", "verein", "position"] as const) {
    if (col[required] < 0) errors.push(`Spalte „${required}“ fehlt in der Kopfzeile`);
  }
  if (errors.length) return { rows, errors };

  const seen = new Map<string, number>();
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (k: keyof typeof COLUMNS) => (col[k] >= 0 ? (cells[col[k]] ?? "").trim() : "");
    if (cells.every((c) => c.trim() === "")) return; // Leerzeile

    const fullName = get("name").replace(/\s+/g, " ");
    const club = get("verein");
    const posRaw = get("position");
    const numRaw = get("nummer");
    const position = POSITIONS[posRaw.toLowerCase()];
    const lineErrors: string[] = [];

    if (!fullName) lineErrors.push("Name fehlt");
    if (!club) lineErrors.push("Verein fehlt");
    if (!position) lineErrors.push(posRaw ? `Position „${posRaw}“ unbekannt (TW, AB, MF, ST)` : "Position fehlt");

    let shirtNumber: number | null = null;
    if (numRaw) {
      const n = Number(numRaw);
      if (Number.isInteger(n) && n >= 1 && n <= 99) shirtNumber = n;
      else lineErrors.push(`Rückennummer „${numRaw}“ ungültig (1–99)`);
    }

    const photoUrl = get("foto_url") || null;
    if (photoUrl && !/^https:\/\//.test(photoUrl)) lineErrors.push("Foto-URL muss mit https:// beginnen");

    const sofascoreId = get("sofascore_id") || null;
    if (sofascoreId && !/^\d+$/.test(sofascoreId)) lineErrors.push(`Sofascore-ID „${sofascoreId}“ ist keine Zahl`);

    if (lineErrors.length) {
      errors.push(`Zeile ${line}${fullName ? ` (${fullName})` : ""}: ${lineErrors.join(", ")}`);
      return;
    }

    const key = `${normalizeKey(fullName)}|${normalizeKey(club)}`;
    if (seen.has(key)) {
      errors.push(`Zeile ${line} (${fullName}): doppelt, schon in Zeile ${seen.get(key)}`);
      return;
    }
    seen.set(key, line);

    rows.push({
      line,
      fullName,
      shortName: get("kurzname") || fullName.split(" ").at(-1)!,
      club,
      position: position!,
      shirtNumber,
      sofascoreId,
      photoUrl,
    });
  });

  return { rows, errors };
}

const normalizeKey = (s: string) => s.toLowerCase().trim();
