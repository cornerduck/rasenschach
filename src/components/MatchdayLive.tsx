"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useRealtime, type RealtimePayload } from "@/lib/supabase/realtime";

/** "spieler-wartet": Spieler-Draft-Seite, solange der Draft noch nicht gestartet ist */
type Page = "thesen" | "vorbereitung" | "draft" | "spieler-wartet" | "spieler-draft" | "auswertung";

/**
 * Hält eine Spieltag-Seite live: Bei jeder Änderung des anderen (Thesen, Räder,
 * Startspieler, Züge) wird die Seite neu geladen. Startet jemand den Thesen-Draft,
 * wechseln Thesen- und Vorbereitungsseite automatisch in den Draft; startet jemand den
 * Spieler-Draft, wechselt der Thesen-Draft dorthin. Setzt der Admin zurück, geht es
 * zurück an den passenden Schritt.
 */
export function MatchdayLive({
  matchdayId,
  number,
  page,
  started = false,
  playerStarted = false,
}: {
  matchdayId: number;
  number: number;
  page: Page;
  /** Draft war beim Laden schon gestartet: dann nicht mehr automatisch wechseln */
  started?: boolean;
  /** Spieler-Draft war beim Laden schon gestartet */
  playerStarted?: boolean;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = () => {
    // mehrere Ereignisse kurz hintereinander (z. B. 12 Thesen) → nur einmal neu laden
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 250);
  };

  useRealtime(
    `spieltag-${matchdayId}-${page}`,
    [
      { table: "matchdays", event: "UPDATE", filter: `id=eq.${matchdayId}` },
      { table: "theses", event: "*", filter: `matchday_id=eq.${matchdayId}` },
      { table: "thesis_picks", event: "INSERT", filter: `matchday_id=eq.${matchdayId}` },
      { table: "player_picks", event: "INSERT", filter: `matchday_id=eq.${matchdayId}` },
      // Auswertung: Werte, ligaweite Plätze und Ergebnisse
      ...(page === "auswertung"
        ? ([
            { table: "stat_values", event: "*", filter: `matchday_id=eq.${matchdayId}` },
            { table: "league_ranks", event: "*", filter: `matchday_id=eq.${matchdayId}` },
            { table: "matches", event: "UPDATE", filter: `matchday_id=eq.${matchdayId}` },
            // Löschen lässt sich nicht filtern (z. B. Handeingabe zurückgenommen)
            { table: "stat_values", event: "DELETE" },
            { table: "league_ranks", event: "DELETE" },
          ] as const)
        : []),
    ],
    (table: string, payload: RealtimePayload) => {
      const row = payload.new as Record<string, unknown>;
      if (page === "thesen" || page === "vorbereitung") {
        const nowStarted = (table === "matchdays" && !!row.thesis_draft_started_at) || table === "thesis_picks";
        if (nowStarted && !started) return router.push(`/spieltag/${number}/thesen-draft`);
      } else if (page === "draft") {
        if (table === "matchdays" && !row.thesis_draft_started_at && !row.thesis_starter) return router.push(`/spieltag/${number}`);
        const playerNow = (table === "matchdays" && !!row.player_draft_started_at) || table === "player_picks";
        if (playerNow && !playerStarted) return router.push(`/spieltag/${number}/spieler-draft`);
        if (table === "thesis_picks") return; // Züge übernimmt das Draft-Board selbst
      } else if (page === "auswertung") {
        // Spieltag komplett zurückgesetzt: zurück an den Anfang
        if (table === "matchdays" && !row.thesis_draft_started_at && !row.thesis_starter) return router.push(`/spieltag/${number}`);
      } else if (page === "spieler-wartet") {
        const playerNow = (table === "matchdays" && !!row.player_draft_started_at) || table === "player_picks";
        if (playerNow) return router.push(`/spieltag/${number}/spieler-draft`);
      } else {
        // Spieler-Draft zurückgesetzt (oder ganzer Spieltag): zurück zum passenden Schritt
        if (table === "matchdays" && !row.player_draft_started_at) return router.push(`/spieltag/${number}`);
        if (table === "player_picks") return; // Züge übernimmt das Draft-Board selbst
      }
      refresh();
    },
    refresh,
  );
  return null;
}
