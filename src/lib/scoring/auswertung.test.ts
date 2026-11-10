/**
 * Auswertung eines Spieltags: jede Regel aus REGELWERK.md (Abschnitte 2, 4, 5 und die
 * bestätigten Auslegungen 1–5) einzeln, dazu die Werte, die das Tool selbst ableitet.
 */
import { describe, expect, it } from "vitest";
import { assembleMatchday, teamConceded, type MatchdayRaw } from "./assemble";
import { leagueTopN, rankEntries } from "./league";
import { playerScore } from "./players";
import { thesisPoints } from "./theses";
import type { PlayerStats } from "./types";

const both = (outcome: boolean) => ({ outcome, confirmedBent: true, confirmedBjoern: true });
const pts = (piece: Parameters<typeof playerScore>[0]["piece"], stats: PlayerStats, extra: Partial<Parameters<typeof playerScore>[0]> = {}) =>
  playerScore({ piece, stats, knightCategory: "dauerfeuer", ...extra }).points;

describe("Thesen (Regelwerk 2)", () => {
  it("alle festen Felder, eingetroffen / nicht eingetroffen", () => {
    expect([thesisPoints("plus_minus_3", both(true), null), thesisPoints("plus_minus_3", both(false), null)]).toEqual([3, -3]);
    expect([thesisPoints("minus_plus_3", both(true), null), thesisPoints("minus_plus_3", both(false), null)]).toEqual([-3, 3]);
    expect([thesisPoints("plus_1", both(true), null), thesisPoints("plus_1", both(false), null)]).toEqual([1, 0]);
    expect([thesisPoints("minus_1", both(true), null), thesisPoints("minus_1", both(false), null)]).toEqual([-1, 0]);
  });
  it("?-Feld je nach gelostem Wert", () => {
    const f = (v: Parameters<typeof thesisPoints>[2]) => [thesisPoints("frage", both(true), v), thesisPoints("frage", both(false), v)];
    expect(f("plus_1")).toEqual([1, 0]);
    expect(f("plus_2")).toEqual([2, 0]);
    expect(f("plus_3")).toEqual([3, 0]);
    expect(f("minus_3")).toEqual([-3, 0]);
    expect(f("plus_minus_3")).toEqual([3, -3]);
  });
  it("zählt erst, wenn beide bestätigt haben", () => {
    expect(thesisPoints("plus_1", { outcome: true, confirmedBent: true, confirmedBjoern: false }, null)).toBeNull();
  });
});

describe("König", () => {
  it("1 Tor = 1, Doppelpack = 3 (+1), Dreierpack = 5 (+2 statt +1), 4 Tore = 6", () => {
    expect([0, 1, 2, 3, 4].map((goals) => pts("koenig", { goals }))).toEqual([0, 1, 3, 5, 6]);
  });
  it("Dreierpack: kein Doppelpack-Bonus zusätzlich", () => {
    const lines = playerScore({ piece: "koenig", stats: { goals: 3 } }).lines.map((l) => l.label);
    expect(lines).toContain("Dreierpack");
    expect(lines).not.toContain("Doppelpack");
  });
  it("ligaweit meiste Tore +1", () => {
    expect(pts("koenig", { goals: 2 }, { ranks: { goals: 1 } })).toBe(4);
  });
});

describe("Dame", () => {
  it("+1 pro Tor und Assist, +1 für Tor und Assist, +1 meiste Scorerpunkte", () => {
    expect(pts("dame", { goals: 1, assists: 2 }, { ranks: { scorerPoints: 1 } })).toBe(1 + 2 + 1 + 1);
    expect(pts("dame", { assists: 1 })).toBe(1);
  });
});

describe("Turm", () => {
  it("zu Null +1, Elfmeter +1, ab 5 Paraden +1, ab 8 +2, meiste verhinderte Tore +1", () => {
    expect(pts("turm", { goalsConcededOnPitch: 0, penaltiesSaved: 1, saves: 8 }, { ranks: { goalsPrevented: 1 } })).toBe(1 + 1 + 2 + 1);
    expect(pts("turm", { goalsConcededOnPitch: 1, saves: 5 })).toBe(1);
  });
  it("2 oder mehr Gegentore während er spielt: 0 Punkte, auch ohne Spieler der Woche", () => {
    expect(pts("turm", { goalsConcededOnPitch: 2, saves: 9, playerOfWeek: true }, { ranks: { goalsPrevented: 1 } })).toBe(0);
    expect(pts("turm", { goalsConcededOnPitch: 4, teamOfWeek: true })).toBe(0);
  });
});

describe("Läufer", () => {
  it("ab 11 km +1, ab 12 km +2, Laufleistung Platz 1/2/3 +3/+2/+1, meiste Sprints +1", () => {
    expect(pts("laeufer", { distanceKm: 10.9 })).toBe(0);
    expect(pts("laeufer", { distanceKm: 11 })).toBe(1);
    expect(pts("laeufer", { distanceKm: 12 }, { ranks: { distanceKm: 2, sprints: 1 } })).toBe(2 + 2 + 1);
  });
});

describe("Springer", () => {
  it("Kategorie +1 / +2 nach Schwelle, dazu Platz 1–3", () => {
    expect(pts("springer", { offensiveActions: 4 })).toBe(1);
    expect(pts("springer", { offensiveActions: 7 }, { ranks: { dauerfeuer: 1 } })).toBe(2 + 3);
  });
  it("Mindesteinsatzzeit verfehlt: verliert die Kategoriepunkte, behält den Bonus", () => {
    const rules = { springerMinMinutes: 45 };
    expect(pts("springer", { minutesPlayed: 30, offensiveActions: 9, teamOfWeek: true }, { rules, ranks: { dauerfeuer: 1 } })).toBe(2);
    expect(pts("springer", { minutesPlayed: 30, offensiveActions: 9, playerOfWeek: true }, { rules })).toBe(3);
  });
  it("ohne Mindestzeit (Festlegung 10.11.2026) wertet jeder Einsatz", () => {
    expect(pts("springer", { minutesPlayed: 5, offensiveActions: 4 }, { rules: { springerMinMinutes: 0 } })).toBe(1);
  });
});

describe("Team und Spieler der Woche", () => {
  it("Team der Woche +2, Spieler der Woche +3 (ersetzt die +2)", () => {
    expect(pts("koenig", { teamOfWeek: true })).toBe(2);
    expect(pts("koenig", { teamOfWeek: true, playerOfWeek: true })).toBe(3);
  });
});

describe("Bestätigte Auslegungen", () => {
  it("1: geteilter Platz bekommt beide Punkte, danach folgt Platz 3", () => {
    const r = rankEntries(
      [
        { name: "A", value: 13.1 },
        { name: "B", value: 13.1 },
        { name: "C", value: 12.8 },
        { name: "D", value: 12.5 },
      ],
      3,
    );
    expect(r.map((e) => [e.name, e.rank])).toEqual([
      ["A", 1],
      ["B", 1],
      ["C", 3],
    ]);
    expect([1, 1, 3].map((rank) => pts("laeufer", { distanceKm: 13.1 }, { ranks: { distanceKm: rank } }))).toEqual([5, 5, 3]);
  });
  it("4: ligaweiter Bonus nur bei einem Wert über 0", () => {
    expect(rankEntries([{ value: 0 }, { value: 0 }], 1)).toEqual([]);
    expect(rankEntries([{ value: 1 }, { value: 0 }], 1)).toEqual([{ value: 1, rank: 1 }]);
  });
  it("5: fehlende Minuten gelten als eingesetzt, 0 Minuten = 0 Punkte", () => {
    expect(pts("koenig", { goals: 1 })).toBe(1);
    expect(pts("koenig", { goals: 1, minutesPlayed: 0, playerOfWeek: true })).toBe(0);
  });
  it("Plätze pro Wert: Laufleistung und Springer 1–3, sonst nur Platz 1", () => {
    expect(["distance_km", "dauerfeuer", "sprints", "goals", "scorer_points", "goals_prevented"].map(leagueTopN)).toEqual([3, 3, 1, 1, 1, 1]);
  });
});

describe("Turm: Gegentore aus dem Ergebnis", () => {
  const matches = [
    { kickoff: "2026-11-07T14:30:00Z", originalKickoff: null, isFinished: true, homeClubId: 10, awayClubId: 20, homeGoals: 1, awayGoals: 3 },
    { kickoff: "2026-11-07T14:30:00Z", originalKickoff: null, isFinished: false, homeClubId: 30, awayClubId: 40, homeGoals: null, awayGoals: null },
  ];
  it("Gegentore des eigenen Vereins, auch auswärts; ohne Ergebnis null", () => {
    expect(teamConceded(matches, 10)).toBe(3);
    expect(teamConceded(matches, 20)).toBe(1);
    expect(teamConceded(matches, 30)).toBeNull();
    expect(teamConceded(matches, null)).toBeNull();
  });

  const base: MatchdayRaw = {
    matchdayId: 1,
    number: 9,
    questionValue: "plus_2",
    knightCategory: "dauerfeuer",
    thesisStarter: "bent",
    closedAt: null,
    rules: null,
    matches,
    thesesCount: 12,
    draftStarted: true,
    playerDraftStarted: true,
    thesisPicks: [],
    playerPicks: [
      { manager: "bent", piece: "turm", pickNo: 1, playerId: 1, clubId: 20 }, // 1 Gegentor
      { manager: "bjoern", piece: "turm", pickNo: 2, playerId: 2, clubId: 10 }, // 3 Gegentore
    ],
    stats: [
      { playerId: 1, statKey: "saves", value: 5, source: "manual" },
      { playerId: 2, statKey: "player_of_week", value: 1, source: "manual" },
    ],
    goals: [],
    leagueRanks: [],
  };
  it("ohne Eintrag zählt das Ergebnis, ab 2 Gegentoren 0 Punkte", () => {
    const r = assembleMatchday(base, new Date("2026-11-10T12:00:00Z"));
    expect(r.bent.players[0].stats.goalsConcededOnPitch).toBe(1);
    expect(r.bent.players[0].score.points).toBe(1); // 5 Paraden, kein zu Null
    expect(r.bjoern.players[0].score.points).toBe(0); // 3 Gegentore schlagen Spieler der Woche
  });
  it("Handeintrag (z. B. eingewechselt) geht vor", () => {
    const r = assembleMatchday(
      { ...base, stats: [...base.stats, { playerId: 2, statKey: "goals_conceded_on_pitch", value: 0, source: "manual" }] },
      new Date("2026-11-10T12:00:00Z"),
    );
    expect(r.bjoern.players[0].score.points).toBe(1 + 3); // zu Null + Spieler der Woche
  });
});

describe("Rechenbeispiel Spieltag 9 aus der Testanleitung", () => {
  // IDs: 1 Nicolas (BMG), 2 Backhaus (SCF), 3 Nmecha, 4 Burkardt, 5 Baumgartner, 6 Nkunku, 7 Raum, 8 Ogundu, 9 Muheim, 10 Rômulo
  const BMG = 100, SCF = 200;
  const manual = (playerId: number, statKey: string, value: number) => ({ playerId, statKey, value, source: "manual" });
  const goal = (playerId: number) => ({ playerId, scorerExternalId: String(playerId), scorerName: "x", isOwnGoal: false });
  const ranked = (statKey: string, entries: { playerId: number | null; value: number }[]) =>
    rankEntries(entries, leagueTopN(statKey)).map((e) => ({ statKey, rank: e.rank, playerId: e.playerId }));
  const tp = (manager: "bent" | "bjoern", field: Parameters<typeof thesisPoints>[0], outcome: boolean, pickNo: number) => ({
    manager, field, pickNo, thesisId: pickNo, text: "", outcome, confirmedBent: true, confirmedBjoern: true,
  });

  const raw: MatchdayRaw = {
    matchdayId: 9, number: 9, questionValue: "plus_2", knightCategory: "dauerfeuer", thesisStarter: "bent", closedAt: null, rules: null,
    matches: [
      { kickoff: "2026-11-07T14:30:00Z", originalKickoff: null, isFinished: true, homeClubId: 1, awayClubId: BMG, homeGoals: 3, awayGoals: 1 },
      { kickoff: "2026-11-07T14:30:00Z", originalKickoff: null, isFinished: true, homeClubId: SCF, awayClubId: 2, homeGoals: 2, awayGoals: 0 },
    ],
    thesesCount: 12, draftStarted: true, playerDraftStarted: true,
    thesisPicks: [
      tp("bent", "plus_minus_3", true, 1), tp("bjoern", "plus_minus_3", false, 2), tp("bjoern", "minus_plus_3", false, 3),
      tp("bent", "minus_plus_3", true, 4), tp("bent", "plus_1", false, 5), tp("bjoern", "plus_1", true, 6),
      tp("bjoern", "minus_1", true, 7), tp("bent", "minus_1", false, 8), tp("bent", "frage", true, 9), tp("bjoern", "frage", false, 10),
    ],
    playerPicks: [
      { manager: "bjoern", piece: "turm", pickNo: 1, playerId: 1, clubId: BMG },
      { manager: "bent", piece: "turm", pickNo: 2, playerId: 2, clubId: SCF },
      { manager: "bent", piece: "koenig", pickNo: 3, playerId: 3 },
      { manager: "bjoern", piece: "koenig", pickNo: 4, playerId: 4 },
      { manager: "bjoern", piece: "dame", pickNo: 5, playerId: 5 },
      { manager: "bent", piece: "dame", pickNo: 6, playerId: 6 },
      { manager: "bent", piece: "laeufer", pickNo: 7, playerId: 7 },
      { manager: "bjoern", piece: "laeufer", pickNo: 8, playerId: 8 },
      { manager: "bjoern", piece: "springer", pickNo: 9, playerId: 9 },
      { manager: "bent", piece: "springer", pickNo: 10, playerId: 10 },
    ],
    stats: [
      // automatisch (OpenLigaDB)
      { playerId: 3, statKey: "goals", value: 2, source: "openligadb" },
      { playerId: 4, statKey: "goals", value: 2, source: "openligadb" },
      { playerId: 5, statKey: "goals", value: 1, source: "openligadb" },
      { playerId: 6, statKey: "goals", value: 1, source: "openligadb" },
      // per Hand laut Anleitung
      manual(2, "saves", 6),
      manual(7, "distance_km", 12.3),
      manual(10, "minutes_played", 20), manual(10, "offensive_actions", 5),
      manual(6, "assists", 1),
      manual(3, "team_of_week", 1), manual(3, "player_of_week", 1),
      manual(1, "team_of_week", 1),
      manual(8, "distance_km", 11.2),
      manual(9, "minutes_played", 0), manual(9, "offensive_actions", 8),
      manual(5, "team_of_week", 1),
    ],
    goals: [goal(3), goal(3), goal(4), goal(4), goal(5), goal(6)],
    leagueRanks: [
      ...ranked("scorer_points", [{ playerId: null, value: 4 }]),
      ...ranked("goals_prevented", [{ playerId: null, value: 1.8 }]),
      ...ranked("distance_km", [{ playerId: 7, value: 12.3 }, { playerId: null, value: 12.3 }, { playerId: 8, value: 11.2 }]),
      ...ranked("sprints", [{ playerId: 8, value: 38 }]),
      ...ranked("dauerfeuer", [{ playerId: null, value: 9 }, { playerId: null, value: 7 }, { playerId: 10, value: 5 }]),
    ],
  };
  const r = assembleMatchday(raw, new Date("2026-11-10T12:00:00Z"));
  const by = (m: "bent" | "bjoern") => Object.fromEntries(r[m].players.map((p) => [p.piece, p.score.points]));

  it("Bent: Spieler 19, Thesen 2, gesamt 21", () => {
    expect(by("bent")).toEqual({ turm: 2, koenig: 7, dame: 3, laeufer: 5, springer: 2 });
    expect(r.bent.theses.map((t) => t.points)).toEqual([3, -3, 0, 0, 2]);
    expect([r.bent.playerPoints, r.bent.thesisPoints, r.bent.total]).toEqual([19, 2, 21]);
  });
  it("Björn: Spieler 10, Thesen 0, gesamt 10", () => {
    expect(by("bjoern")).toEqual({ turm: 0, koenig: 4, dame: 3, laeufer: 3, springer: 0 });
    expect(r.bjoern.theses.map((t) => t.points)).toEqual([-3, 3, 1, -1, 0]);
    expect([r.bjoern.playerPoints, r.bjoern.thesisPoints, r.bjoern.total]).toEqual([10, 0, 10]);
  });
  it("alle ligaweiten Werte eingetragen, Sieger Bent", () => {
    expect(r.missingLeagueStats).toEqual([]);
    expect(r.status).toBe("auswertung");
    expect(r.winner).toBe("bent");
  });
});
