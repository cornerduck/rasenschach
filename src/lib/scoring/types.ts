/**
 * Typen für die Punkteberechnung nach docs/REGELWERK.md.
 * Alles hier ist rein (keine Datenbank, kein Netzwerk) und vollständig getestet.
 */

export type ThesisField = "plus_minus_3" | "minus_plus_3" | "plus_1" | "minus_1" | "frage";
export type QuestionValue = "plus_1" | "plus_2" | "plus_3" | "minus_3" | "plus_minus_3";
export type Piece = "turm" | "laeufer" | "springer" | "dame" | "koenig";
export type KnightCategory =
  | "zweikaempfer"
  | "tuersteher"
  | "dauerfeuer"
  | "bollwerk"
  | "laser"
  | "ballmagnet"
  | "raumdeuter"
  | "alleingang"
  | "gefahrensucher"
  | "schallmauer";

/** Messwerte eines Spielers an einem Spieltag (gültige Werte, Handeingabe bereits bevorzugt). */
export interface PlayerStats {
  /** 0 = nicht eingesetzt. Fehlt der Wert, gilt der Spieler als eingesetzt. */
  minutesPlayed?: number | null;
  goals?: number | null;
  assists?: number | null;
  goalsConcededOnPitch?: number | null;
  saves?: number | null;
  penaltiesSaved?: number | null;
  distanceKm?: number | null;
  sprints?: number | null;
  duelsWon?: number | null;
  defensiveActions?: number | null;
  offensiveActions?: number | null;
  duelSuccessPct?: number | null;
  passAccuracyPct?: number | null;
  touches?: number | null;
  progressiveDistanceM?: number | null;
  longestSoloRunM?: number | null;
  expectedGoals?: number | null;
  topSpeedKmh?: number | null;
  teamOfWeek?: boolean | null;
  playerOfWeek?: boolean | null;
}

/** Ligaweite Messwerte, für die es Platzierungsboni gibt. */
export type LeagueStat =
  | "goals"
  | "scorerPoints"
  | "goalsPrevented"
  | "distanceKm"
  | "sprints"
  | KnightCategory;

/** Ligaweite Plätze eines Spielers (1, 2, 3; fehlt = nicht unter den Besten). */
export type LeagueRanks = Partial<Record<LeagueStat, number>>;

/** Konfigurierbare Punkte aus „Noch offen“ im Regelwerk. */
export interface ScoringRules {
  /** Mindesteinsatzzeit in Minuten, damit der Springer wertet. */
  springerMinMinutes: number;
}

export const DEFAULT_RULES: ScoringRules = {
  springerMinMinutes: 0,
};

/** Eine Zeile der Punkteaufschlüsselung, z. B. { label: "Doppelpack", points: 1 }. */
export interface ScoreLine {
  label: string;
  points: number;
}

export interface Score {
  points: number;
  lines: ScoreLine[];
}
