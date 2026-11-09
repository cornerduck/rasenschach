"use client";

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useEffect, useEffectEvent } from "react";
import { createClient } from "./client";

export interface RealtimeBinding {
  table: string;
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** z. B. "matchday_id=eq.12" */
  filter?: string;
}

export type RealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

/**
 * Hört per Supabase Realtime auf Änderungen in Tabellen.
 *
 * Wichtig: Vor dem Abonnieren wird die Anmeldung an Realtime übergeben. Sonst meldet sich
 * der Kanal als „nicht eingeloggt“ an, und die Leserechte (RLS) filtern jedes Ereignis
 * heraus. Genau das war der Grund, warum beim anderen nichts live ankam.
 *
 * `onReady` läuft nach jedem (Wieder-)Verbinden und wenn der Tab wieder sichtbar wird:
 * dort verpasste Änderungen nachladen.
 */
export function useRealtime(
  name: string,
  bindings: RealtimeBinding[],
  onChange: (table: string, payload: RealtimePayload) => void,
  onReady?: () => void,
) {
  const key = JSON.stringify(bindings);
  const handle = useEffectEvent(onChange);
  const ready = useEffectEvent(() => onReady?.());

  useEffect(() => {
    const list = JSON.parse(key) as RealtimeBinding[];
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    (async () => {
      await supabase.realtime.setAuth(); // holt das Token der aktuellen Sitzung
      if (cancelled) return;
      // eindeutiger Name, damit zwei Komponenten sich nicht denselben Kanal teilen
      let ch = supabase.channel(`${name}-${Math.random().toString(36).slice(2, 8)}`);
      for (const b of list) {
        ch = ch.on(
          "postgres_changes",
          { event: b.event, schema: "public", table: b.table, ...(b.filter ? { filter: b.filter } : {}) } as never,
          (payload: RealtimePayload) => handle(b.table, payload),
        );
      }
      channel = ch.subscribe((status) => {
        if (status === "SUBSCRIBED") ready();
      });
    })();

    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      await supabase.realtime.setAuth();
      ready();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [name, key]);
}
