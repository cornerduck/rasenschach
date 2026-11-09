import type { QuestionValue, ThesisField } from "./types";

/** Punkte für „trifft ein“ und „trifft nicht ein“ je Feld (Regelwerk 2). */
const FIELD_POINTS: Record<Exclude<ThesisField, "frage">, { hit: number; miss: number }> = {
  plus_minus_3: { hit: 3, miss: -3 },
  minus_plus_3: { hit: -3, miss: 3 },
  plus_1: { hit: 1, miss: 0 },
  minus_1: { hit: -1, miss: 0 },
};

/** ?-Feld je nach Auslosung. */
const QUESTION_POINTS: Record<QuestionValue, { hit: number; miss: number }> = {
  plus_1: { hit: 1, miss: 0 },
  plus_2: { hit: 2, miss: 0 },
  plus_3: { hit: 3, miss: 0 },
  minus_3: { hit: -3, miss: 0 },
  plus_minus_3: { hit: 3, miss: -3 },
};

export const THESIS_FIELD_LABELS: Record<ThesisField, string> = {
  plus_minus_3: "+/−3",
  minus_plus_3: "−/+3",
  plus_1: "+1",
  minus_1: "−1",
  frage: "?-Feld",
};

export interface ThesisResolution {
  /** true = eingetroffen, false = nicht eingetroffen, null = noch offen */
  outcome: boolean | null;
  confirmedBent: boolean;
  confirmedBjoern: boolean;
}

/** Eine These zählt erst, wenn ein Ergebnis feststeht und beide bestätigt haben. */
export function isThesisScored(r: ThesisResolution): boolean {
  return r.outcome !== null && r.confirmedBent && r.confirmedBjoern;
}

/**
 * Punkte einer gesetzten These. Gibt null zurück, solange sie nicht gewertet ist.
 * Das ?-Feld braucht den gelosten Wert des Spieltags.
 */
export function thesisPoints(
  field: ThesisField,
  resolution: ThesisResolution,
  questionValue: QuestionValue | null,
): number | null {
  if (!isThesisScored(resolution)) return null;
  let table: { hit: number; miss: number };
  if (field === "frage") {
    if (!questionValue) throw new Error("?-Feld ohne gelosten Wert");
    table = QUESTION_POINTS[questionValue];
  } else {
    table = FIELD_POINTS[field];
  }
  return resolution.outcome ? table.hit : table.miss;
}
