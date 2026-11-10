"use server";

import { leagueTopN, rankEntries } from "@/lib/scoring/league";
import { createClient } from "@/lib/supabase/server";
import { EDITABLE_STATS } from "@/lib/ui/evaluation";
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

/** Münzwurf: die Datenbank lost, wer den Thesen-Draft beginnt */
export async function tossCoin(matchdayId: number): Promise<PrepResult> {
  const res = await prepRpc("toss_coin", { p_matchday_id: matchdayId });
  if (!res.ok && /toss_coin/.test(res.error)) {
    return { ok: false, error: "Die Datenbank kennt den Münzwurf noch nicht. Bitte zuerst die neue Migration ausführen." };
  }
  return res;
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

/** Thesen-Draft starten (wenn alles vorbereitet ist). Alle offenen Seiten wechseln dann live in den Draft. */
export async function startThesisDraft(matchdayId: number): Promise<ActionResult> {
  const res = await rpc("start_thesis_draft", { p_matchday_id: matchdayId });
  if (!res.ok && /start_thesis_draft/.test(res.error)) {
    return { ok: false, error: "Die Datenbank kennt „Draft starten“ noch nicht. Bitte zuerst die neue Migration ausführen." };
  }
  return res;
}

const MIGRATION_HINT = "Die Datenbank kennt den Spieler-Draft noch nicht. Bitte zuerst die neue Migration ausführen.";

/** Spieler-Draft starten (wenn der Thesen-Draft fertig ist). Alle offenen Seiten wechseln dann live in den Draft. */
export async function startPlayerDraft(matchdayId: number): Promise<ActionResult> {
  const res = await rpc("start_player_draft", { p_matchday_id: matchdayId });
  return !res.ok && /start_player_draft/.test(res.error) ? { ok: false, error: MIGRATION_HINT } : res;
}

/** Einen Spieler im Spieler-Draft setzen (alle Regeln prüft die Datenbank) */
export async function makePlayerPick(
  matchdayId: number,
  piece: "turm" | "laeufer" | "springer" | "dame" | "koenig",
  playerId: number,
): Promise<ActionResult> {
  return rpc("make_player_pick", { p_matchday_id: matchdayId, p_piece: piece, p_player_id: playerId });
}

/** Admin: nur den Spieler-Draft löschen, der Thesen-Draft bleibt */
export async function resetPlayerDraft(matchdayId: number): Promise<ActionResult> {
  const res = await rpc("reset_player_draft", { p_matchday_id: matchdayId });
  return !res.ok && /reset_player_draft/.test(res.error) ? { ok: false, error: MIGRATION_HINT } : res;
}

// ---------------------------------------------------------------------------
// Auswertung

const SCORING_HINT = "Die Datenbank kennt die Auswertung noch nicht. Bitte zuerst die neue Migration ausführen.";
const scoringRpc = async (fn: string, args: Record<string, unknown>) => {
  const res = await rpc(fn, args);
  return !res.ok && new RegExp(fn).test(res.error) ? ({ ok: false, error: SCORING_HINT } as const) : res;
};

/** These auflösen (setzt automatisch die eigene Bestätigung). null = Ergebnis zurücknehmen */
export async function setThesisOutcome(thesisId: number, outcome: boolean | null): Promise<ActionResult> {
  return rpc("set_thesis_outcome", { p_thesis_id: thesisId, p_outcome: outcome });
}

/** Ergebnis einer These bestätigen */
export async function confirmThesis(thesisId: number): Promise<ActionResult> {
  return rpc("confirm_thesis", { p_thesis_id: thesisId });
}

/** Admin: Wert per Hand setzen; null = Handeingabe löschen (dann gilt der automatische Wert) */
export async function setStatValue(matchdayId: number, playerId: number, statKey: string, value: number | null): Promise<ActionResult> {
  if (!EDITABLE_STATS.has(statKey)) return { ok: false, error: `Unbekannter Wert „${statKey}“` };
  if (value !== null && (!Number.isFinite(value) || value < 0)) return { ok: false, error: "Bitte eine Zahl ab 0 eintragen" };
  return scoringRpc("set_stat_value", { p_matchday_id: matchdayId, p_player_id: playerId, p_stat_key: statKey, p_value: value });
}

/** Admin: Team bzw. Spieler der Woche für einen Spieler setzen */
export async function setWeekly(matchdayId: number, playerId: number, value: "keins" | "team" | "spieler"): Promise<ActionResult> {
  const team = await setStatValue(matchdayId, playerId, "team_of_week", value === "keins" ? null : 1);
  if (!team.ok) return team;
  return setStatValue(matchdayId, playerId, "player_of_week", value === "spieler" ? 1 : null);
}

/**
 * Admin: ligaweite Bestwerte eintragen. Die Plätze berechnet das Tool nach den Regeln
 * (geteilter Platz, danach der übernächste; nur Werte über 0).
 */
export async function setLeagueEntries(
  matchdayId: number,
  statKey: string,
  entries: { playerId: number | null; name: string; value: number }[],
): Promise<ActionResult> {
  for (const e of entries) {
    if (e.playerId === null && !e.name.trim()) return { ok: false, error: "Bei „Anderer Spieler“ bitte einen Namen eintragen" };
    if (!Number.isFinite(e.value) || e.value < 0) return { ok: false, error: "Bitte bei jedem Eintrag einen Wert ab 0 eintragen" };
  }
  const ranked = rankEntries(entries, leagueTopN(statKey));
  return scoringRpc("set_league_entries", {
    p_matchday_id: matchdayId,
    p_stat_key: statKey,
    p_entries: ranked.map((e) => ({ player_id: e.playerId, player_name: e.name.trim() || null, value: e.value, rank: e.rank })),
  });
}

/** Admin: Spieltag freigeben (nur wenn alle Spiele gespielt und alle Thesen bestätigt sind) */
export async function closeMatchday(matchdayId: number): Promise<ActionResult> {
  return scoringRpc("close_matchday", { p_matchday_id: matchdayId });
}

/** Admin: abgeschlossenen Spieltag wieder öffnen (für Korrekturen) */
export async function reopenMatchday(matchdayId: number): Promise<ActionResult> {
  return scoringRpc("reopen_matchday", { p_matchday_id: matchdayId });
}
