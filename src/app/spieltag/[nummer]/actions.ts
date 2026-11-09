"use server";

import { createClient } from "@/lib/supabase/server";
import type { KnightCategory, QuestionValue } from "@/lib/scoring/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Stand der Spielvorbereitung, wie ihn die Datenbank nach einer Aktion zurückgibt */
export interface PrepState {
  questionValue: QuestionValue | null;
  knightCategory: KnightCategory | null;
  thesisStarter: "bent" | "bjoern" | null;
}
export type PrepResult = { ok: true; state: PrepState } | { ok: false; error: string };

type MatchdayRow = { question_value: QuestionValue | null; knight_category: KnightCategory | null; thesis_starter: "bent" | "bjoern" | null };

async function rpc(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const db = await createClient();
  const { error } = await db.rpc(fn, args);
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function prepRpc(fn: string, args: Record<string, unknown>): Promise<PrepResult> {
  const db = await createClient();
  const { data, error } = await db.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as MatchdayRow;
  return { ok: true, state: { questionValue: row.question_value, knightCategory: row.knight_category, thesisStarter: row.thesis_starter } };
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

export async function spinWheel(matchdayId: number, wheel: "frage" | "springer"): Promise<PrepResult> {
  return prepRpc(wheel === "frage" ? "spin_question_wheel" : "spin_knight_wheel", { p_matchday_id: matchdayId });
}

export async function setStarter(matchdayId: number, starter: "bent" | "bjoern"): Promise<PrepResult> {
  return prepRpc("set_thesis_starter", { p_matchday_id: matchdayId, p_starter: starter });
}

export async function resetPrep(matchdayId: number, what: "frage" | "springer" | "start"): Promise<PrepResult> {
  return prepRpc("reset_matchday_prep", { p_matchday_id: matchdayId, p_what: what });
}

/** Admin: Thesen, Räder, Startspieler und beide Drafts eines Spieltags löschen */
export async function resetMatchday(matchdayId: number): Promise<ActionResult> {
  return rpc("reset_matchday", { p_matchday_id: matchdayId });
}

/** Eine These im Thesen-Draft setzen (Regeln prüft die Datenbank) */
export async function makeThesisPick(
  matchdayId: number,
  field: "plus_minus_3" | "minus_plus_3" | "plus_1" | "minus_1" | "frage",
  thesisId: number,
): Promise<ActionResult> {
  return rpc("make_thesis_pick", { p_matchday_id: matchdayId, p_field: field, p_thesis_id: thesisId });
}
