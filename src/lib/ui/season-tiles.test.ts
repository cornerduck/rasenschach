import { describe, expect, it } from "vitest";
import type { ManagerResult, MatchdayResult } from "@/lib/scoring/assemble";
import { continueMatchday, seasonTiles } from "./season-tiles";

const m = (total: number): ManagerResult => ({ thesisPoints: total, playerPoints: 0, total, openTheses: 0, theses: [], players: [] });
const r = (number: number, o: Partial<MatchdayResult>): MatchdayResult => ({
  matchdayId: number,
  number,
  status: "abgeschlossen",
  deadline: "2026-11-20T19:30:00Z",
  bent: m(0),
  bjoern: m(0),
  winner: null,
  missingLeagueStats: [],
  unassignedScorers: 0,
  turn: null,
  turnPicks: 0,
  played: false,
  ...o,
});

describe("Saison-Kacheln", () => {
  const tiles = seasonTiles([
    r(1, { status: "auswertung" }), // vor Spielbeginn, nicht mitgespielt
    r(8, { status: "abgeschlossen", played: true, bent: m(14), bjoern: m(10), winner: "bent" }),
    r(9, { status: "laeuft", played: true, bent: m(5), bjoern: m(7) }),
    r(10, { status: "thesen_draft", turn: "bent", turnPicks: 2 }),
    r(11, { status: "vorbereitung" }),
  ]);
  const by = (n: number) => tiles.find((t) => t.number === n)!;

  it("nicht mitgespielte vergangene Spieltage", () => {
    expect(by(1)).toMatchObject({ kind: "verpasst", hint: "nicht gespielt" });
  });
  it("gewertet mit Sieger", () => {
    expect(by(8)).toMatchObject({ kind: "gewertet", badge: "SIEG BENT", badgeColor: "bent", points: { bent: 14, bjoern: 10, winner: "bent" } });
  });
  it("laufend mit vorläufigen Punkten, ohne Sieger", () => {
    expect(by(9)).toMatchObject({ kind: "laufend", badge: "LÄUFT", points: { bent: 5, bjoern: 7, winner: null } });
  });
  it("aktueller Draft mit Zug", () => {
    expect(by(10)).toMatchObject({ kind: "aktuell", badge: "LIVE", hint: "Thesen-Draft läuft · Bent am Zug" });
  });
  it("spätere Spieltage", () => {
    expect(by(11).kind).toBe("zukunft");
    expect(by(11).hint).toMatch(/^ab /);
  });
  it("Unentschieden", () => {
    const [t] = seasonTiles([r(3, { played: true, bent: m(5), bjoern: m(5) })]);
    expect(t.badge).toBe("UNENTSCHIEDEN");
  });
  it("Fortsetzen: laufender gespielter Spieltag vor dem nächsten Draft", () => {
    expect(continueMatchday([r(9, { status: "laeuft", played: true }), r(10, { status: "thesen_draft" })])).toBe(9);
    expect(continueMatchday([r(9, { status: "auswertung" }), r(10, { status: "vorbereitung" })])).toBe(10);
  });
});
