/**
 * Setzt aus den Rohdaten eines Spieltags (so wie sie aus der Datenbank kommen)
 * das komplette Ergebnis zusammen: Status, Punkte beider, Aufschlüsselung pro Karte.
 * Rein und getestet; das Laden passiert in repository.ts.
 */
import { leagueRanks } from "./league";
import { playerScore } from "./players";
import { thesisPoints } from "./theses";
import {
  DEFAULT_RULES,
  type KnightCategory,
  type LeagueRanks,
  type LeagueStat,
  type Piece,
  type PlayerStats,
  type QuestionValue,
  type Score,
  type ScoringRules,
  type ThesisField,
} from "./types";

export type Manager = "bent" | "bjoern";

// ---------------------------------------------------------------------------
// Rohdaten

export interface RawThesisPick {
  manager: Manager;
  field: ThesisField;
  pickNo: number;
  thesisId: number;
  text: string;
  outcome: boolean | null;
  confirmedBent: boolean;
  confirmedBjoern: boolean;
}

export interface RawPlayerPick {
  manager: Manager;
  piece: Piece;
  pickNo: number;
  playerId: number;
}

export interface RawStat {
  playerId: number;
  statKey: string; // Schlüssel aus stat_values, z. B. "distance_km"
  value: number;
  source: string;
}

export interface RawGoal {
  playerId: number | null;
  scorerExternalId: string | null;
  scorerName: string;
  isOwnGoal: boolean;
}

export interface RawLeagueRank {
  statKey: string; // "goals", "scorer_points", "goals_prevented", "distance_km", "sprints" oder Springer-Kategorie
  rank: number;
  playerId: number | null;
}

export interface RawMatch {
  kickoff: string;
  originalKickoff: string | null;
  isFinished: boolean;
}

export interface MatchdayRaw {
  matchdayId: number;
  number: number;
  questionValue: QuestionValue | null;
  knightCategory: KnightCategory | null;
  thesisStarter: Manager | null;
  closedAt: string | null;
  rules: Partial<{ springer_mindestminuten: number }> | null;
  matches: RawMatch[];
  thesesCount: number;
  /** Thesen-Draft wurde gestartet (Knopf „Thesen-Draft starten“) */
  draftStarted: boolean;
  thesisPicks: RawThesisPick[];
  playerPicks: RawPlayerPick[];
  stats: RawStat[];
  goals: RawGoal[];
  leagueRanks: RawLeagueRank[];
}

// ---------------------------------------------------------------------------
// Ergebnis

export type MatchdayStatus =
  | "vorbereitung" // Thesen/Räder/Startspieler fehlen noch
  | "thesen_draft"
  | "spieler_draft"
  | "laeuft" // Deadline vorbei, noch nicht alle Spiele beendet
  | "auswertung" // alle Spiele beendet, noch nicht abgeschlossen
  | "abgeschlossen";

export interface ThesisResult {
  field: ThesisField;
  pickNo: number;
  thesisId: number;
  text: string;
  outcome: boolean | null;
  confirmedBent: boolean;
  confirmedBjoern: boolean;
  /** null = noch nicht von beiden bestätigt */
  points: number | null;
}

export interface PlayerResult {
  piece: Piece;
  pickNo: number;
  playerId: number;
  stats: PlayerStats;
  ranks: LeagueRanks;
  score: Score;
}

export interface ManagerResult {
  thesisPoints: number;
  playerPoints: number;
  total: number;
  openTheses: number;
  theses: ThesisResult[];
  players: PlayerResult[];
}

export interface MatchdayResult {
  matchdayId: number;
  number: number;
  status: MatchdayStatus;
  deadline: string | null;
  bent: ManagerResult;
  bjoern: ManagerResult;
  /** Spieltagssieger (nur Statistik); null bei Gleichstand oder solange nichts gewertet ist */
  winner: Manager | null;
  /** Ligaweite Werte, die für gesetzte Figuren gebraucht, aber noch nicht eingetragen sind */
  missingLeagueStats: string[];
  /** Torschützen dieses Spieltags ohne Zuordnung zu einem Spieler */
  unassignedScorers: number;
  /** Wer im laufenden Draft am Zug ist (null außerhalb der Drafts) */
  turn: Manager | null;
  /** Wie viele Züge der aktuelle Zieher noch am Stück hat (1 oder 2) */
  turnPicks: number;
  /** Mindestens ein Zug wurde gesetzt (sonst: Spieltag nicht mitgespielt) */
  played: boolean;
  /** Vorbereitung erledigt (von 4) und Anzahl Züge je Draft, für die Kacheln */
  progress: { prep: number; thesisPicks: number; playerPicks: number };
}

const SNAKE = [1, 2, 2, 1, 1, 2, 2, 1, 1, 2];

/** Wer setzt Zug Nummer n (1–10)? Snake-Reihenfolge 1, 2, 2, 2, 2, 1. */
export function snakeTurn(first: Manager, pickNo: number): Manager {
  const other: Manager = first === "bent" ? "bjoern" : "bent";
  return SNAKE[pickNo - 1] === 1 ? first : other;
}

/** Wie viele Züge hintereinander hat der Zieher ab Zug n noch? */
export function picksInARow(pickNo: number): number {
  let k = 1;
  while (pickNo - 1 + k < SNAKE.length && SNAKE[pickNo - 1 + k] === SNAKE[pickNo - 1]) k++;
  return k;
}

// ---------------------------------------------------------------------------

/** stat_values-Schlüssel → Feld in PlayerStats */
const STAT_FIELDS: Record<string, keyof PlayerStats> = {
  minutes_played: "minutesPlayed",
  goals: "goals",
  assists: "assists",
  goals_conceded_on_pitch: "goalsConcededOnPitch",
  saves: "saves",
  penalties_saved: "penaltiesSaved",
  distance_km: "distanceKm",
  sprints: "sprints",
  duels_won: "duelsWon",
  defensive_actions: "defensiveActions",
  offensive_actions: "offensiveActions",
  duel_success_pct: "duelSuccessPct",
  pass_accuracy_pct: "passAccuracyPct",
  touches: "touches",
  progressive_distance_m: "progressiveDistanceM",
  longest_solo_run_m: "longestSoloRunM",
  expected_goals: "expectedGoals",
  top_speed_kmh: "topSpeedKmh",
  team_of_week: "teamOfWeek",
  player_of_week: "playerOfWeek",
};

/** league_ranks-Schlüssel → LeagueStat */
const LEAGUE_FIELDS: Record<string, LeagueStat> = {
  goals: "goals",
  scorer_points: "scorerPoints",
  goals_prevented: "goalsPrevented",
  distance_km: "distanceKm",
  sprints: "sprints",
};

export const LEAGUE_STAT_LABELS: Record<string, string> = {
  goals: "Meiste Tore",
  scorer_points: "Meiste Scorerpunkte",
  goals_prevented: "Meiste verhinderte Tore",
  distance_km: "Laufleistung Platz 1–3",
  sprints: "Meiste Sprints",
};

/** Welche ligaweiten Werte braucht eine Figur? */
function leagueKeysFor(piece: Piece, category: KnightCategory | null): string[] {
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
      return category ? [category] : [];
  }
}

export function toPlayerStats(rows: RawStat[]): PlayerStats {
  const s: PlayerStats = {};
  for (const r of rows) {
    const f = STAT_FIELDS[r.statKey];
    if (!f) continue;
    if (f === "teamOfWeek" || f === "playerOfWeek") s[f] = r.value > 0;
    else (s as Record<string, number>)[f] = Number(r.value);
  }
  return s;
}

/** Deadline = frühester (ursprünglicher) Anstoß. */
export function deadlineOf(matches: RawMatch[]): string | null {
  let min: number | null = null;
  for (const m of matches) {
    const t = Math.min(Date.parse(m.kickoff), Date.parse(m.originalKickoff ?? m.kickoff));
    if (min === null || t < min) min = t;
  }
  return min === null ? null : new Date(min).toISOString();
}

/** Fortschritt der Vorbereitung: 12 Thesen, Startspieler, ?-Rad, Springer-Rad */
export function prepProgress(raw: Pick<MatchdayRaw, "thesesCount" | "thesisStarter" | "questionValue" | "knightCategory">) {
  const done = [raw.thesesCount >= 12, !!raw.thesisStarter, !!raw.questionValue, !!raw.knightCategory].filter(Boolean).length;
  return { done, total: 4 };
}

export function matchdayStatus(raw: MatchdayRaw, now: Date): MatchdayStatus {
  if (raw.closedAt) return "abgeschlossen";
  const deadline = deadlineOf(raw.matches);
  const past = deadline !== null && now.getTime() >= Date.parse(deadline);
  if (past) {
    return raw.matches.length > 0 && raw.matches.every((m) => m.isFinished) ? "auswertung" : "laeuft";
  }
  if (prepProgress(raw).done < 4) return "vorbereitung";
  if (!raw.draftStarted && raw.thesisPicks.length === 0) return "vorbereitung"; // bereit, aber noch nicht gestartet
  if (raw.thesisPicks.length < 10) return "thesen_draft";
  if (raw.playerPicks.length < 10) return "spieler_draft";
  return "spieler_draft"; // beide Drafts fertig, wartet auf Anstoß
}

/**
 * Ligaweite Plätze.
 * - Tore: automatisch aus allen Toren des Spieltags (Eigentore zählen nicht). Handeingaben
 *   für Tore einzelner Spieler gehen vor.
 * - Alles andere: aus league_ranks (per Hand oder später von einer Quelle).
 * - Gibt es für einen Wert Einträge in league_ranks, gelten nur diese (auch für Tore).
 */
export function computeLeagueRanks(raw: MatchdayRaw): Map<number, LeagueRanks> {
  const result = new Map<number, LeagueRanks>();
  const set = (playerId: number, stat: LeagueStat, rank: number) => {
    const r = result.get(playerId) ?? {};
    r[stat] = rank;
    result.set(playerId, r);
  };

  const manualKeys = new Set(raw.leagueRanks.map((r) => r.statKey));
  for (const r of raw.leagueRanks) {
    if (r.playerId == null) continue;
    const stat = LEAGUE_FIELDS[r.statKey] ?? (r.statKey as LeagueStat);
    set(r.playerId, stat, r.rank);
  }

  if (!manualKeys.has("goals")) {
    const counts = new Map<string, number>();
    for (const g of raw.goals) {
      if (g.isOwnGoal) continue;
      const key = g.playerId != null ? `p:${g.playerId}` : g.scorerExternalId ? `x:${g.scorerExternalId}` : `n:${g.scorerName}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Handkorrekturen der Tore einzelner Spieler berücksichtigen
    for (const s of raw.stats) {
      if (s.statKey === "goals" && s.source === "manual") counts.set(`p:${s.playerId}`, Number(s.value));
    }
    const ranks = leagueRanks([...counts].map(([id, value]) => ({ id, value })), 1);
    for (const [key, rank] of ranks) {
      if (key.startsWith("p:")) set(Number(key.slice(2)), "goals", rank);
    }
  }
  return result;
}

function emptyManager(): ManagerResult {
  return { thesisPoints: 0, playerPoints: 0, total: 0, openTheses: 0, theses: [], players: [] };
}

export function assembleMatchday(raw: MatchdayRaw, now: Date = new Date()): MatchdayResult {
  const rules: ScoringRules = {
    ...DEFAULT_RULES,
    springerMinMinutes: raw.rules?.springer_mindestminuten ?? DEFAULT_RULES.springerMinMinutes,
  };

  const statsByPlayer = new Map<number, RawStat[]>();
  for (const s of raw.stats) statsByPlayer.set(s.playerId, [...(statsByPlayer.get(s.playerId) ?? []), s]);
  const ranksByPlayer = computeLeagueRanks(raw);

  const managers: Record<Manager, ManagerResult> = { bent: emptyManager(), bjoern: emptyManager() };

  for (const t of [...raw.thesisPicks].sort((a, b) => a.pickNo - b.pickNo)) {
    const m = managers[t.manager];
    const points =
      t.field === "frage" && !raw.questionValue
        ? null
        : thesisPoints(t.field, { outcome: t.outcome, confirmedBent: t.confirmedBent, confirmedBjoern: t.confirmedBjoern }, raw.questionValue);
    m.theses.push({
      field: t.field,
      pickNo: t.pickNo,
      thesisId: t.thesisId,
      text: t.text,
      outcome: t.outcome,
      confirmedBent: t.confirmedBent,
      confirmedBjoern: t.confirmedBjoern,
      points,
    });
    if (points === null) m.openTheses++;
    else m.thesisPoints += points;
  }

  const missing = new Set<string>();
  const manualKeys = new Set(raw.leagueRanks.map((r) => r.statKey));

  for (const p of [...raw.playerPicks].sort((a, b) => a.pickNo - b.pickNo)) {
    const m = managers[p.manager];
    const stats = toPlayerStats(statsByPlayer.get(p.playerId) ?? []);
    const ranks = ranksByPlayer.get(p.playerId) ?? {};
    const score =
      p.piece === "springer" && !raw.knightCategory
        ? { points: 0, lines: [] }
        : playerScore({ piece: p.piece, stats, ranks, knightCategory: raw.knightCategory, rules });
    m.players.push({ piece: p.piece, pickNo: p.pickNo, playerId: p.playerId, stats, ranks, score });
    m.playerPoints += score.points;

    for (const key of leagueKeysFor(p.piece, raw.knightCategory)) {
      if (key !== "goals" && !manualKeys.has(key)) missing.add(key);
    }
  }

  for (const m of Object.values(managers)) m.total = m.thesisPoints + m.playerPoints;

  const status = matchdayStatus(raw, now);
  const scored = status === "auswertung" || status === "abgeschlossen";
  let winner: Manager | null = null;
  if (scored && managers.bent.total !== managers.bjoern.total) {
    winner = managers.bent.total > managers.bjoern.total ? "bent" : "bjoern";
  }

  let turn: Manager | null = null;
  let turnPicks = 0;
  if (raw.thesisStarter && (status === "thesen_draft" || status === "spieler_draft")) {
    const thesisPhase = status === "thesen_draft";
    const next = (thesisPhase ? raw.thesisPicks.length : raw.playerPicks.length) + 1;
    if (next <= 10) {
      const first: Manager = thesisPhase ? raw.thesisStarter : raw.thesisStarter === "bent" ? "bjoern" : "bent";
      turn = snakeTurn(first, next);
      turnPicks = picksInARow(next);
    }
  }

  return {
    matchdayId: raw.matchdayId,
    number: raw.number,
    status,
    turn,
    turnPicks,
    played: raw.thesisPicks.length + raw.playerPicks.length > 0,
    progress: { prep: prepProgress(raw).done, thesisPicks: raw.thesisPicks.length, playerPicks: raw.playerPicks.length },
    deadline: deadlineOf(raw.matches),
    bent: managers.bent,
    bjoern: managers.bjoern,
    winner,
    missingLeagueStats: [...missing],
    unassignedScorers: raw.goals.filter((g) => !g.isOwnGoal && g.playerId == null).length,
  };
}

// ---------------------------------------------------------------------------
// Saison

export interface SeasonStandings {
  bent: number;
  bjoern: number;
  /** nur abgeschlossene Spieltage */
  bentClosed: number;
  bjoernClosed: number;
  matchdays: MatchdayResult[];
  wins: { bent: number; bjoern: number; draws: number };
}

export function seasonStandings(results: MatchdayResult[]): SeasonStandings {
  const s: SeasonStandings = {
    bent: 0,
    bjoern: 0,
    bentClosed: 0,
    bjoernClosed: 0,
    matchdays: [...results].sort((a, b) => a.number - b.number),
    wins: { bent: 0, bjoern: 0, draws: 0 },
  };
  for (const r of results) {
    s.bent += r.bent.total;
    s.bjoern += r.bjoern.total;
    if (r.status === "abgeschlossen") {
      s.bentClosed += r.bent.total;
      s.bjoernClosed += r.bjoern.total;
      if (r.winner === "bent") s.wins.bent++;
      else if (r.winner === "bjoern") s.wins.bjoern++;
      else s.wins.draws++;
    }
  }
  return s;
}
