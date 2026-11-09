"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function rpc(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const db = await createClient();
  const { error } = await db.rpc(fn, args);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function saveTheses(
  matchdayId: number,
  theses: { kind: "spieltag" | "spiel"; matchId: number | null; text: string }[],
): Promise<ActionResult> {
  return rpc("save_theses", {
    p_matchday_id: matchdayId,
    p_theses: theses.map((t) => ({ kind: t.kind, match_id: t.matchId, text: t.text })),
  });
}

export async function spinWheel(matchdayId: number, wheel: "frage" | "springer"): Promise<ActionResult> {
  return rpc(wheel === "frage" ? "spin_question_wheel" : "spin_knight_wheel", { p_matchday_id: matchdayId });
}

export async function setStarter(matchdayId: number, starter: "bent" | "bjoern"): Promise<ActionResult> {
  return rpc("set_thesis_starter", { p_matchday_id: matchdayId, p_starter: starter });
}

export async function resetPrep(matchdayId: number, what: "frage" | "springer" | "start"): Promise<ActionResult> {
  return rpc("reset_matchday_prep", { p_matchday_id: matchdayId, p_what: what });
}
