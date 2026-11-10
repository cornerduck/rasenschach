import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnightCategory, QuestionValue } from "@/lib/scoring/types";

export interface ClubRow {
  id: number;
  code: string;
  name: string;
  short_name: string;
  color_primary: string;
  color_secondary: string;
  logo_url: string | null;
}

export interface MatchRow {
  id: number;
  kickoff: string;
  original_kickoff: string | null;
  is_finished: boolean;
  home_goals: number | null;
  away_goals: number | null;
  home: ClubRow;
  away: ClubRow;
}

export interface ThesisRow {
  id: number;
  sort_order: number;
  kind: "spieltag" | "spiel";
  match_id: number | null;
  text: string;
}

export interface MatchdayContext {
  season: { id: number; startYear: number; name: string };
  matchday: {
    id: number;
    number: number;
    questionValue: QuestionValue | null;
    knightCategory: KnightCategory | null;
    thesisStarter: "bent" | "bjoern" | null;
    closedAt: string | null;
  };
  /** Thesen-Draft wurde gestartet (oder es gibt schon Züge) */
  draftStarted: boolean;
  /** Spieler-Draft wurde gestartet (oder es gibt schon Züge) */
  playerDraftStarted: boolean;
  matches: MatchRow[];
  theses: ThesisRow[];
  thesisPickCount: number;
  playerPickCount: number;
  deadline: string | null;
  deadlinePassed: boolean;
  /** Vorbereitung und Thesen sind noch änderbar (kein Zug gesetzt, Deadline nicht vorbei, Saison aktiv) */
  prepOpen: boolean;
  prepComplete: boolean;
}

const CLUB = "id, code, name, short_name, color_primary, color_secondary, logo_url";

/** Aktuelle Saison: die neueste nicht archivierte. */
export async function currentSeason(db: SupabaseClient) {
  const { data } = await db
    .from("seasons")
    .select("id, start_year, name, is_archived")
    .eq("is_archived", false)
    .order("start_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function loadMatchday(db: SupabaseClient, number: number, now = new Date()): Promise<MatchdayContext | null> {
  const season = await currentSeason(db);
  if (!season) return null;

  const { data: md } = await db
    .from("matchdays")
    .select("*")
    .eq("season_id", season.id)
    .eq("number", number)
    .maybeSingle();
  if (!md) return null;

  const [matches, theses, tp, pp] = await Promise.all([
    db
      .from("matches")
      .select(`id, kickoff, original_kickoff, is_finished, home_goals, away_goals, home:clubs!matches_home_club_id_fkey(${CLUB}), away:clubs!matches_away_club_id_fkey(${CLUB})`)
      .eq("matchday_id", md.id)
      .order("kickoff")
      .order("id"),
    db.from("theses").select("id, sort_order, kind, match_id, text").eq("matchday_id", md.id).order("sort_order"),
    db.from("thesis_picks").select("*", { count: "exact", head: true }).eq("matchday_id", md.id),
    db.from("player_picks").select("*", { count: "exact", head: true }).eq("matchday_id", md.id),
  ]);
  if (matches.error) throw new Error(`Datenbank: ${matches.error.message}`);

  const rows = (matches.data ?? []) as unknown as MatchRow[];
  let deadline: string | null = null;
  for (const m of rows) {
    const t = Math.min(Date.parse(m.kickoff), Date.parse(m.original_kickoff ?? m.kickoff));
    if (deadline === null || t < Date.parse(deadline)) deadline = new Date(t).toISOString();
  }
  const deadlinePassed = deadline !== null && now.getTime() >= Date.parse(deadline);
  const thesisPickCount = tp.count ?? 0;
  const thesesRows = (theses.data ?? []) as ThesisRow[];

  return {
    season: { id: season.id, startYear: season.start_year, name: season.name },
    matchday: {
      id: md.id,
      number: md.number,
      questionValue: md.question_value,
      knightCategory: md.knight_category,
      thesisStarter: md.thesis_starter,
      closedAt: md.closed_at,
    },
    matches: rows,
    theses: thesesRows,
    thesisPickCount,
    draftStarted: !!md.thesis_draft_started_at || thesisPickCount > 0,
    playerPickCount: pp.count ?? 0,
    playerDraftStarted: !!md.player_draft_started_at || (pp.count ?? 0) > 0,
    deadline,
    deadlinePassed,
    prepOpen: thesisPickCount === 0 && !deadlinePassed && !md.closed_at,
    prepComplete: thesesRows.length === 12 && !!md.question_value && !!md.knight_category && !!md.thesis_starter,
  };
}

export function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
