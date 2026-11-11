import { describe, expect, it } from "vitest";
import type { ManagerResult, MatchdayResult, PlayerResult, ThesisResult } from "@/lib/scoring/assemble";
import type { Piece, ThesisField } from "@/lib/scoring/types";
import { formatRate, seasonStats, thesisRight } from "./season-stats";

const NOW = new Date("2026-11-10T12:00:00Z");
const th = (field: ThesisField, outcome: boolean, points: number | null): ThesisResult => ({
  field, pickNo: 1, thesisId: 1, text: "", outcome, confirmedBent: true, confirmedBjoern: points !== null, sharedBent: false, sharedBjoern: false, points,
});
const pl = (piece: Piece, playerId: number, points: number): PlayerResult => ({
  piece, pickNo: 1, playerId, stats: {}, ranks: {}, score: { points, lines: points ? [{ label: "x", points }] : [] },
});
const mgr = (theses: ThesisResult[], players: PlayerResult[]): ManagerResult => {
  const thesisPoints = theses.reduce((s, t) => s + (t.points ?? 0), 0);
  const playerPoints = players.reduce((s, p) => s + p.score.points, 0);
  return { thesisPoints, playerPoints, total: thesisPoints + playerPoints, openTheses: 0, theses, players };
};
const md = (number: number, status: MatchdayResult["status"], bent: ManagerResult, bjoern: ManagerResult, deadline = "2026-11-01T14:30:00Z"): MatchdayResult => ({
  matchdayId: number, number, status, deadline, bent, bjoern, questionValue: "minus_3",
  winner: status === "abgeschlossen" && bent.total !== bjoern.total ? (bent.total > bjoern.total ? "bent" : "bjoern") : null,
  missingLeagueStats: [], unassignedScorers: 0, turn: null, turnPicks: 0,
  played: bent.theses.length + bent.players.length + bjoern.theses.length + bjoern.players.length > 0,
  progress: { prep: 4, thesisPicks: 10, playerPicks: 10 },
});
const empty = mgr([], []);

const results = [
  md(1, "abgeschlossen", empty, empty), // vor Start
  md(10, "abgeschlossen", mgr([th("plus_minus_3", true, 3), th("minus_1", false, 0)], [pl("koenig", 7, 5), pl("turm", 8, 0)]), mgr([th("plus_minus_3", false, -3)], [pl("koenig", 9, 6)])),
  md(11, "abgeschlossen", mgr([th("frage", false, 0)], [pl("koenig", 7, 2)]), mgr([th("minus_plus_3", false, 3)], [pl("dame", 7, 2)])),
  md(12, "abgeschlossen", mgr([], [pl("laeufer", 4, 3)]), mgr([], [pl("laeufer", 5, 3)])), // Unentschieden
  md(13, "laeuft", mgr([], [pl("koenig", 7, 9)]), mgr([], [pl("turm", 8, 1)])), // vorläufig
  md(14, "vorbereitung", empty, empty, "2026-11-20T19:30:00Z"),
  md(15, "vorbereitung", empty, empty, "2026-11-27T19:30:00Z"),
];
const s = seasonStats(results, NOW);

describe("Saisonstatistik", () => {
  it("nur abgeschlossene, gespielte Spieltage zählen", () => {
    expect(s.closedCount).toBe(3);
    expect(s.totals).toEqual({ bent: 3 + 5 + 2 + 3, bjoern: -3 + 6 + 3 + 2 + 3 });
    expect(s.average.bent).toBeCloseTo(13 / 3);
  });
  it("Siege und Unentschieden", () => {
    // ST 10 Bent 8:3, ST 11 Björn 5:2, ST 12 3:3
    expect(s.wins).toEqual({ bent: 1, bjoern: 1 });
    expect(s.draws).toBe(1);
  });
  it("Verlauf: abgeschlossene plus laufender als vorläufig, ohne vor Start", () => {
    expect(s.perMatchday.map((m) => [m.number, m.bent, m.bjoern, m.provisional])).toEqual([
      [10, 8, 3, false],
      [11, 2, 5, false],
      [12, 3, 3, false],
      [13, 9, 1, true],
    ]);
  });
  it("Punkte nach Feld und Figur", () => {
    expect(s.byThesisField.plus_minus_3).toEqual({ bent: 3, bjoern: -3 });
    expect(s.byThesisField.minus_plus_3).toEqual({ bent: 0, bjoern: 3 });
    expect(s.byPiece.koenig).toEqual({ bent: 7, bjoern: 6 }); // ST 13 zählt nicht
    expect(s.thesisTotal).toEqual({ bent: 3, bjoern: 0 });
  });
  it("beste Einzelleistungen absteigend, laufender Spieltag nicht dabei", () => {
    expect(s.performances.slice(0, 3).map((p) => [p.number, p.manager, p.piece, p.points])).toEqual([
      [10, "bjoern", "koenig", 6],
      [10, "bent", "koenig", 5],
      [12, "bent", "laeufer", 3],
    ]);
    expect(s.performances.some((p) => p.number === 13)).toBe(false);
  });
  it("gedraftete Spieler: Einsätze pro Person inkl. laufendem Spieltag (3er-Limit)", () => {
    const p7 = s.drafted.find((d) => d.playerId === 7)!;
    expect(p7.picks).toEqual({ bent: 3, bjoern: 1 });
    expect(p7.total).toBe(4);
    expect(p7.points).toEqual({ bent: 7, bjoern: 2 });
    expect(s.drafted[0].playerId).toBe(7);
  });
  it("noch zu spielen und nächste Deadline", () => {
    expect(s.remaining).toBe(2);
    expect(s.nextDeadline).toBe("2026-11-20T19:30:00Z");
  });
  it("Führung", () => {
    expect([s.leader, s.lead]).toEqual(["bent", 2]);
  });
});

describe("Thesen-Trefferquote: richtig gelegen", () => {
  it("wahrscheinliche Felder: eingetroffen ist richtig", () => {
    expect(thesisRight("plus_minus_3", true, null)).toBe(true);
    expect(thesisRight("plus_1", false, null)).toBe(false);
  });
  it("unwahrscheinliche Felder: nicht eingetroffen ist richtig", () => {
    expect(thesisRight("minus_plus_3", false, null)).toBe(true);
    expect(thesisRight("minus_1", true, null)).toBe(false);
  });
  it("?-Feld je nach gelostem Wert", () => {
    expect(thesisRight("frage", true, "plus_2")).toBe(true);
    expect(thesisRight("frage", false, "minus_3")).toBe(true);
    expect(thesisRight("frage", true, "minus_3")).toBe(false);
    expect(thesisRight("frage", true, "plus_minus_3")).toBe(true);
  });
  it("Quote pro Person und Feld, nur bestätigte Thesen", () => {
    // Bent: +/−3 eingetroffen (richtig), −1 nicht eingetroffen (richtig), ?-Feld −3 nicht eingetroffen (richtig)
    expect(s.hitRate.overall.bent).toEqual({ right: 3, total: 3 });
    // Björn: +/−3 nicht eingetroffen (falsch), −/+3 nicht eingetroffen (richtig)
    expect(s.hitRate.overall.bjoern).toEqual({ right: 1, total: 2 });
    expect(s.hitRate.byField.plus_minus_3.bjoern).toEqual({ right: 0, total: 1 });
    expect(formatRate(s.hitRate.overall.bjoern)).toBe("1 von 2 (50 %)");
    expect(formatRate({ right: 0, total: 0 })).toBe("–");
  });
});
