import { describe, expect, it } from "vitest";
import { assignTheses, cleanLine, matchForText, mentionedClubs, splitTheses, validateTheses, type ClubInfo, type MatchInfo } from "./parse";

const clubs: ClubInfo[] = [
  { id: 1, code: "FCB", name: "FC Bayern München", shortName: "Bayern" },
  { id: 2, code: "KOE", name: "1. FC Köln", shortName: "Köln" },
  { id: 3, code: "S04", name: "FC Schalke 04", shortName: "S04" },
  { id: 4, code: "TSG", name: "TSG Hoffenheim", shortName: "Hoffenheim" },
  { id: 5, code: "SVW", name: "SV Werder Bremen", shortName: "Bremen" },
  { id: 6, code: "HSV", name: "Hamburger SV", shortName: "HSV" },
  { id: 7, code: "BVB", name: "Borussia Dortmund", shortName: "Dortmund" },
  { id: 8, code: "BMG", name: "Borussia Mönchengladbach", shortName: "Gladbach" },
];
const matches: MatchInfo[] = [
  { id: 101, homeClubId: 1, awayClubId: 2 }, // Bayern – Köln
  { id: 102, homeClubId: 3, awayClubId: 4 }, // Schalke – Hoffenheim
  { id: 103, homeClubId: 5, awayClubId: 6 }, // Bremen – HSV
  { id: 104, homeClubId: 8, awayClubId: 7 }, // Gladbach – Dortmund
];

describe("Thesen aus Text", () => {
  it("entfernt Nummerierung, Aufzählungszeichen, Leerzeilen und Überschriften", () => {
    expect(cleanLine("1. Es gibt 3 Remis.")).toBe("Es gibt 3 Remis.");
    expect(cleanLine("12) Köln trifft.")).toBe("Köln trifft.");
    expect(cleanLine("• Köln trifft.")).toBe("Köln trifft.");
    expect(cleanLine("- Köln   trifft.")).toBe("Köln trifft.");
    expect(splitTheses("Spieltagsthesen:\n1. A\n\n2. B\nThesen zu den Spielen:\n3. C\n")).toEqual(["A", "B", "C"]);
  });
  it("Zahlen am Satzanfang bleiben, wenn sie keine Nummerierung sind", () => {
    expect(cleanLine("5 Tore von nicht nominierten Deutschen.")).toBe("5 Tore von nicht nominierten Deutschen.");
  });
});

describe("Vereine erkennen", () => {
  it("Name, Kurzname, Kürzel, Spitzname", () => {
    expect([...mentionedClubs("Die Knappen schlagen Hoffenheim.", clubs)].sort()).toEqual([3, 4]);
    expect([...mentionedClubs("Der Bremer Keeper zeigt 5+ Paraden.", clubs)]).toEqual([5]);
    expect([...mentionedClubs("Köln trifft mindestens einmal.", clubs)]).toEqual([2]);
    expect([...mentionedClubs("Der HSV trifft nach der 80. Minute.", clubs)]).toEqual([6]);
  });
  it("„Borussia“ allein ist mehrdeutig und wird nicht zugeordnet", () => {
    expect(mentionedClubs("Die Borussia gewinnt.", clubs).size).toBe(0);
  });
  it("Spiel über einen oder beide Vereine", () => {
    expect(matchForText("Die Knappen schlagen Hoffenheim.", matches, clubs)).toBe(102);
    expect(matchForText("Gladbach gewinnt gegen den BVB.", matches, clubs)).toBe(104);
    expect(matchForText("Es fallen viele Tore.", matches, clubs)).toBeNull();
    // zwei Spiele genannt → nicht eindeutig
    expect(matchForText("Bayern und Bremen gewinnen.", matches, clubs)).toBeNull();
  });
});

describe("Zuordnen", () => {
  it("3 Spieltagsthesen, dann Spiele per Name, Rest nach Reihenfolge", () => {
    const r = assignTheses(
      ["Es gibt 3 Remis.", "Kein Elfmeter.", "Ein Torwart trifft.", "Es fallen 5 Tore.", "Die Knappen schlagen Hoffenheim.", "Werder hält die Null.", "Ein Platzverweis."],
      matches,
      clubs,
    );
    expect(r.slice(0, 3).every((t) => t.kind === "spieltag" && t.matchId === null)).toBe(true);
    expect(r[3]).toMatchObject({ kind: "spiel", matchId: 101, matchSource: "reihenfolge" });
    expect(r[4]).toMatchObject({ matchId: 102, matchSource: "name" });
    expect(r[5]).toMatchObject({ matchId: 103, matchSource: "name" });
    expect(r[6]).toMatchObject({ matchId: 104, matchSource: "reihenfolge" });
  });
  it("ein Spiel wird nicht doppelt per Name vergeben", () => {
    const r = assignTheses(["a", "b", "c", "Köln trifft.", "Bayern gewinnt."], matches, clubs);
    expect(r[3]).toMatchObject({ matchId: 101, matchSource: "name" });
    expect(r[4]).toMatchObject({ matchId: 102, matchSource: "reihenfolge" });
  });
});

describe("Prüfen", () => {
  const ok = assignTheses(Array.from({ length: 12 }, (_, i) => `These ${i}`), Array.from({ length: 9 }, (_, i) => ({ id: i, homeClubId: 0, awayClubId: 0 })), []);
  it("12 Thesen, 3 + 9, jedes Spiel einmal: keine Hinweise", () => {
    expect(validateTheses(ok, 9)).toEqual({ errors: [], warnings: [] });
  });
  it("falsche Anzahl ist ein Fehler", () => {
    expect(validateTheses(ok.slice(0, 11), 9).errors[0]).toContain("genau 12");
  });
  it("Hinweise bei falscher Aufteilung", () => {
    const changed = ok.map((t, i) => (i === 3 ? { ...t, kind: "spieltag" as const, matchId: null } : t));
    const v = validateTheses(changed, 9);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toContain("Laut Regelwerk 3 Spieltagsthesen, gerade 4.");
  });
});
