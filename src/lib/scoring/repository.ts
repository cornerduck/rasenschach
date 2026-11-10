import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assembleMatchday,
  seasonStandings,
  type MatchdayRaw,
  type MatchdayResult,
  type SeasonStandings,
} from "./assemble";

/**
 * Lädt Spieltage aus der Datenbank und berechnet die Punkte.
 * Funktioniert mit dem normalen Server-Client (RLS: beide dürfen lesen) und mit dem Admin-Client.
 */

const PAGE = 1000;

/** Lädt alle Zeilen einer Abfrage seitenweise (Supabase liefert max. 1000 pro Abruf). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`Datenbank: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

type MdRow = {
  id: number;
  number: number;
  question_value: MatchdayRaw["questionValue"];
  knight_category: MatchdayRaw["knightCategory"];
  thesis_starter: MatchdayRaw["thesisStarter"];
  closed_at: string | null;
  thesis_draft_started_at?: string | null;
  player_draft_started_at?: string | null;
  seasons: { rules: MatchdayRaw["rules"] };
};

async function loadRaw(db: SupabaseClient, mdRows: MdRow[]): Promise<MatchdayRaw[]> {
  const ids = mdRows.map((m) => m.id);
  if (ids.length === 0) return [];

  const [matches, theses, thesisPicks, playerPicks, stats, goals, ranks] = await Promise.all([
    fetchAll<{ id: number; matchday_id: number; kickoff: string; original_kickoff: string | null; is_finished: boolean }>((a, b) =>
      db.from("matches").select("id, matchday_id, kickoff, original_kickoff, is_finished").in("matchday_id", ids).order("id").range(a, b),
    ),
    fetchAll<{ matchday_id: number }>((a, b) => db.from("theses").select("matchday_id").in("matchday_id", ids).order("id").range(a, b)),
    fetchAll<{
      matchday_id: number; manager: "bent" | "bjoern"; field: MatchdayRaw["thesisPicks"][number]["field"]; pick_no: number; thesis_id: number;
      theses: { text: string; outcome: boolean | null; confirmed_bent: boolean; confirmed_bjoern: boolean };
    }>((a, b) =>
      db
        .from("thesis_picks")
        .select("matchday_id, manager, field, pick_no, thesis_id, theses(text, outcome, confirmed_bent, confirmed_bjoern)")
        .in("matchday_id", ids)
        .order("id")
        .range(a, b) as never,
    ),
    fetchAll<{ matchday_id: number; manager: "bent" | "bjoern"; piece: MatchdayRaw["playerPicks"][number]["piece"]; pick_no: number; player_id: number }>((a, b) =>
      db.from("player_picks").select("matchday_id, manager, piece, pick_no, player_id").in("matchday_id", ids).order("id").range(a, b),
    ),
    fetchAll<{ matchday_id: number; player_id: number; stat_key: string; value: number; source: string }>((a, b) =>
      db
        .from("effective_stat_values")
        .select("matchday_id, player_id, stat_key, value, source")
        .in("matchday_id", ids)
        .order("matchday_id")
        .order("player_id")
        .order("stat_key")
        .range(a, b),
    ),
    fetchAll<{ id: number; match_id: number; player_id: number | null; scorer_external_id: string | null; scorer_name_raw: string; is_own_goal: boolean; matches: { matchday_id: number } }>((a, b) =>
      db
        .from("goals")
        .select("id, match_id, player_id, scorer_external_id, scorer_name_raw, is_own_goal, matches!inner(matchday_id)")
        .in("matches.matchday_id", ids)
        .order("id")
        .range(a, b) as never,
    ),
    fetchAll<{ matchday_id: number; stat_key: string; rank: number; player_id: number | null }>((a, b) =>
      db.from("league_ranks").select("matchday_id, stat_key, rank, player_id").in("matchday_id", ids).order("id").range(a, b),
    ),
  ]);

  const by = <T extends { matchday_id: number }>(rows: T[]) => {
    const m = new Map<number, T[]>();
    for (const r of rows) m.set(r.matchday_id, [...(m.get(r.matchday_id) ?? []), r]);
    return m;
  };
  const matchesBy = by(matches);
  const thesesBy = by(theses);
  const tpBy = by(thesisPicks);
  const ppBy = by(playerPicks);
  const statsBy = by(stats);
  const goalsBy = by(goals.map((g) => ({ ...g, matchday_id: g.matches.matchday_id })));
  const ranksBy = by(ranks);

  return mdRows.map((md) => ({
    matchdayId: md.id,
    number: md.number,
    questionValue: md.question_value,
    knightCategory: md.knight_category,
    thesisStarter: md.thesis_starter,
    closedAt: md.closed_at,
    rules: md.seasons?.rules ?? null,
    matches: (matchesBy.get(md.id) ?? []).map((m) => ({ kickoff: m.kickoff, originalKickoff: m.original_kickoff, isFinished: m.is_finished })),
    thesesCount: thesesBy.get(md.id)?.length ?? 0,
    draftStarted: !!md.thesis_draft_started_at,
    playerDraftStarted: !!md.player_draft_started_at,
    thesisPicks: (tpBy.get(md.id) ?? []).map((t) => ({
      manager: t.manager,
      field: t.field,
      pickNo: t.pick_no,
      thesisId: t.thesis_id,
      text: t.theses.text,
      outcome: t.theses.outcome,
      confirmedBent: t.theses.confirmed_bent,
      confirmedBjoern: t.theses.confirmed_bjoern,
    })),
    playerPicks: (ppBy.get(md.id) ?? []).map((p) => ({ manager: p.manager, piece: p.piece, pickNo: p.pick_no, playerId: p.player_id })),
    stats: (statsBy.get(md.id) ?? []).map((s) => ({ playerId: s.player_id, statKey: s.stat_key, value: Number(s.value), source: s.source })),
    goals: (goalsBy.get(md.id) ?? []).map((g) => ({
      playerId: g.player_id,
      scorerExternalId: g.scorer_external_id,
      scorerName: g.scorer_name_raw,
      isOwnGoal: g.is_own_goal,
    })),
    leagueRanks: (ranksBy.get(md.id) ?? []).map((r) => ({ statKey: r.stat_key, rank: r.rank, playerId: r.player_id })),
  }));
}

// "*" statt einzelner Spalten: läuft auch, solange eine neue Spalte noch nicht per Migration angelegt ist
const MD_SELECT = "*, seasons!inner(rules, start_year)";

/** Ergebnis eines Spieltags (Saison als Startjahr, z. B. 2026). */
export async function getMatchdayResult(db: SupabaseClient, season: number, number: number, now = new Date()): Promise<MatchdayResult | null> {
  const { data, error } = await db
    .from("matchdays")
    .select(MD_SELECT)
    .eq("seasons.start_year", season)
    .eq("number", number)
    .maybeSingle();
  if (error) throw new Error(`Datenbank: ${error.message}`);
  if (!data) return null;
  const [raw] = await loadRaw(db, [data as unknown as MdRow]);
  return assembleMatchday(raw, now);
}

/** Gesamtstand einer Saison mit allen Spieltagen. */
export async function getSeasonStandings(db: SupabaseClient, season: number, now = new Date()): Promise<SeasonStandings | null> {
  const { data, error } = await db
    .from("matchdays")
    .select(MD_SELECT)
    .eq("seasons.start_year", season)
    .order("number");
  if (error) throw new Error(`Datenbank: ${error.message}`);
  if (!data || data.length === 0) return null;
  const raws = await loadRaw(db, data as unknown as MdRow[]);
  return seasonStandings(raws.map((r) => assembleMatchday(r, now)));
}
