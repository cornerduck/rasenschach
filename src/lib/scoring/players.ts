import { podiumPoints } from "./league";
import {
  DEFAULT_RULES,
  type KnightCategory,
  type LeagueRanks,
  type Piece,
  type PlayerStats,
  type Score,
  type ScoreLine,
  type ScoringRules,
} from "./types";

const n = (v: number | null | undefined) => (typeof v === "number" ? v : 0);

export const PIECE_LABELS: Record<Piece, string> = {
  turm: "Turm",
  laeufer: "Läufer",
  springer: "Springer",
  dame: "Dame",
  koenig: "König",
};

/** Springer-Kategorien mit Messwert und Schwellen (Regelwerk 4, Springer). */
export const KNIGHT_CATEGORIES: Record<
  KnightCategory,
  { label: string; metric: string; stat: keyof PlayerStats; one: number; two: number; unit: string }
> = {
  zweikaempfer: { label: "Zweikämpfer", metric: "gewonnene Zweikämpfe", stat: "duelsWon", one: 10, two: 17, unit: "" },
  tuersteher: { label: "Türsteher", metric: "Defensivaktionen", stat: "defensiveActions", one: 13, two: 18, unit: "" },
  dauerfeuer: { label: "Dauerfeuer", metric: "Offensivaktionen", stat: "offensiveActions", one: 4, two: 7, unit: "" },
  bollwerk: { label: "Bollwerk", metric: "Zweikampfquote", stat: "duelSuccessPct", one: 70, two: 85, unit: "%" },
  laser: { label: "Laser", metric: "Passgenauigkeit", stat: "passAccuracyPct", one: 92, two: 97, unit: "%" },
  ballmagnet: { label: "Ballmagnet", metric: "Ballkontakte", stat: "touches", one: 75, two: 110, unit: "" },
  raumdeuter: { label: "Raumdeuter", metric: "Raumgewinn", stat: "progressiveDistanceM", one: 70, two: 150, unit: "m" },
  alleingang: { label: "Alleingang", metric: "weitester Sololauf", stat: "longestSoloRunM", one: 20, two: 35, unit: "m" },
  gefahrensucher: { label: "Gefahrensucher", metric: "Expected Goals", stat: "expectedGoals", one: 0.3, two: 0.9, unit: "xG" },
  schallmauer: { label: "Schallmauer", metric: "Höchstgeschwindigkeit", stat: "topSpeedKmh", one: 33.5, two: 35.0, unit: "km/h" },
};

function score(lines: ScoreLine[]): Score {
  const kept = lines.filter((l) => l.points !== 0);
  return { points: kept.reduce((s, l) => s + l.points, 0), lines: kept };
}

/** Team der Woche +2, Spieler der Woche +3 (ersetzt die +2). */
export function weeklyBonus(stats: PlayerStats): ScoreLine[] {
  if (stats.playerOfWeek) return [{ label: "Spieler der Woche", points: 3 }];
  if (stats.teamOfWeek) return [{ label: "Team der Woche", points: 2 }];
  return [];
}

export function koenigLines(stats: PlayerStats, ranks: LeagueRanks): ScoreLine[] {
  const goals = n(stats.goals);
  return [
    { label: goals === 1 ? "1 Tor" : `${goals} Tore`, points: goals },
    { label: "Doppelpack", points: goals === 2 ? 1 : 0 },
    { label: "Dreierpack", points: goals >= 3 ? 2 : 0 },
    { label: "Ligaweit meiste Tore", points: ranks.goals === 1 ? 1 : 0 },
  ];
}

export function dameLines(stats: PlayerStats, ranks: LeagueRanks): ScoreLine[] {
  const goals = n(stats.goals);
  const assists = n(stats.assists);
  return [
    { label: goals === 1 ? "1 Tor" : `${goals} Tore`, points: goals },
    { label: assists === 1 ? "1 Assist" : `${assists} Assists`, points: assists },
    { label: "Tor und Assist", points: goals > 0 && assists > 0 ? 1 : 0 },
    { label: "Ligaweit meiste Scorerpunkte", points: ranks.scorerPoints === 1 ? 1 : 0 },
  ];
}

export function turmLines(stats: PlayerStats, ranks: LeagueRanks): ScoreLine[] {
  const saves = n(stats.saves);
  return [
    // Nur wenn die Gegentore wirklich eingetragen sind (fehlender Wert ≠ zu Null)
    { label: "Zu Null", points: stats.goalsConcededOnPitch === 0 ? 1 : 0 },
    { label: "Elfmeter gehalten", points: n(stats.penaltiesSaved) },
    { label: saves >= 8 ? "8+ Paraden" : "5+ Paraden", points: saves >= 8 ? 2 : saves >= 5 ? 1 : 0 },
    { label: "Ligaweit meiste verhinderte Tore", points: ranks.goalsPrevented === 1 ? 1 : 0 },
  ];
}

export function laeuferLines(stats: PlayerStats, ranks: LeagueRanks): ScoreLine[] {
  const km = n(stats.distanceKm);
  return [
    { label: km >= 12 ? "12+ km" : "11+ km", points: km >= 12 ? 2 : km >= 11 ? 1 : 0 },
    { label: `Laufleistung Platz ${ranks.distanceKm}`, points: podiumPoints(ranks.distanceKm) },
    { label: "Ligaweit meiste Sprints", points: ranks.sprints === 1 ? 1 : 0 },
  ];
}

export function springerLines(
  stats: PlayerStats,
  ranks: LeagueRanks,
  category: KnightCategory,
  rules: ScoringRules,
): ScoreLine[] {
  const c = KNIGHT_CATEGORIES[category];
  // Wer die Einsatzzeit verfehlt, wertet nicht (Bonus für Team/Spieler der Woche bleibt)
  if (stats.minutesPlayed != null && stats.minutesPlayed < rules.springerMinMinutes) return [];
  const value = n(stats[c.stat] as number | null | undefined);
  const threshold = value >= c.two ? 2 : value >= c.one ? 1 : 0;
  return [
    { label: `${c.label} ab ${threshold === 2 ? c.two : c.one}${c.unit ? " " + c.unit : ""}`, points: threshold },
    { label: `${c.label} Platz ${ranks[category]}`, points: podiumPoints(ranks[category]) },
  ];
}

export interface PlayerScoreInput {
  piece: Piece;
  stats: PlayerStats;
  ranks?: LeagueRanks;
  /** Nur für den Springer: die geloste Kategorie des Spieltags */
  knightCategory?: KnightCategory | null;
  rules?: ScoringRules;
}

/** Punkte eines gesetzten Spielers inkl. Bonus für Team/Spieler der Woche. */
export function playerScore({ piece, stats, ranks = {}, knightCategory, rules = DEFAULT_RULES }: PlayerScoreInput): Score {
  // Ohne Einsatz: 0 Punkte
  if (stats.minutesPlayed === 0) return { points: 0, lines: [{ label: "Nicht eingesetzt", points: 0 }] };

  // Turm: ab 2 Gegentoren auf dem Platz 0 Punkte, auch kein Bonus
  if (piece === "turm" && n(stats.goalsConcededOnPitch) >= 2) {
    return { points: 0, lines: [{ label: `${stats.goalsConcededOnPitch} Gegentore`, points: 0 }] };
  }

  let lines: ScoreLine[];
  switch (piece) {
    case "koenig":
      lines = koenigLines(stats, ranks);
      break;
    case "dame":
      lines = dameLines(stats, ranks);
      break;
    case "turm":
      lines = turmLines(stats, ranks);
      break;
    case "laeufer":
      lines = laeuferLines(stats, ranks);
      break;
    case "springer":
      if (!knightCategory) throw new Error("Springer ohne geloste Kategorie");
      lines = springerLines(stats, ranks, knightCategory, rules);
      break;
  }
  return score([...lines, ...weeklyBonus(stats)]);
}
