"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useRealtime } from "@/lib/supabase/realtime";

/** Saisonübersicht live: lädt neu, wenn sich an Spieltagen oder Zügen etwas ändert. */
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
      { table: "theses", event: "INSERT" },
    ],
    refresh,
  );
  return null;
}
