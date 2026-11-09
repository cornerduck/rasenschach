/**
 * Einheitliche Datentypen, unabhängig von der Quelle.
 * Jede Quelle (OpenLigaDB, später Sofascore, CSV-Import, Handeingabe) liefert diese Formen.
 * Die App arbeitet nur mit diesen Typen, nie mit den Rohdaten einer Quelle.
 */

/** Woher ein Wert stammt. "manual" schlägt beim Zusammenführen immer alles andere. */
export type DataSourceId = "openligadb" | "sofascore" | "csv" | "manual";

/** Kennungen eines Objekts in den verschiedenen Quellen (z. B. { openligadb: "40", sofascore: "2672" }). */
export type ExternalIds = Partial<Record<DataSourceId, string>>;

export interface Team {
  externalIds: ExternalIds;
  name: string;
  shortName: string;
  logoUrl: string | null;
}

export interface Matchday {
  number: number; // 1–34
  name: string;
}

export interface Goal {
  minute: number | null;
  scorerName: string;
  scorerExternalIds: ExternalIds;
  /** Kennung des Teams, das den Treffer bekommt (bei Eigentoren der Gegner des Schützen). */
  scoringTeamExternalIds: ExternalIds;
  isPenalty: boolean;
  isOwnGoal: boolean;
  isStoppageTime: boolean;
}

export interface Match {
  externalIds: ExternalIds;
  season: number; // Startjahr, z. B. 2026 für 2026/27
  matchday: number;
  kickoff: string; // ISO-Zeit in UTC
  home: Team;
  away: Team;
  isFinished: boolean;
  halftime: { home: number; away: number } | null;
  fulltime: { home: number; away: number } | null;
  goals: Goal[];
  /** Zeitpunkt der letzten Änderung bei der Quelle, falls bekannt */
  sourceUpdatedAt: string | null;
}

/**
 * Spielerwerte eines Spiels. Alle Felder optional: jede Quelle füllt, was sie kann,
 * der Rest kommt per Hand. Namen entsprechen den Messwerten aus REGELWERK.md.
 */
export interface PlayerMatchStats {
  playerExternalIds: ExternalIds;
  matchExternalIds: ExternalIds;
  minutesPlayed?: number;
  goals?: number;
  assists?: number;
  // Turm
  goalsConcededWhileOnPitch?: number;
  saves?: number;
  penaltiesSaved?: number;
  goalsPrevented?: number;
  // Läufer
  distanceKm?: number;
  sprints?: number;
  // Springer
  duelsWon?: number;
  defensiveActions?: number;
  offensiveActions?: number;
  duelSuccessPct?: number;
  passAccuracyPct?: number;
  touches?: number;
  progressiveDistanceM?: number;
  longestSoloRunM?: number;
  expectedGoals?: number;
  topSpeedKmh?: number;
  // Bonus
  inTeamOfTheWeek?: boolean;
  playerOfTheWeek?: boolean;
}

/** Ergebnis eines Abrufs: entweder Daten oder ein verständlicher Fehler, nie eine Ausnahme. */
export type SourceResult<T> =
  | { ok: true; data: T; source: DataSourceId }
  | { ok: false; error: string; source: DataSourceId };

/** Quelle für Spielplan und Ergebnisse (heute OpenLigaDB). */
export interface FixtureSource {
  id: DataSourceId;
  getTeams(season: number): Promise<SourceResult<Team[]>>;
  getMatchdays(season: number): Promise<SourceResult<Matchday[]>>;
  getCurrentMatchday(): Promise<SourceResult<Matchday>>;
  getMatches(season: number, matchday: number): Promise<SourceResult<Match[]>>;
}

/** Quelle für Spielerwerte pro Spiel (später z. B. Sofascore). Liefert Teilmengen von PlayerMatchStats. */
export interface PlayerStatsSource {
  id: DataSourceId;
  getMatchdayStats(season: number, matchday: number): Promise<SourceResult<PlayerMatchStats[]>>;
}
