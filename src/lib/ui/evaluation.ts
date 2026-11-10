import { STAT_FIELDS } from "@/lib/scoring/assemble";
import { KNIGHT_CATEGORIES } from "@/lib/scoring/players";
import type { KnightCategory, Piece } from "@/lib/scoring/types";

/** stat_values-Schlüssel eines Springer-Messwerts, z. B. Dauerfeuer → "offensive_actions" */
export function knightStatKey(c: KnightCategory): string {
  const field = KNIGHT_CATEGORIES[c].stat;
  return Object.entries(STAT_FIELDS).find(([, f]) => f === field)![0];
}

export interface StatMeta {
  label: string;
  unit?: string;
  /** Kommazahl erlaubt */
  decimal?: boolean;
  /** Erklärung unter dem Feld */
  hint?: string;
}

const BASE: Record<string, StatMeta> = {
  minutes_played: { label: "Minuten", unit: "min", hint: "leer = eingesetzt" },
  goals: { label: "Tore" },
  assists: { label: "Assists" },
  goals_conceded_on_pitch: { label: "Gegentore", hint: "nur während er auf dem Platz stand" },
  saves: { label: "Paraden" },
  penalties_saved: { label: "Elfer gehalten" },
  distance_km: { label: "Laufleistung", unit: "km", decimal: true },
};

export function statMeta(key: string): StatMeta {
  if (BASE[key]) return BASE[key];
  const cat = (Object.keys(KNIGHT_CATEGORIES) as KnightCategory[]).find((c) => knightStatKey(c) === key);
  if (cat) {
    const k = KNIGHT_CATEGORIES[cat];
    return { label: k.metric.charAt(0).toUpperCase() + k.metric.slice(1), unit: k.unit || undefined, decimal: k.unit !== "" };
  }
  return { label: key };
}

/** Werte, die für eine Figur eingetragen werden (Minuten immer zuerst) */
export function statKeysFor(piece: Piece, knight: KnightCategory | null): string[] {
  switch (piece) {
    case "turm":
      return ["minutes_played", "goals_conceded_on_pitch", "saves", "penalties_saved"];
    case "laeufer":
      return ["minutes_played", "distance_km"];
    case "springer":
      return knight ? ["minutes_played", knightStatKey(knight)] : ["minutes_played"];
    case "dame":
      return ["minutes_played", "goals", "assists"];
    case "koenig":
      return ["minutes_played", "goals"];
  }
}

/** Ligaweite Werte, die für eine Figur zählen */
export function leagueKeysFor(piece: Piece, knight: KnightCategory | null): string[] {
  switch (piece) {
    case "koenig":
      return ["goals"];
    case "dame":
      return ["scorer_points"];
    case "turm":
      return ["goals_prevented"];
    case "laeufer":
      return ["distance_km", "sprints"];
    case "springer":
      return knight ? [knight] : [];
  }
}

export function leagueLabel(key: string): string {
  const fixed: Record<string, string> = {
    goals: "Meiste Tore (König)",
    scorer_points: "Meiste Scorerpunkte (Dame)",
    goals_prevented: "Meiste verhinderte Tore (Turm)",
    distance_km: "Laufleistung Platz 1–3 (Läufer)",
    sprints: "Meiste Sprints (Läufer)",
  };
  if (fixed[key]) return fixed[key];
  const k = KNIGHT_CATEGORIES[key as KnightCategory];
  return k ? `${k.label}: ${k.metric} Platz 1–3 (Springer)` : key;
}

export function leagueUnit(key: string): string {
  if (key === "distance_km") return "km";
  if (key === "goals_prevented") return "xG verhindert";
  const k = KNIGHT_CATEGORIES[key as KnightCategory];
  return k?.unit ?? "";
}

/** Erlaubte stat_values-Schlüssel für Handeingaben */
export const EDITABLE_STATS = new Set([...Object.keys(STAT_FIELDS)]);

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");

/** "12,4" → 12.4; leer → null; ungültig → NaN */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export const formatNumber = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
