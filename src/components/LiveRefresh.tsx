"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Lädt die Seite neu, sobald sich in den genannten Tabellen für diesen Spieltag etwas ändert
 * (Supabase Realtime). So sieht der andere Züge, Räder und Thesen sofort.
 */
export function LiveRefresh({ matchdayId, tables }: { matchdayId: number; tables: { table: string; column: string }[] }) {
  const router = useRouter();
  const key = JSON.stringify(tables);
  useEffect(() => {
    const list = JSON.parse(key) as { table: string; column: string }[];
    const supabase = createClient();
    let channel = supabase.channel(`spieltag-${matchdayId}-${list.map((t) => t.table).join("-")}`);
    for (const t of list) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t.table, filter: `${t.column}=eq.${matchdayId}` },
        () => router.refresh(),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchdayId, key, router]);
  return null;
}
