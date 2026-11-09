import "server-only";
import { fetchJson } from "./http";
import type { FixtureSource, Goal, Match, Matchday, SourceResult, Team } from "./types";

const BASE = "https://api.openligadb.de";
const LEAGUE = "bl1";
const ID = "openligadb" as const;

// Rohformen von OpenLigaDB (nur die genutzten Felder)
interface OldbTeam { teamId: number; teamName: string; shortName: string; teamIconUrl: string | null }
interface OldbGroup { groupName: string; groupOrderID: number }
interface OldbResult { resultTypeID: number; pointsTeam1: number; pointsTeam2: number }
interface OldbGoal {
  matchMinute: number | null; goalGetterID: number; goalGetterName: string | null;
  scoringTeamId?: number | null; isPenalty: boolean | null; isOwnGoal: boolean | null; isOvertime: boolean | null;
}
interface OldbMatch {
  matchID: number; leagueSeason: number; matchDateTimeUTC: string; group: OldbGroup;
  team1: OldbTeam; team2: OldbTeam; matchIsFinished: boolean; matchResults: OldbResult[];
  goals: OldbGoal[]; lastUpdateDateTime: string | null;
}

const fail = <T>(error: string): SourceResult<T> => ({ ok: false, error, source: ID });
const ok = <T>(data: T): SourceResult<T> => ({ ok: true, data, source: ID });

function toTeam(t: OldbTeam): Team {
  return { externalIds: { openligadb: String(t.teamId) }, name: t.teamName, shortName: t.shortName, logoUrl: t.teamIconUrl || null };
}

function toMatchday(g: OldbGroup): Matchday {
  return { number: g.groupOrderID, name: g.groupName };
}

function score(results: OldbResult[], typeId: number) {
  const r = results.find((x) => x.resultTypeID === typeId);
  return r ? { home: r.pointsTeam1, away: r.pointsTeam2 } : null;
}

function toMatch(m: OldbMatch): Match {
  const goals: Goal[] = (m.goals ?? []).map((g, i, all) => {
    // scoringTeamId fehlt manchmal: dann aus dem Spielstandwechsel ableiten
    let teamId = g.scoringTeamId ?? null;
    if (teamId == null) {
      const prev = i > 0 ? (all[i - 1] as unknown as { scoreTeam1: number }) : { scoreTeam1: 0 };
      teamId = (g as unknown as { scoreTeam1: number }).scoreTeam1 > prev.scoreTeam1 ? m.team1.teamId : m.team2.teamId;
    }
    return {
      minute: g.matchMinute ?? null,
      scorerName: g.goalGetterName ?? "",
      scorerExternalIds: g.goalGetterID ? { openligadb: String(g.goalGetterID) } : {},
      scoringTeamExternalIds: { openligadb: String(teamId) },
      isPenalty: !!g.isPenalty,
      isOwnGoal: !!g.isOwnGoal,
      isStoppageTime: !!g.isOvertime,
    };
  });
  return {
    externalIds: { openligadb: String(m.matchID) },
    season: m.leagueSeason,
    matchday: m.group.groupOrderID,
    kickoff: m.matchDateTimeUTC,
    home: toTeam(m.team1),
    away: toTeam(m.team2),
    isFinished: m.matchIsFinished,
    halftime: score(m.matchResults ?? [], 1),
    fulltime: score(m.matchResults ?? [], 2),
    goals,
    sourceUpdatedAt: m.lastUpdateDateTime,
  };
}

async function getList<T>(path: string): Promise<SourceResult<T[]>> {
  const r = await fetchJson(`${BASE}/${path}`);
  if (!r.ok) return fail(r.error);
  if (!Array.isArray(r.data)) return fail(`Unerwartetes Format von OpenLigaDB (${path})`);
  return ok(r.data as T[]);
}

export const openLigaDb: FixtureSource = {
  id: ID,

  async getTeams(season) {
    const r = await getList<OldbTeam>(`getavailableteams/${LEAGUE}/${season}`);
    return r.ok ? ok(r.data.map(toTeam)) : r;
  },

  async getMatchdays(season) {
    const r = await getList<OldbGroup>(`getavailablegroups/${LEAGUE}/${season}`);
    return r.ok ? ok(r.data.map(toMatchday)) : r;
  },

  async getCurrentMatchday() {
    const r = await fetchJson(`${BASE}/getcurrentgroup/${LEAGUE}`);
    if (!r.ok) return fail(r.error);
    const g = r.data as OldbGroup | null;
    if (!g || typeof g.groupOrderID !== "number") return fail("Unerwartetes Format von OpenLigaDB (getcurrentgroup)");
    return ok(toMatchday(g));
  },

  async getMatches(season, matchday) {
    const r = await getList<OldbMatch>(`getmatchdata/${LEAGUE}/${season}/${matchday}`);
    if (!r.ok) return r;
    try {
      return ok(r.data.map(toMatch));
    } catch (e) {
      return fail(`Spieldaten von OpenLigaDB nicht lesbar: ${e instanceof Error ? e.message : e}`);
    }
  },
};
