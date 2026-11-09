import { describe, expect, it } from "vitest";
import {
  assembleMatchday,
  computeLeagueRanks,
  deadlineOf,
  matchdayStatus,
  seasonStandings,
  toPlayerStats,
  type MatchdayRaw,
  type RawThesisPick,
} from "./assemble";

const NOW = new Date("2026-11-10T12:00:00Z");
const PAST = "2026-11-07T14:30:00Z";
const FUTURE = "2026-11-20T19:30:00Z";

function raw(overrides: Partial<MatchdayRaw> = {}): MatchdayRaw {
  return {
    matchdayId: 1,
    number: 9,
    questionValue: "plus_2",
    knightCategory: "dauerfeuer",
    thesisStarter: "bent",
    closedAt: null,
    rules: null,
    matches: [{ kickoff: PAST, originalKickoff: PAST, isFinished: true }],
    thesesCount: 12,
    thesisPicks: [],
    playerPicks: [],
    stats: [],
    goals: [],
    leagueRanks: [],
    ...overrides,
  };
}

const tp = (manager: "bent" | "bjoern", field: RawThesisPick["field"], outcome: boolean | null, pickNo: number, both = true): RawThesisPick => ({
  manager,
  field,
  pickNo,
  thesisId: pickNo,
  text: `These ${pickNo}`,
  outcome,
  confirmedBent: both,
  confirmedBjoern: both,
});

describe("Messwerte umwandeln", () => {
  it("stat_values-Schlüssel → PlayerStats, Team der Woche als Ja/Nein", () => {
    expect(
      toPlayerStats([
        { playerId: 1, statKey: "distance_km", value: 12.3, source: "manual" },
        { playerId: 1, statKey: "team_of_week", value: 1, source: "manual" },
        { playerId: 1, statKey: "player_of_week", value: 0, source: "manual" },
        { playerId: 1, statKey: "unbekannt", value: 5, source: "manual" },
      ]),
    ).toEqual({ distanceKm: 12.3, teamOfWeek: true, playerOfWeek: false });
  });
});

describe("Deadline und Status", () => {
  it("Deadline ist der früheste ursprüngliche Anstoß", () => {
    expect(
      deadlineOf([
        { kickoff: "2026-11-21T14:30:00Z", originalKickoff: "2026-11-21T14:30:00Z", isFinished: false },
        // verlegt vom Freitag auf Dezember: Freitag bleibt Deadline
        { kickoff: "2026-12-10T19:30:00Z", originalKickoff: "2026-11-20T19:30:00Z", isFinished: false },
      ]),
    ).toBe("2026-11-20T19:30:00.000Z");
    expect(deadlineOf([])).toBeNull();
  });

  const future = { matches: [{ kickoff: FUTURE, originalKickoff: FUTURE, isFinished: false }] };
  it("vorbereitung, solange Thesen, Räder oder Startspieler fehlen", () => {
    expect(matchdayStatus(raw({ ...future, thesesCount: 11 }), NOW)).toBe("vorbereitung");
    expect(matchdayStatus(raw({ ...future, knightCategory: null }), NOW)).toBe("vorbereitung");
    expect(matchdayStatus(raw({ ...future, thesisStarter: null }), NOW)).toBe("vorbereitung");
  });
  it("thesen_draft → spieler_draft", () => {
    expect(matchdayStatus(raw(future), NOW)).toBe("thesen_draft");
    const tps = Array.from({ length: 10 }, (_, i) => tp("bent", "plus_1", null, i + 1));
    expect(matchdayStatus(raw({ ...future, thesisPicks: tps }), NOW)).toBe("spieler_draft");
  });
  it("läuft nach der Deadline, bis alle Spiele (auch Nachholspiele) beendet sind", () => {
    const matches = [
      { kickoff: PAST, originalKickoff: PAST, isFinished: true },
      { kickoff: FUTURE, originalKickoff: PAST, isFinished: false }, // Nachholspiel
    ];
    expect(matchdayStatus(raw({ matches }), NOW)).toBe("laeuft");
    expect(matchdayStatus(raw(), NOW)).toBe("auswertung");
    expect(matchdayStatus(raw({ closedAt: PAST }), NOW)).toBe("abgeschlossen");
  });
});

describe("Ligaweite Plätze", () => {
  it("meiste Tore automatisch aus allen Toren, Eigentore zählen nicht", () => {
    const ranks = computeLeagueRanks(
      raw({
        goals: [
          { playerId: 1, scorerExternalId: "a", scorerName: "A", isOwnGoal: false },
          { playerId: 1, scorerExternalId: "a", scorerName: "A", isOwnGoal: false },
          { playerId: 2, scorerExternalId: "b", scorerName: "B", isOwnGoal: false },
          { playerId: 2, scorerExternalId: "b", scorerName: "B", isOwnGoal: true },
          { playerId: 2, scorerExternalId: "b", scorerName: "B", isOwnGoal: true },
        ],
      }),
    );
    expect(ranks.get(1)).toEqual({ goals: 1 });
    expect(ranks.get(2)).toBeUndefined();
  });

  it("nicht zugeordnete Torschützen zählen im Ligavergleich mit", () => {
    const ranks = computeLeagueRanks(
      raw({
        goals: [
          { playerId: 1, scorerExternalId: "a", scorerName: "A", isOwnGoal: false },
          { playerId: null, scorerExternalId: "x", scorerName: "X", isOwnGoal: false },
          { playerId: null, scorerExternalId: "x", scorerName: "X", isOwnGoal: false },
        ],
      }),
    );
    expect(ranks.get(1)).toBeUndefined();
  });

  it("geteilte meiste Tore: beide bekommen den Bonus", () => {
    const ranks = computeLeagueRanks(
      raw({
        goals: [
          { playerId: 1, scorerExternalId: "a", scorerName: "A", isOwnGoal: false },
          { playerId: 2, scorerExternalId: "b", scorerName: "B", isOwnGoal: false },
        ],
      }),
    );
    expect(ranks.get(1)).toEqual({ goals: 1 });
    expect(ranks.get(2)).toEqual({ goals: 1 });
  });

  it("Handkorrektur der Tore eines Spielers geht vor", () => {
    const ranks = computeLeagueRanks(
      raw({
        goals: [
          { playerId: 1, scorerExternalId: "a", scorerName: "A", isOwnGoal: false },
          { playerId: 1, scorerExternalId: "a", scorerName: "A", isOwnGoal: false },
          { playerId: 2, scorerExternalId: "b", scorerName: "B", isOwnGoal: false },
        ],
        stats: [{ playerId: 2, statKey: "goals", value: 3, source: "manual" }],
      }),
    );
    expect(ranks.get(2)).toEqual({ goals: 1 });
    expect(ranks.get(1)).toBeUndefined();
  });

  it("Einträge in league_ranks: andere Werte und Vorrang vor der Automatik", () => {
    const ranks = computeLeagueRanks(
      raw({
        goals: [{ playerId: 1, scorerExternalId: "a", scorerName: "A", isOwnGoal: false }],
        leagueRanks: [
          { statKey: "distance_km", rank: 2, playerId: 5 },
          { statKey: "dauerfeuer", rank: 1, playerId: 5 },
          { statKey: "goals", rank: 1, playerId: 9 },
          { statKey: "sprints", rank: 1, playerId: null },
        ],
      }),
    );
    expect(ranks.get(5)).toEqual({ distanceKm: 2, dauerfeuer: 1 });
    expect(ranks.get(9)).toEqual({ goals: 1 });
    expect(ranks.get(1)).toBeUndefined();
  });
});

describe("Spieltag zusammensetzen", () => {
  const full = raw({
    thesisPicks: [
      tp("bent", "plus_minus_3", true, 1), // +3
      tp("bjoern", "minus_plus_3", false, 2), // +3
      tp("bjoern", "frage", true, 3), // ?-Feld +2
      tp("bent", "minus_1", true, 4), // −1
      tp("bent", "plus_1", true, 5, false), // offen
    ],
    playerPicks: [
      { manager: "bent", piece: "koenig", pickNo: 1, playerId: 1 },
      { manager: "bjoern", piece: "turm", pickNo: 2, playerId: 2 },
      { manager: "bjoern", piece: "springer", pickNo: 3, playerId: 3 },
      { manager: "bent", piece: "laeufer", pickNo: 4, playerId: 4 },
    ],
    goals: [
      { playerId: 1, scorerExternalId: "a", scorerName: "A", isOwnGoal: false },
      { playerId: 1, scorerExternalId: "a", scorerName: "A", isOwnGoal: false },
      { playerId: null, scorerExternalId: "x", scorerName: "X", isOwnGoal: false },
    ],
    stats: [
      { playerId: 1, statKey: "goals", value: 2, source: "openligadb" },
      { playerId: 2, statKey: "goals_conceded_on_pitch", value: 0, source: "manual" },
      { playerId: 2, statKey: "saves", value: 6, source: "manual" },
      { playerId: 3, statKey: "offensive_actions", value: 8, source: "manual" },
      { playerId: 3, statKey: "team_of_week", value: 1, source: "manual" },
      { playerId: 4, statKey: "distance_km", value: 12.4, source: "manual" },
    ],
    leagueRanks: [{ statKey: "distance_km", rank: 1, playerId: 4 }],
  });
  const r = assembleMatchday(full, NOW);

  it("Thesen: Punkte, offene Thesen zählen 0", () => {
    expect(r.bent.thesisPoints).toBe(2);
    expect(r.bent.openTheses).toBe(1);
    expect(r.bent.theses.map((t) => t.points)).toEqual([3, -1, null]);
    expect(r.bjoern.thesisPoints).toBe(5);
  });

  it("Spieler: Punkte inkl. Ligaboni", () => {
    // König 2 Tore = 3, + meiste Tore = 4
    expect(r.bent.players[0].score.points).toBe(4);
    // Läufer 12,4 km = 2, Platz 1 = +3
    expect(r.bent.players[1].score.points).toBe(5);
    // Turm zu Null 1 + 6 Paraden 1
    expect(r.bjoern.players[0].score.points).toBe(2);
    // Springer Dauerfeuer 8 = 2, Team der Woche 2
    expect(r.bjoern.players[1].score.points).toBe(4);
  });

  it("Summen, Sieger und Hinweise", () => {
    expect(r.bent.total).toBe(11);
    expect(r.bjoern.total).toBe(11);
    expect(r.winner).toBeNull();
    expect(r.status).toBe("auswertung");
    // Läufer braucht noch Sprints, Turm verhinderte Tore, Springer Dauerfeuer-Plätze
    expect(r.missingLeagueStats.sort()).toEqual(["dauerfeuer", "goals_prevented", "sprints"]);
    expect(r.unassignedScorers).toBe(1);
  });

  it("Mindesteinsatzzeit des Springers aus den Saisonregeln", () => {
    const withRule = assembleMatchday(
      raw({
        ...full,
        rules: { springer_mindestminuten: 45 },
        stats: [...full.stats, { playerId: 3, statKey: "minutes_played", value: 30, source: "manual" }],
      }),
      NOW,
    );
    // nur noch Team der Woche
    expect(withRule.bjoern.players[1].score.points).toBe(2);
  });

  it("kein Sieger, solange der Spieltag läuft", () => {
    const running = assembleMatchday(
      raw({ ...full, matches: [{ kickoff: PAST, originalKickoff: PAST, isFinished: false }], thesisPicks: [tp("bent", "plus_1", true, 1)] }),
      NOW,
    );
    expect(running.status).toBe("laeuft");
    expect(running.winner).toBeNull();
  });
});

describe("Saisonstand", () => {
  it("summiert alle Spieltage, Siege nur bei abgeschlossenen", () => {
    const a = assembleMatchday(raw({ number: 1, closedAt: PAST, thesisPicks: [tp("bent", "plus_minus_3", true, 1)] }), NOW);
    const b = assembleMatchday(raw({ number: 2, closedAt: PAST, thesisPicks: [tp("bjoern", "plus_1", true, 1)] }), NOW);
    const c = assembleMatchday(raw({ number: 3, thesisPicks: [tp("bjoern", "plus_minus_3", true, 1)] }), NOW);
    const s = seasonStandings([c, a, b]);
    expect(s.matchdays.map((m) => m.number)).toEqual([1, 2, 3]);
    expect([s.bent, s.bjoern]).toEqual([3, 4]);
    expect([s.bentClosed, s.bjoernClosed]).toEqual([3, 1]);
    expect(s.wins).toEqual({ bent: 1, bjoern: 1, draws: 0 });
  });
});
