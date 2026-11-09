import { describe, expect, it } from "vitest";
import { parseRosterCsv, splitCsv } from "./csv";
import { findUniqueScorer, normalizeName, scorerMatchesPlayer } from "./names";

describe("CSV einlesen", () => {
  it("liest Semikolon-CSV mit allen Spalten", () => {
    const r = parseRosterCsv(
      "name;kurzname;verein;position;nummer;sofascore_id;foto_url\n" +
        "Max Mustermann;Mustermann;SVW;TW;1;123456;https://example.org/a.png\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      {
        line: 2,
        fullName: "Max Mustermann",
        shortName: "Mustermann",
        club: "SVW",
        position: "TW",
        shirtNumber: 1,
        sofascoreId: "123456",
        photoUrl: "https://example.org/a.png",
      },
    ]);
  });

  it("erkennt Komma, BOM, andere Spaltenreihenfolge und optionale Spalten", () => {
    const r = parseRosterCsv("﻿Position,Verein,Name\r\nSturm,Bremen,Erik Beispiel\r\n");
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ fullName: "Erik Beispiel", shortName: "Beispiel", club: "Bremen", position: "ST", shirtNumber: null });
  });

  it("versteht verschiedene Positionsangaben", () => {
    const r = parseRosterCsv("name;verein;position\nA;SVW;Torwart\nB;SVW;D\nC;SVW;mittelfeld\nD;SVW;FW\n");
    expect(r.rows.map((x) => x.position)).toEqual(["TW", "AB", "MF", "ST"]);
  });

  it("meldet fehlende Pflichtspalten", () => {
    expect(parseRosterCsv("name;verein\nA;SVW").errors).toEqual(["Spalte „position“ fehlt in der Kopfzeile"]);
  });

  it("meldet fehlerhafte Zeilen mit Zeilennummer und überspringt sie", () => {
    const r = parseRosterCsv(
      "name;verein;position;nummer;foto_url\n" +
        "Gut;SVW;MF;10;\n" +
        "Schlecht;SVW;Libero;100;http://x\n" +
        ";SVW;MF;;\n",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([
      "Zeile 3 (Schlecht): Position „Libero“ unbekannt (TW, AB, MF, ST), Rückennummer „100“ ungültig (1–99), Foto-URL muss mit https:// beginnen",
      "Zeile 4: Name fehlt",
    ]);
  });

  it("meldet doppelte Spieler", () => {
    const r = parseRosterCsv("name;verein;position\nA B;SVW;MF\na b;svw;ST\n");
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0]).toContain("doppelt, schon in Zeile 2");
  });

  it("ignoriert Leerzeilen", () => {
    expect(parseRosterCsv("name;verein;position\n\nA;SVW;MF\n;;\n").rows).toHaveLength(1);
  });

  it("Anführungszeichen mit Trennzeichen und Escape", () => {
    expect(splitCsv('a;"b;c";"d ""e"""\n', ";")).toEqual([["a", "b;c", 'd "e"']]);
  });
});

describe("Namensabgleich Torschützen", () => {
  it("normalisiert Akzente und Sonderzeichen", () => {
    expect(normalizeName("Ermedin Demirović")).toBe("ermedin demirovic");
    expect(normalizeName("Albert Grønbæk")).toBe("albert gronbaek");
    expect(normalizeName("Jean-Manuel Mbom")).toBe("jean manuel mbom");
  });

  const p = (fullName: string, shortName = fullName.split(" ").at(-1)!) => ({ fullName, shortName });

  it("abgekürzter Vorname: F. Nmecha", () => {
    expect(scorerMatchesPlayer("F. Nmecha", p("Felix Nmecha"))).toBe(true);
    expect(scorerMatchesPlayer("F. Nmecha", p("Lukas Nmecha"))).toBe(false);
    expect(scorerMatchesPlayer("A. Garcia", p("Aleix García"))).toBe(true);
    expect(scorerMatchesPlayer("A. Grønbæk", p("Albert Grønbæk"))).toBe(true);
  });

  it("voller Name", () => {
    expect(scorerMatchesPlayer("Lennart Karl", p("Lennart Karl"))).toBe(true);
    expect(scorerMatchesPlayer("Emmanuel Latte Lath", p("Emmanuel Latte Lath", "Latte Lath"))).toBe(true);
    expect(scorerMatchesPlayer("Luis Díaz", p("Luis Fernando Díaz", "Díaz"))).toBe(true);
  });

  it("Einzelname", () => {
    expect(scorerMatchesPlayer("Romulo", p("Rômulo Cardoso", "Rômulo"))).toBe(true);
    expect(scorerMatchesPlayer("Romulo", p("Romulo"))).toBe(true);
  });

  it("nur eindeutige Treffer werden zugeordnet", () => {
    const squad = [p("Felix Nmecha"), p("Lukas Nmecha"), p("Fabian Nmecha")];
    expect(findUniqueScorer("F. Nmecha", squad)).toBeNull();
    expect(findUniqueScorer("L. Nmecha", squad)?.fullName).toBe("Lukas Nmecha");
    expect(findUniqueScorer("X. Niemand", squad)).toBeNull();
  });
});
