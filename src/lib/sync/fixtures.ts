import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fixtureSource, type Match, type Team } from "@/lib/datasource";
import { assignScorers } from "@/lib/roster/import";
import { CLUB_DEFAULTS } from "./club-defaults";

/**
 * Gleicht Saison, Vereine, Spieltage, Spiele und Tore aus der Spielplan-Quelle
 * (heute OpenLigaDB) mit der Datenbank ab. Darf beliebig oft laufen.
 *
 * - Handeingaben bleiben unangetastet (Vereinsfarben, Kürzel, Zuordnung Torschütze → Spieler).
 * - Verlegte Spiele bekommen den neuen Anstoß; der ursprüngliche bleibt für die Deadline gespeichert.
 * - Tore pro Spieler landen als Messwert "goals" mit Herkunft der Quelle in stat_values
 *   (per Hand überschreibbar).
 *
 * Erwartet einen Client mit geheimem Schlüssel (createAdminClient).
 */
export interface FixtureSyncResult {
  ok: boolean;
  message: string;
  clubs?: number;
  matches?: number;
  goals?: number;
  unmatchedScorers?: number;
}

const SOURCE = fixtureSource.id;

export async function syncFixtures(db: SupabaseClient, season: number): Promise<FixtureSyncResult> {
  const { data: run } = await db
    .from("sync_runs")
    .insert({ source: SOURCE, kind: "spielplan" })
    .select("id")
    .single();

  const finish = async (result: FixtureSyncResult, seasonId?: number) => {
    if (run) {
      await db
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), ok: result.ok, message: result.message, season_id: seasonId ?? null })
        .eq("id", run.id);
    }
    return result;
  };

  try {
    // 1. Daten bei der Quelle holen
    const [teams, matches] = await Promise.all([
      fixtureSource.getTeams(season),
      fixtureSource.getSeasonMatches(season),
    ]);
    if (!teams.ok) return finish({ ok: false, message: teams.error });
    if (!matches.ok) return finish({ ok: false, message: matches.error });
    if (teams.data.length === 0) return finish({ ok: false, message: `Keine Vereine für Saison ${season}` });

    // 2. Saison
    const seasonId = await upsertSeason(db, season);

    // 3. Vereine
    const clubIds = await upsertClubs(db, teams.data);
    await must(
      db.from("season_clubs").upsert(
        [...clubIds.values()].map((club_id) => ({ season_id: seasonId, club_id })),
        { onConflict: "season_id,club_id", ignoreDuplicates: true },
      ),
    );

    // 4. Spieltage 1–34
    const numbers = [...new Set(matches.data.map((m) => m.matchday))];
    await must(
      db.from("matchdays").upsert(
        numbers.map((number) => ({ season_id: seasonId, number })),
        { onConflict: "season_id,number", ignoreDuplicates: true },
      ),
    );
    const { data: mdRows } = await must(db.from("matchdays").select("id, number").eq("season_id", seasonId));
    const matchdayIds = new Map<number, number>(mdRows!.map((r) => [r.number, r.id]));

    // 5. Spiele
    const matchIds = await upsertMatches(db, matches.data, matchdayIds, clubIds);

    // 6. Tore und Tor-Messwerte
    let goalStats = await syncGoals(db, matches.data, matchIds, clubIds, matchdayIds);

    // 7. Neue Torschützen ohne bekannte Quell-ID per Name im Kader zuordnen, dann Tor-Messwerte neu
    if (goalStats.unmatched > 0) {
      const named = await assignScorers(db, seasonId, SOURCE);
      if (named.assigned > 0) goalStats = await syncGoals(db, matches.data, matchIds, clubIds, matchdayIds);
    }

    const finished = matches.data.filter((m) => m.isFinished).length;
    return finish(
      {
        ok: true,
        message:
          `${clubIds.size} Vereine, ${matches.data.length} Spiele (${finished} beendet), ${goalStats.goals} Tore` +
          (goalStats.unmatched ? `, ${goalStats.unmatched} Torschützen noch keinem Spieler zugeordnet` : ""),
        clubs: clubIds.size,
        matches: matches.data.length,
        goals: goalStats.goals,
        unmatchedScorers: goalStats.unmatched,
      },
      seasonId,
    );
  } catch (e) {
    return finish({ ok: false, message: e instanceof Error ? e.message : String(e) });
  }
}

// ---------------------------------------------------------------------------

/** Wirft bei Datenbankfehlern eine verständliche Ausnahme. */
async function must<T extends { error: { message: string } | null }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(`Datenbank: ${r.error.message}`);
  return r;
}

const ext = (ids: { [k: string]: string | undefined }) => ids[SOURCE];

async function upsertSeason(db: SupabaseClient, season: number): Promise<number> {
  const name = `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
  const { data } = await must(
    db.from("seasons").upsert({ start_year: season, name }, { onConflict: "start_year", ignoreDuplicates: false }).select("id").single(),
  );
  return data!.id;
}

/** Legt fehlende Vereine an; bei bestehenden wird nur das Logo ergänzt, falls leer. Gibt Quell-ID → DB-ID zurück. */
async function upsertClubs(db: SupabaseClient, teams: Team[]): Promise<Map<string, number>> {
  const { data: existing } = await must(db.from("clubs").select("id, external_ids, logo_url"));
  const byExt = new Map<string, { id: number; logo_url: string | null }>();
  for (const c of existing!) {
    const id = c.external_ids?.[SOURCE];
    if (id) byExt.set(id, c);
  }

  const result = new Map<string, number>();
  for (const t of teams) {
    const eid = ext(t.externalIds)!;
    const found = byExt.get(eid);
    if (found) {
      if (!found.logo_url && t.logoUrl) await must(db.from("clubs").update({ logo_url: t.logoUrl }).eq("id", found.id));
      result.set(eid, found.id);
      continue;
    }
    const d = CLUB_DEFAULTS[eid];
    const { data } = await must(
      db
        .from("clubs")
        .insert({
          name: t.name,
          short_name: t.shortName,
          code: d?.code ?? t.shortName.replace(/[^A-Za-zÄÖÜäöü0-9]/g, "").slice(0, 3).toUpperCase(),
          logo_url: t.logoUrl,
          color_primary: d?.primary ?? "#444444",
          color_secondary: d?.secondary ?? "#FFFFFF",
          external_ids: { [SOURCE]: eid },
        })
        .select("id")
        .single(),
    );
    result.set(eid, data!.id);
  }
  return result;
}

/** Spiele anlegen bzw. aktualisieren. Gibt Quell-ID → DB-ID zurück. */
async function upsertMatches(
  db: SupabaseClient,
  matches: Match[],
  matchdayIds: Map<number, number>,
  clubIds: Map<string, number>,
): Promise<Map<string, number>> {
  const mdIds = [...matchdayIds.values()];
  const { data: existing } = await must(db.from("matches").select("id, external_ids").in("matchday_id", mdIds));
  const byExt = new Map<string, number>();
  for (const m of existing!) {
    const id = m.external_ids?.[SOURCE];
    if (id) byExt.set(id, m.id);
  }

  const now = new Date().toISOString();
  const toRow = (m: Match) => ({
    matchday_id: matchdayIds.get(m.matchday)!,
    home_club_id: clubIds.get(ext(m.home.externalIds)!)!,
    away_club_id: clubIds.get(ext(m.away.externalIds)!)!,
    kickoff: m.kickoff,
    is_finished: m.isFinished,
    home_goals_ht: m.halftime?.home ?? null,
    away_goals_ht: m.halftime?.away ?? null,
    home_goals: m.fulltime?.home ?? null,
    away_goals: m.fulltime?.away ?? null,
    source_updated_at: m.sourceUpdatedAt ? new Date(m.sourceUpdatedAt + (m.sourceUpdatedAt.endsWith("Z") ? "" : "Z")).toISOString() : null,
    fetched_at: now,
  });

  const result = new Map<string, number>();
  const inserts: Match[] = [];
  for (const m of matches) {
    const eid = ext(m.externalIds)!;
    const id = byExt.get(eid);
    if (id) {
      await must(db.from("matches").update(toRow(m)).eq("id", id));
      result.set(eid, id);
    } else {
      inserts.push(m);
    }
  }
  if (inserts.length) {
    const { data } = await must(
      db
        .from("matches")
        .insert(inserts.map((m) => ({ ...toRow(m), external_ids: { [SOURCE]: ext(m.externalIds) } })))
        .select("id, external_ids"),
    );
    for (const r of data!) result.set(r.external_ids[SOURCE], r.id);
  }
  return result;
}

/**
 * Tore abgleichen. Bereits zugeordnete Torschützen (player_id) bleiben erhalten.
 * Neue Tore werden über die Quell-ID des Schützen einem Spieler zugeordnet, falls bekannt.
 * Danach werden die Tore pro Spieler und Spieltag als Messwert "goals" gespeichert.
 */
async function syncGoals(
  db: SupabaseClient,
  matches: Match[],
  matchIds: Map<string, number>,
  clubIds: Map<string, number>,
  matchdayIds: Map<number, number>,
): Promise<{ goals: number; unmatched: number }> {
  const { data: players } = await must(db.from("players").select("id, external_ids"));
  const playerByExt = new Map<string, number>();
  for (const p of players!) {
    const id = p.external_ids?.[SOURCE];
    if (id) playerByExt.set(id, p.id);
  }

  const relevant = matches.filter((m) => m.goals.length > 0 || m.isFinished);
  const dbMatchIds = relevant.map((m) => matchIds.get(ext(m.externalIds)!)!);

  // Vorhandene Zuordnungen merken
  const { data: existing } = await must(
    db.from("goals").select("id, external_id, player_id").eq("source", SOURCE).in("match_id", dbMatchIds.length ? dbMatchIds : [-1]),
  );
  const assigned = new Map<string, number | null>(existing!.map((g) => [g.external_id, g.player_id]));

  const rows = relevant.flatMap((m) =>
    m.goals.map((g) => {
      const goalExt = ext(g.externalIds)!;
      const scorerExt = ext(g.scorerExternalIds) ?? null;
      return {
        match_id: matchIds.get(ext(m.externalIds)!)!,
        minute: g.minute,
        scoring_club_id: clubIds.get(ext(g.scoringTeamExternalIds)!)!,
        player_id: assigned.get(goalExt) ?? (scorerExt ? playerByExt.get(scorerExt) ?? null : null),
        scorer_name_raw: g.scorerName,
        scorer_external_id: scorerExt,
        is_penalty: g.isPenalty,
        is_own_goal: g.isOwnGoal,
        is_stoppage_time: g.isStoppageTime,
        source: SOURCE,
        external_id: goalExt,
      };
    }),
  );

  if (rows.length) await must(db.from("goals").upsert(rows, { onConflict: "source,external_id" }));

  // Von der Quelle gelöschte Tore (Korrekturen) entfernen
  const keep = new Set(rows.map((r) => r.external_id));
  const stale = existing!.filter((g) => !keep.has(g.external_id)).map((g) => g.id);
  if (stale.length) await must(db.from("goals").delete().in("id", stale));

  // Messwert "goals" pro Spieler und Spieltag (Eigentore zählen nicht)
  const matchdayOfMatch = new Map<number, number>();
  for (const m of relevant) matchdayOfMatch.set(matchIds.get(ext(m.externalIds)!)!, matchdayIds.get(m.matchday)!);

  const counts = new Map<string, { matchday_id: number; player_id: number; match_id: number; value: number }>();
  for (const r of rows) {
    if (r.is_own_goal || r.player_id == null) continue;
    const md = matchdayOfMatch.get(r.match_id)!;
    const key = `${md}:${r.player_id}`;
    const c = counts.get(key) ?? { matchday_id: md, player_id: r.player_id, match_id: r.match_id, value: 0 };
    c.value++;
    counts.set(key, c);
  }

  const affectedMatchdays = [...new Set(matchdayOfMatch.values())];
  if (affectedMatchdays.length) {
    // Alte Quell-Werte neu schreiben (Handeingaben bleiben, sie haben source = 'manual')
    await must(
      db.from("stat_values").delete().eq("source", SOURCE).eq("stat_key", "goals").in("matchday_id", affectedMatchdays),
    );
    if (counts.size) {
      await must(
        db.from("stat_values").insert(
          [...counts.values()].map((c) => ({ ...c, stat_key: "goals", source: SOURCE })),
        ),
      );
    }
  }

  return {
    goals: rows.length,
    unmatched: rows.filter((r) => r.player_id == null && !r.is_own_goal).length,
  };
}
