import type { MatchdayResult } from "@/lib/scoring/assemble";

export type TileKind = "gewertet" | "laufend" | "aktuell" | "verpasst" | "zukunft";

export interface Tile {
  number: number;
  kind: TileKind;
  /** kleines Label oben rechts */
  badge: string;
  badgeColor: "bent" | "bjoern" | "amber" | "muted" | "faint";
  /** Punkte anzeigen? */
  points: { bent: number; bjoern: number; winner: "bent" | "bjoern" | null } | null;
  /** Text unten, wenn keine Punkte */
  hint: string | null;
}

const NAME = { bent: "Bent", bjoern: "Björn" } as const;

const day = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Kacheln der Saisonübersicht. „Aktuell“ ist der erste Spieltag, dessen Deadline noch
 * nicht vorbei ist; gespielte Spieltage, die noch laufen, sind ebenfalls markiert.
 */
export function seasonTiles(results: MatchdayResult[]): Tile[] {
  const sorted = [...results].sort((a, b) => a.number - b.number);
  const upcoming = ["vorbereitung", "thesen_draft", "spieler_draft"];
  const current = sorted.find((r) => upcoming.includes(r.status))?.number ?? null;

  return sorted.map((r): Tile => {
    const pts = { bent: r.bent.total, bjoern: r.bjoern.total, winner: r.winner };

    if (r.status === "abgeschlossen" && r.played) {
      return {
        number: r.number,
        kind: "gewertet",
        badge: r.winner ? `SIEG ${NAME[r.winner].toUpperCase()}` : "UNENTSCHIEDEN",
        badgeColor: r.winner ?? "muted",
        points: pts,
        hint: null,
      };
    }

    if ((r.status === "laeuft" || r.status === "auswertung") && r.played) {
      return {
        number: r.number,
        kind: "laufend",
        badge: r.status === "laeuft" ? "LÄUFT" : "AUSWERTUNG",
        badgeColor: "amber",
        points: { ...pts, winner: null },
        hint: null,
      };
    }

    if (r.number === current) {
      let hint: string;
      if (r.status === "vorbereitung") hint = "Spielvorbereitung offen";
      else if (r.turn) {
        const phase = r.status === "thesen_draft" ? "Thesen" : "Spieler";
        hint = `${phase}-Draft läuft · ${NAME[r.turn]} am Zug`;
      } else hint = `Drafts fertig · Anstoß ${r.deadline ? day(r.deadline) : "offen"}`;
      return {
        number: r.number,
        kind: "aktuell",
        badge: r.status === "vorbereitung" ? "ALS NÄCHSTES" : "LIVE",
        badgeColor: "amber",
        points: null,
        hint,
      };
    }

    if (!r.played && r.status !== "vorbereitung" && !upcoming.includes(r.status)) {
      return { number: r.number, kind: "verpasst", badge: "", badgeColor: "faint", points: null, hint: "nicht gespielt" };
    }

    return {
      number: r.number,
      kind: "zukunft",
      badge: "",
      badgeColor: "faint",
      points: null,
      hint: r.deadline ? `ab ${day(r.deadline)}` : "noch nicht aktiv",
    };
  });
}

/** Der Spieltag für den Button „Spieltag N fortsetzen“ */
export function continueMatchday(results: MatchdayResult[]): number | null {
  const sorted = [...results].sort((a, b) => a.number - b.number);
  const running = sorted.find((r) => r.played && (r.status === "laeuft" || r.status === "auswertung"));
  const upcoming = sorted.find((r) => ["vorbereitung", "thesen_draft", "spieler_draft"].includes(r.status));
  return (running ?? upcoming)?.number ?? null;
}
