"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useRealtime } from "@/lib/supabase/realtime";

/** Saisonübersicht live: lädt neu, wenn sich an Spieltagen, Zügen oder Punkten etwas ändert. */
export function SeasonLive({ seasonId }: { seasonId: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 500);
  };
  useRealtime(
    `saison-${seasonId}`,
    [
      { table: "matchdays", event: "UPDATE", filter: `season_id=eq.${seasonId}` },
      { table: "thesis_picks", event: "INSERT" },
      { table: "player_picks", event: "INSERT" },
      { table: "theses", event: "*" },
      // Auswertung: Punkte ändern sich mit Werten, Plätzen und Ergebnissen
      { table: "stat_values", event: "*" },
      { table: "league_ranks", event: "*" },
      { table: "matches", event: "UPDATE" },
    ],
    refresh,
  );
  return null;
}
