import { describe, expect, it } from "vitest";
import {
  isThesisScored,
  leagueRanks,
  managerMatchdayScore,
  matchdayWinner,
  playerScore,
  podiumPoints,
  thesisPoints,
  type KnightCategory,
  type PlayerStats,
  type QuestionValue,
  type ThesisField,
} from "./index";

const confirmed = (outcome: boolean) => ({ outcome, confirmedBent: true, confirmedBjoern: true });
const pts = (piece: Parameters<typeof playerScore>[0]["piece"], stats: PlayerStats, extra = {}) =>
  playerScore({ piece, stats, ...extra }).points;

// ---------------------------------------------------------------------------
describe("Thesenfelder", () => {
  const cases: [ThesisField, number, number][] = [
    ["plus_minus_3", 3, -3],
    ["minus_plus_3", -3, 3],
    ["plus_1", 1, 0],
    ["minus_1", -1, 0],
  ];
  it.each(cases)("%s: eingetroffen %i, nicht eingetroffen %i", (field, hit, miss) => {
    expect(thesisPoints(field, confirmed(true), null)).toBe(hit);
    expect(thesisPoints(field, confirmed(false), null)).toBe(miss);
  });

  const question: [QuestionValue, number, number][] = [
    ["plus_1", 1, 0],
    ["plus_2", 2, 0],
    ["plus_3", 3, 0],
    ["minus_3", -3, 0],
    ["plus_minus_3", 3, -3],
  ];
  it.each(question)("?-Feld gelost %s: eingetroffen %i, nicht eingetroffen %i", (value, hit, miss) => {
    expect(thesisPoints("frage", confirmed(true), value)).toBe(hit);
    expect(thesisPoints("frage", confirmed(false), value)).toBe(miss);
  });

  it("?-Feld ohne gelosten Wert ist ein Fehler", () => {
    expect(() => thesisPoints("frage", confirmed(true), null)).toThrow();
  });

  it("zählt erst, wenn beide bestätigt haben", () => {
    expect(thesisPoints("plus_minus_3", { outcome: true, confirmedBent: true, confirmedBjoern: false }, null)).toBeNull();
    expect(thesisPoints("plus_minus_3", { outcome: true, confirmedBent: false, confirmedBjoern: true }, null)).toBeNull();
    expect(thesisPoints("plus_minus_3", { outcome: null, confirmedBent: true, confirmedBjoern: true }, null)).toBeNull();
    expect(isThesisScored(confirmed(false))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("König", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 3], // Doppelpack
    [3, 5], // Dreierpack, Doppelpack entfällt
    [4, 6],
    [5, 7],
  ])("%i Tore = %i Punkte", (goals, expected) => {
    expect(pts("koenig", { goals })).toBe(expected);
  });

  it("ligaweit meiste Tore +1", () => {
    expect(pts("koenig", { goals: 2 }, { ranks: { goals: 1 } })).toBe(4);
    expect(pts("koenig", { goals: 2 }, { ranks: { goals: 2 } })).toBe(3);
  });
});

describe("Dame", () => {
  it("+1 pro Tor und Assist", () => {
    expect(pts("dame", { goals: 1 })).toBe(1);
    expect(pts("dame", { assists: 2 })).toBe(2);
  });
  it("+1 extra für Tor und Assist im selben Spiel", () => {
    expect(pts("dame", { goals: 1, assists: 1 })).toBe(3);
    expect(pts("dame", { goals: 2, assists: 1 })).toBe(4);
  });
  it("ligaweit meiste Scorerpunkte +1", () => {
    expect(pts("dame", { goals: 1, assists: 1 }, { ranks: { scorerPoints: 1 } })).toBe(4);
  });
  it("kein Doppelpack-Bonus für die Dame", () => {
    expect(pts("dame", { goals: 2 })).toBe(2);
  });
});

describe("Turm", () => {
  it("zu Null +1", () => {
    expect(pts("turm", { goalsConcededOnPitch: 0 })).toBe(1);
  });
  it("fehlende Gegentore sind nicht zu Null", () => {
    expect(pts("turm", {})).toBe(0);
  });
  it("Paraden: ab 5 +1, ab 8 +2", () => {
    expect(pts("turm", { goalsConcededOnPitch: 1, saves: 4 })).toBe(0);
    expect(pts("turm", { goalsConcededOnPitch: 1, saves: 5 })).toBe(1);
    expect(pts("turm", { goalsConcededOnPitch: 1, saves: 7 })).toBe(1);
    expect(pts("turm", { goalsConcededOnPitch: 1, saves: 8 })).toBe(2);
  });
  it("+1 pro gehaltenem Elfmeter", () => {
    expect(pts("turm", { goalsConcededOnPitch: 1, penaltiesSaved: 2 })).toBe(2);
  });
  it("ligaweit meiste verhinderte Tore +1", () => {
    expect(pts("turm", { goalsConcededOnPitch: 1 }, { ranks: { goalsPrevented: 1 } })).toBe(1);
  });
  it("alles zusammen", () => {
    expect(
      pts("turm", { goalsConcededOnPitch: 0, saves: 9, penaltiesSaved: 1 }, { ranks: { goalsPrevented: 1 } }),
    ).toBe(5);
  });
  it("2 Gegentore: 0 Punkte, auch ohne Bonus für Spieler der Woche", () => {
    expect(
      playerScore({
        piece: "turm",
        stats: { goalsConcededOnPitch: 2, saves: 10, penaltiesSaved: 1, playerOfWeek: true, teamOfWeek: true },
        ranks: { goalsPrevented: 1 },
      }),
    ).toEqual({ points: 0, lines: [{ label: "2 Gegentore", points: 0 }] });
    expect(pts("turm", { goalsConcededOnPitch: 4, teamOfWeek: true })).toBe(0);
  });
  it("1 Gegentor: Bonus bleibt", () => {
    expect(pts("turm", { goalsConcededOnPitch: 1, saves: 5, teamOfWeek: true })).toBe(3);
  });
});

describe("Läufer", () => {
  it.each([
    [10.9, 0],
    [11, 1],
    [11.9, 1],
    [12, 2],
    [13.4, 2],
  ])("%f km = %i Punkte", (distanceKm, expected) => {
    expect(pts("laeufer", { distanceKm })).toBe(expected);
  });
  it("ligaweite Laufleistung Platz 1/2/3 = +3/+2/+1", () => {
    expect(pts("laeufer", { distanceKm: 12.5 }, { ranks: { distanceKm: 1 } })).toBe(5);
    expect(pts("laeufer", { distanceKm: 12.5 }, { ranks: { distanceKm: 2 } })).toBe(4);
    expect(pts("laeufer", { distanceKm: 12.5 }, { ranks: { distanceKm: 3 } })).toBe(3);
  });
  it("ligaweit meiste Sprints +1", () => {
    expect(pts("laeufer", { distanceKm: 10 }, { ranks: { sprints: 1 } })).toBe(1);
    expect(pts("laeufer", { distanceKm: 10 }, { ranks: { sprints: 2 } })).toBe(0);
  });
});

describe("Springer", () => {
  const cases: [KnightCategory, keyof PlayerStats, number, number, number][] = [
    // Kategorie, Messwert, knapp darunter, +1 ab, +2 ab
    ["zweikaempfer", "duelsWon", 9, 10, 17],
    ["tuersteher", "defensiveActions", 12, 13, 18],
    ["dauerfeuer", "offensiveActions", 3, 4, 7],
    ["bollwerk", "duelSuccessPct", 69.9, 70, 85],
    ["laser", "passAccuracyPct", 91.9, 92, 97],
    ["ballmagnet", "touches", 74, 75, 110],
    ["raumdeuter", "progressiveDistanceM", 69, 70, 150],
    ["alleingang", "longestSoloRunM", 19, 20, 35],
    ["gefahrensucher", "expectedGoals", 0.29, 0.3, 0.9],
    ["schallmauer", "topSpeedKmh", 33.4, 33.5, 35.0],
  ];
  it.each(cases)("%s (%s): darunter 0, ab %f +1, ab %f +2", (cat, stat, below, one, two) => {
    const s = (v: number) => pts("springer", { [stat]: v }, { knightCategory: cat });
    expect(s(below)).toBe(0);
    expect(s(one)).toBe(1);
    expect(s(two)).toBe(2);
  });
  it("ligaweit Platz 1/2/3 = +3/+2/+1", () => {
    expect(pts("springer", { duelsWon: 18 }, { knightCategory: "zweikaempfer", ranks: { zweikaempfer: 1 } })).toBe(5);
    expect(pts("springer", { duelsWon: 18 }, { knightCategory: "zweikaempfer", ranks: { zweikaempfer: 3 } })).toBe(3);
  });
  it("Platz in einer anderen Kategorie zählt nicht", () => {
    expect(pts("springer", { duelsWon: 18 }, { knightCategory: "zweikaempfer", ranks: { laser: 1 } })).toBe(2);
  });
  it("Mindesteinsatzzeit verfehlt: Kategorie wertet nicht, Bonus bleibt", () => {
    const rules = { springerMinMinutes: 30 };
    expect(pts("springer", { minutesPlayed: 20, duelsWon: 18 }, { knightCategory: "zweikaempfer", rules })).toBe(0);
    expect(
      pts("springer", { minutesPlayed: 20, duelsWon: 18, teamOfWeek: true }, { knightCategory: "zweikaempfer", rules }),
    ).toBe(2);
    expect(pts("springer", { minutesPlayed: 30, duelsWon: 18 }, { knightCategory: "zweikaempfer", rules })).toBe(2);
  });
  it("ohne geloste Kategorie ist ein Fehler", () => {
    expect(() => playerScore({ piece: "springer", stats: {} })).toThrow();
  });
});

// ---------------------------------------------------------------------------
describe("Team und Spieler der Woche", () => {
  it("Team der Woche +2", () => {
    expect(pts("koenig", { goals: 1, teamOfWeek: true })).toBe(3);
  });
  it("Spieler der Woche +3 ersetzt die +2", () => {
    expect(pts("koenig", { goals: 1, teamOfWeek: true, playerOfWeek: true })).toBe(4);
    expect(pts("koenig", { goals: 1, playerOfWeek: true })).toBe(4);
  });
  it("gilt für alle Figuren", () => {
    expect(pts("dame", { teamOfWeek: true })).toBe(2);
    expect(pts("laeufer", { teamOfWeek: true })).toBe(2);
    expect(pts("springer", { teamOfWeek: true }, { knightCategory: "laser" })).toBe(2);
    expect(pts("turm", { goalsConcededOnPitch: 1, playerOfWeek: true })).toBe(3);
  });
  it("keine Obergrenze pro Spieler", () => {
    // 4 Tore (6) + ligaweit meiste (1) + Spieler der Woche (3)
    expect(pts("koenig", { goals: 4, playerOfWeek: true }, { ranks: { goals: 1 } })).toBe(10);
  });
});

describe("Nicht eingesetzt", () => {
  it("0 Minuten = 0 Punkte, egal was sonst eingetragen ist", () => {
    expect(pts("koenig", { minutesPlayed: 0, goals: 2, teamOfWeek: true })).toBe(0);
    expect(pts("turm", { minutesPlayed: 0, goalsConcededOnPitch: 0 })).toBe(0);
  });
  it("fehlende Minuten gelten als eingesetzt", () => {
    expect(pts("koenig", { goals: 1 })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe("Ligaweite Platzierungen", () => {
  it("vergibt Platz 1 bis 3", () => {
    const r = leagueRanks([
      { id: "a", value: 13.1 },
      { id: "b", value: 12.4 },
      { id: "c", value: 12.9 },
      { id: "d", value: 11.0 },
    ]);
    expect([...r]).toEqual([
      ["a", 1],
      ["c", 2],
      ["b", 3],
    ]);
  });
  it("geteilter Platz: alle bekommen ihn, danach geht es mit dem übernächsten weiter", () => {
    const r = leagueRanks([
      { id: "a", value: 3 },
      { id: "b", value: 3 },
      { id: "c", value: 2 },
      { id: "d", value: 1 },
    ]);
    expect(r.get("a")).toBe(1);
    expect(r.get("b")).toBe(1);
    expect(r.get("c")).toBe(3);
    expect(r.has("d")).toBe(false);
  });
  it("mehrere teilen sich Platz 3: alle bekommen ihn", () => {
    const r = leagueRanks([
      { id: "a", value: 5 },
      { id: "b", value: 4 },
      { id: "c", value: 3 },
      { id: "d", value: 3 },
    ]);
    expect(r.get("c")).toBe(3);
    expect(r.get("d")).toBe(3);
  });
  it("0 oder fehlende Werte bekommen keinen Platz", () => {
    const r = leagueRanks([
      { id: "a", value: 0 },
      { id: "b", value: null },
    ]);
    expect(r.size).toBe(0);
  });
  it("nur Platz 1 (König: meiste Tore)", () => {
    const r = leagueRanks(
      [
        { id: "a", value: 3 },
        { id: "b", value: 2 },
      ],
      1,
    );
    expect([...r]).toEqual([["a", 1]]);
  });
  it("Podiumspunkte", () => {
    expect([1, 2, 3, 4, undefined].map(podiumPoints)).toEqual([3, 2, 1, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
describe("Spieltag gesamt", () => {
  it("Thesenpunkte + Spielerpunkte, offene Thesen zählen vorerst 0", () => {
    const s = managerMatchdayScore({
      questionValue: "plus_minus_3",
      theses: [
        { field: "plus_minus_3", resolution: confirmed(true) }, // +3
        { field: "minus_plus_3", resolution: confirmed(false) }, // +3
        { field: "plus_1", resolution: confirmed(true) }, // +1
        { field: "minus_1", resolution: confirmed(true) }, // −1
        { field: "frage", resolution: { outcome: false, confirmedBent: true, confirmedBjoern: false } }, // offen
      ],
      players: [
        { piece: "koenig", stats: { goals: 2 } }, // 3
        { piece: "dame", stats: { goals: 1, assists: 1 } }, // 3
        { piece: "turm", stats: { goalsConcededOnPitch: 2, saves: 9 } }, // 0
        { piece: "laeufer", stats: { distanceKm: 12.1 } }, // 2
        { piece: "springer", stats: { offensiveActions: 5 }, knightCategory: "dauerfeuer" }, // 1
      ],
    });
    expect(s.thesisPoints).toBe(6);
    expect(s.playerPoints).toBe(9);
    expect(s.total).toBe(15);
    expect(s.openTheses).toBe(1);
  });
  it("Spieltagssieger", () => {
    expect(matchdayWinner(10, 7)).toBe("bent");
    expect(matchdayWinner(3, 8)).toBe("bjoern");
    expect(matchdayWinner(5, 5)).toBeNull();
  });
});
