import { describe, expect, it } from "vitest";
import { ownPhotoUrl, parsePhotoFilename, planPhotoImport, type SquadPlayer } from "./files";

describe("Spielerbilder: Dateinamen", () => {
  it("VEREIN_Name.png", () => {
    expect(parsePhotoFilename("SVW_Marco Grüll.png")).toEqual({ ok: true, file: "SVW_Marco Grüll.png", club: "SVW", name: "Marco Grüll" });
    expect(parsePhotoFilename("/Users/x/bilder/svw_Marco_Grüll.JPG")).toMatchObject({ ok: true, club: "SVW", name: "Marco Grüll" });
    expect(parsePhotoFilename("FCB_Kane.webp")).toMatchObject({ ok: true, name: "Kane" });
  });
  it("macOS-Dateinamen mit zerlegten Umlauten (NFD)", () => {
    expect(parsePhotoFilename("SVW_Marco Grüll.png")).toMatchObject({ ok: true, name: "Marco Grüll" });
  });
  it("ungültige Dateien", () => {
    expect(parsePhotoFilename(".DS_Store")).toMatchObject({ ok: false });
    expect(parsePhotoFilename("Marco Grüll.png")).toMatchObject({ ok: false, error: "Name nicht im Format VEREIN_Name" });
    expect(parsePhotoFilename("SVW_Grüll.gif")).toMatchObject({ ok: false, error: "kein PNG-, JPG- oder WebP-Bild" });
  });
});

describe("Spielerbilder: Zuordnung", () => {
  const squad: SquadPlayer[] = [
    { playerId: 1, clubCode: "SVW", fullName: "Marco Grüll", shortName: "Grüll" },
    { playerId: 2, clubCode: "SVE", fullName: "David Mokwa Ntusu", shortName: "Mokwa Ntusu" },
    { playerId: 3, clubCode: "M05", fullName: "Jae-Sung Lee", shortName: "Lee" },
    { playerId: 4, clubCode: "BVB", fullName: "Felix Nmecha", shortName: "Nmecha" },
    { playerId: 5, clubCode: "BVB", fullName: "Lukas Nmecha", shortName: "Nmecha" },
    { playerId: 6, clubCode: "FCB", fullName: "Harry Kane", shortName: "Kane", aliases: ["H. Kane Jr"] },
  ];
  const plan = planPhotoImport(
    [
      "SVW_Marco Grüll.png",
      "SVE_D. Mokwa.png",
      "M05_Lee Jae-sung.png",
      "BVB_Nmecha.png",
      "BVB_Felix Nmecha.png",
      "FCB_H. Kane Jr.png",
      "RBL_Niemand.png",
      "XXX_Wer.png",
      "SVW_Marco Gruell.png",
      "notizen.txt",
    ],
    squad,
  );
  const by = (f: string) => plan.matched.find((m) => m.file === f)?.playerId ?? plan.problems.find((p) => p.file === f)?.reason;

  it("robuste Namen innerhalb des Vereins", () => {
    expect(by("SVE_D. Mokwa.png")).toBe(2);
    expect(by("M05_Lee Jae-sung.png")).toBe(3);
    expect(by("BVB_Felix Nmecha.png")).toBe(4);
    expect(by("FCB_H. Kane Jr.png")).toBe(6); // feste Zuordnung
  });
  it("mehrdeutig, unbekannt und kaputt wird nur gemeldet", () => {
    expect(by("BVB_Nmecha.png")).toBe("mehrdeutig: Felix Nmecha, Lukas Nmecha");
    expect(by("RBL_Niemand.png")).toBe("Verein „RBL“ unbekannt");
    expect(by("XXX_Wer.png")).toBe("Verein „XXX“ unbekannt");
    expect(by("SVW_Marco Gruell.png")).toBe("kein Spieler „Marco Gruell“ bei SVW");
    expect(by("notizen.txt")).toBe("kein PNG-, JPG- oder WebP-Bild");
  });
  it("zwei Dateien für denselben Spieler: keine wird hochgeladen", () => {
    const p = planPhotoImport(["SVW_Marco Grüll.png", "SVW_Grüll.jpg"], squad);
    expect(p.matched).toEqual([]);
    expect(p.problems.map((x) => x.reason)).toEqual(["mehrere Dateien für Marco Grüll", "mehrere Dateien für Marco Grüll"]);
  });
  it("nur eigener Speicher wird angezeigt", () => {
    expect(ownPhotoUrl("https://api.sofascore.app/x.png")).toBeNull();
    expect(ownPhotoUrl("https://a.supabase.co/storage/v1/object/public/spielerbilder/1.webp?v=1")).toContain("spielerbilder");
  });
});
