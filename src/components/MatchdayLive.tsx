"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useRealtime, type RealtimePayload } from "@/lib/supabase/realtime";

type Page = "thesen" | "vorbereitung" | "draft";

/**
 * Hält eine Spieltag-Seite live: Bei jeder Änderung des anderen (Thesen, Räder,
 * Startspieler, Züge) wird die Seite neu geladen. Startet jemand den Thesen-Draft,
 * wechseln Thesen- und Vorbereitungsseite automatisch in den Draft. Setzt der Admin
 * den Spieltag zurück, geht der Draft zurück an den Anfang.
 */
export function MatchdayLive({
  matchdayId,
  number,
  page,
  started = false,
}: {
  matchdayId: number;
  number: number;
  page: Page;
  /** Draft war beim Laden schon gestartet: dann nicht mehr automatisch wechseln */
  started?: boolean;
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
    ],
    (table: string, payload: RealtimePayload) => {
      const row = payload.new as Record<string, unknown>;
      if (page !== "draft") {
        const nowStarted = (table === "matchdays" && !!row.thesis_draft_started_at) || table === "thesis_picks";
        if (nowStarted && !started) return router.push(`/spieltag/${number}/thesen-draft`);
      } else {
        if (table === "matchdays" && !row.thesis_draft_started_at && !row.thesis_starter) return router.push(`/spieltag/${number}`);
        if (table === "thesis_picks") return; // Züge übernimmt das Draft-Board selbst
      }
      refresh();
    },
    refresh,
  );
  return null;
}
