import { playerScore, type PlayerScoreInput } from "./players";
import { thesisPoints, type ThesisResolution } from "./theses";
import type { QuestionValue, Score, ThesisField } from "./types";

export interface ManagerMatchdayInput {
  theses: { field: ThesisField; resolution: ThesisResolution }[];
  players: PlayerScoreInput[];
  questionValue: QuestionValue | null;
}

export interface ManagerMatchdayScore {
  thesisPoints: number;
  playerPoints: number;
  total: number;
  /** Thesen, die noch nicht von beiden bestätigt sind */
  openTheses: number;
  playerScores: Score[];
}

/** Spieltagspunkte = Thesenpunkte + Spielerpunkte (Regelwerk 5). Offene Thesen zählen vorerst 0. */
export function managerMatchdayScore(input: ManagerMatchdayInput): ManagerMatchdayScore {
  let thesisSum = 0;
  let open = 0;
  for (const t of input.theses) {
    const p = thesisPoints(t.field, t.resolution, input.questionValue);
    if (p === null) open++;
    else thesisSum += p;
  }
  const playerScores = input.players.map(playerScore);
  const playerSum = playerScores.reduce((s, x) => s + x.points, 0);
  return {
    thesisPoints: thesisSum,
    playerPoints: playerSum,
    total: thesisSum + playerSum,
    openTheses: open,
    playerScores,
  };
}

/** Spieltagssieger (nur Statistik). null = Unentschieden. */
export function matchdayWinner(bent: number, bjoern: number): "bent" | "bjoern" | null {
  if (bent === bjoern) return null;
  return bent > bjoern ? "bent" : "bjoern";
}
