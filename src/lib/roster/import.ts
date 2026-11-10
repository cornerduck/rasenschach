import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RosterRow } from "./csv";
import { aliasMatches, matchScorer, normalizeName } from "./names";

/**
 * Kader-Import in zwei Schritten: erst planen (zeigt, was sich ändert, schreibt nichts),
 * dann ausführen. Bestehende Foto-URLs und Sofascore-IDs werden nur überschrieben,
 * wenn die CSV einen Wert enthält.
 */

interface Club { id: number; code: string; short_name: string; name: string }
interface ExistingEntry {
  player_id: number;
  club_id: number;
  position: string;
  shirt_number: number | null;
  is_active: boolean;
  players: { full_name: string; short_name: string; photo_url: string | null; external_ids: Record<string, string> };
}

export interface PlannedNew { row: RosterRow; clubId: number }
export interface PlannedUpdate { row: RosterRow; clubId: number; playerId: number; changes: string[] }

export interface RosterImportPlan {
  seasonId: number;
  errors: string[];
  newPlayers: PlannedNew[];
  updates: PlannedUpdate[];
  unchanged: number;
  deactivate: { playerId: number; name: string; club: string }[];
}

async function must<T extends { error: { message: string } | null }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(`Datenbank: ${r.error.message}`);
  return r;
}

export async function planRosterImport(db: SupabaseClient, season: number, rows: RosterRow[]): Promise<RosterImportPlan> {
  const { data: s } = await db.from("seasons").select("id").eq("start_year", season).maybeSingle();
  if (!s) throw new Error(`Saison ${season} gibt es noch nicht. Erst den Spielplan abgleichen.`);
  const seasonId: number = s.id;

  const { data: sc } = await must(
    db.from("season_clubs").select("clubs(id, code, short_name, name)").eq("season_id", seasonId),
  );
  const clubs = (sc as unknown as { clubs: Club }[]).map((x) => x.clubs);
  const clubByKey = new Map<string, Club>();
  for (const c of clubs) for (const k of [c.code, c.short_name, c.name]) clubByKey.set(normalizeName(k), c);
  const clubLabel = new Map(clubs.map((c) => [c.id, c.code]));

  const { data: ex } = await must(
    db
      .from("squad_memberships")
      .select("player_id, club_id, position, shirt_number, is_active, players(full_name, short_name, photo_url, external_ids)")
      .eq("season_id", seasonId),
  );
  const existing = ex as unknown as ExistingEntry[];
  const bySofascore = new Map<string, ExistingEntry>();
  const byName = new Map<string, ExistingEntry[]>();
  for (const e of existing) {
    const sid = e.players.external_ids?.sofascore;
    if (sid) bySofascore.set(sid, e);
    const k = normalizeName(e.players.full_name);
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }

  // Spieler mit Sofascore-ID, die noch in keinem Kader dieser Saison stehen (z. B. aus Vorsaison)
  const { data: allWithSofa } = await must(db.from("players").select("id, external_ids").not("external_ids->>sofascore", "is", null));
  const playerIdBySofascore = new Map<string, number>(allWithSofa!.map((p) => [p.external_ids.sofascore, p.id]));

  const plan: RosterImportPlan = { seasonId, errors: [], newPlayers: [], updates: [], unchanged: 0, deactivate: [] };
  const seen = new Set<number>();
  const csvClubs = new Set<number>();

  for (const row of rows) {
    const club = clubByKey.get(normalizeName(row.club));
    if (!club) {
      plan.errors.push(`Zeile ${row.line} (${row.fullName}): Verein „${row.club}“ unbekannt. Erlaubt: ${clubs.map((c) => c.code).sort().join(", ")}`);
      continue;
    }
    csvClubs.add(club.id);

    let match: ExistingEntry | undefined = row.sofascoreId ? bySofascore.get(row.sofascoreId) : undefined;
    if (!match) {
      const sameName = byName.get(normalizeName(row.fullName)) ?? [];
      if (sameName.length === 1) match = sameName[0];
      else if (sameName.length > 1) match = sameName.find((e) => e.club_id === club.id);
    }

    if (!match) {
      const known = row.sofascoreId ? playerIdBySofascore.get(row.sofascoreId) : undefined;
      if (known) plan.updates.push({ row, clubId: club.id, playerId: known, changes: ["neu im Kader dieser Saison"] });
      else plan.newPlayers.push({ row, clubId: club.id });
      continue;
    }
    if (seen.has(match.player_id)) {
      plan.errors.push(`Zeile ${row.line} (${row.fullName}): Spieler kommt mehrfach vor`);
      continue;
    }
    seen.add(match.player_id);

    const changes: string[] = [];
    if (match.club_id !== club.id) changes.push(`Verein ${clubLabel.get(match.club_id)} → ${club.code}`);
    if (match.position !== row.position) changes.push(`Position ${match.position} → ${row.position}`);
    if (match.shirt_number !== row.shirtNumber) changes.push(`Nummer ${match.shirt_number ?? "–"} → ${row.shirtNumber ?? "–"}`);
    if (!match.is_active) changes.push("wieder im Kader");
    if (match.players.short_name !== row.shortName) changes.push(`Kartenname → ${row.shortName}`);
    if (match.players.full_name !== row.fullName) changes.push(`Name → ${row.fullName}`);
    if (row.photoUrl && match.players.photo_url !== row.photoUrl) changes.push("Foto-URL");
    if (row.sofascoreId && match.players.external_ids?.sofascore !== row.sofascoreId) changes.push("Sofascore-ID");

    if (changes.length) plan.updates.push({ row, clubId: club.id, playerId: match.player_id, changes });
    else plan.unchanged++;
  }

  // Nicht mehr in der CSV, aber Verein ist in der CSV enthalten → aus dem Kader nehmen
  for (const e of existing) {
    if (e.is_active && csvClubs.has(e.club_id) && !seen.has(e.player_id)) {
      plan.deactivate.push({ playerId: e.player_id, name: e.players.full_name, club: clubLabel.get(e.club_id) ?? "?" });
    }
  }
  return plan;
}

export async function applyRosterImport(db: SupabaseClient, plan: RosterImportPlan): Promise<void> {
  const now = new Date().toISOString();
  const membership = (playerId: number, u: { row: RosterRow; clubId: number }) => ({
    season_id: plan.seasonId,
    player_id: playerId,
    club_id: u.clubId,
    position: u.row.position,
    shirt_number: u.row.shirtNumber,
    is_active: true,
    source: "csv",
    updated_at: now,
  });

  // Neue Spieler
  if (plan.newPlayers.length) {
    const { data } = await must(
      db
        .from("players")
        .insert(
          plan.newPlayers.map(({ row }) => ({
            full_name: row.fullName,
            short_name: row.shortName,
            photo_url: row.photoUrl,
            external_ids: row.sofascoreId ? { sofascore: row.sofascoreId } : {},
          })),
        )
        .select("id"),
    );
    await must(
      db.from("squad_memberships").insert(plan.newPlayers.map((n, i) => membership(data![i].id, n))),
    );
  }

  // Änderungen
  for (const u of plan.updates) {
    const { data: p } = await must(db.from("players").select("external_ids, photo_url").eq("id", u.playerId).single());
    await must(
      db
        .from("players")
        .update({
          full_name: u.row.fullName,
          short_name: u.row.shortName,
          photo_url: u.row.photoUrl ?? p!.photo_url,
          external_ids: u.row.sofascoreId ? { ...p!.external_ids, sofascore: u.row.sofascoreId } : p!.external_ids,
        })
        .eq("id", u.playerId),
    );
    await must(db.from("squad_memberships").upsert(membership(u.playerId, u), { onConflict: "season_id,player_id" }));
  }

  // Aus dem Kader genommen (bleibt für Historie erhalten)
  if (plan.deactivate.length) {
    await must(
      db
        .from("squad_memberships")
        .update({ is_active: false, updated_at: now })
        .eq("season_id", plan.seasonId)
        .in("player_id", plan.deactivate.map((d) => d.playerId)),
    );
  }

  await db.from("sync_runs").insert({
    source: "csv",
    kind: "kader",
    season_id: plan.seasonId,
    finished_at: now,
    ok: true,
    message: `${plan.newPlayers.length} neu, ${plan.updates.length} geändert, ${plan.deactivate.length} aus dem Kader genommen`,
  });
}

export interface OpenScorer {
  name: string;
  club: string;
  goals: number;
  /** leer = kein passender Spieler im Kader; sonst die möglichen Spieler */
  candidates: string[];
}

/** Liest die Kader einer Saison mit festen Zuordnungen (Alias), falls die Spalte schon existiert. */
async function loadSquadCandidates(db: SupabaseClient, seasonId: number) {
  type Row = { player_id: number; club_id: number; players: { full_name: string; short_name: string; external_ids: Record<string, string>; aliases?: string[] } };
  const withAliases = await db
    .from("squad_memberships")
    .select("player_id, club_id, players(full_name, short_name, external_ids, aliases)")
    .eq("season_id", seasonId);
  const res = withAliases.error
    ? await must(db.from("squad_memberships").select("player_id, club_id, players(full_name, short_name, external_ids)").eq("season_id", seasonId))
    : withAliases;
  type Cand = { playerId: number; fullName: string; shortName: string; aliases: string[]; ext: Record<string, string> };
  const byClub = new Map<number, Cand[]>();
  for (const m of res.data as unknown as Row[]) {
    const list = byClub.get(m.club_id) ?? [];
    list.push({
      playerId: m.player_id,
      fullName: m.players.full_name,
      shortName: m.players.short_name,
      aliases: m.players.aliases ?? [],
      ext: m.players.external_ids ?? {},
    });
    byClub.set(m.club_id, list);
  }
  return byClub;
}

/**
 * Ordnet noch nicht zugeordnete Torschützen (OpenLigaDB) Spielern zu: nur Spieler des Vereins,
 * für den das Tor zählt, und nur bei genau einem passenden Namen (feste Zuordnungen gehen vor).
 * Die Quell-ID wird am Spieler gespeichert, damit künftige Tore automatisch zugeordnet werden.
 * Mehrdeutige Fälle bleiben offen und werden mit den möglichen Spielern gemeldet.
 */
export async function assignScorers(
  db: SupabaseClient,
  seasonId: number,
  source = "openligadb",
): Promise<{ assigned: number; open: OpenScorer[] }> {
  const { data: goals } = await must(
    db
      .from("goals")
      .select("id, scorer_name_raw, scorer_external_id, scoring_club_id, matches!inner(matchdays!inner(season_id))")
      .is("player_id", null)
      .eq("is_own_goal", false)
      .eq("source", source)
      .eq("matches.matchdays.season_id", seasonId),
  );

  const byClub = await loadSquadCandidates(db, seasonId);
  const { data: clubs } = await must(db.from("clubs").select("id, code"));
  const clubCode = new Map(clubs!.map((c) => [c.id, c.code]));
  const label = (c: { fullName: string; playerId: number }) => `${c.fullName} (#${c.playerId})`;

  // Pro Torschütze (Quell-ID) einmal entscheiden
  const scorers = new Map<string, { name: string; clubId: number; goalIds: number[] }>();
  type GoalRow = { id: number; scorer_name_raw: string; scorer_external_id: string | null; scoring_club_id: number };
  for (const g of goals as unknown as GoalRow[]) {
    const key = g.scorer_external_id ?? `${g.scorer_name_raw}|${g.scoring_club_id}`;
    const s = scorers.get(key) ?? { name: g.scorer_name_raw, clubId: g.scoring_club_id, goalIds: [] };
    s.goalIds.push(g.id);
    scorers.set(key, s);
  }

  let assigned = 0;
  const open: OpenScorer[] = [];
  for (const [key, s] of scorers) {
    const m = matchScorer(s.name, byClub.get(s.clubId) ?? []);
    const club = clubCode.get(s.clubId) ?? "?";
    if (m.kind !== "eindeutig") {
      open.push({ name: s.name.trim(), club, goals: s.goalIds.length, candidates: m.kind === "mehrdeutig" ? m.players.map(label) : [] });
      continue;
    }
    const hit = m.player;
    // Spieler hat schon eine andere Quell-ID (die Quelle führt ihn doppelt): ohne feste
    // Zuordnung nicht raten; mit fester Zuordnung Tore zuordnen, erste ID bleibt am Spieler
    const otherId = !key.includes("|") && !!hit.ext[source] && hit.ext[source] !== key;
    if (otherId && !aliasMatches(s.name, hit)) {
      open.push({ name: s.name.trim(), club, goals: s.goalIds.length, candidates: [`${label(hit)}, hat aber schon eine andere OpenLigaDB-ID`] });
      continue;
    }
    if (!key.includes("|") && !otherId) {
      await must(db.from("players").update({ external_ids: { ...hit.ext, [source]: key } }).eq("id", hit.playerId));
      hit.ext = { ...hit.ext, [source]: key };
    }
    await must(db.from("goals").update({ player_id: hit.playerId }).in("id", s.goalIds));
    assigned += s.goalIds.length;
  }
  return { assigned, open };
}

/**
 * Feste Zuordnung speichern: Dieser Name aus der Quelle gehört zu diesem Spieler.
 * Spieler wird über Name (und optional Verein) im Kader der Saison gesucht.
 */
export async function addScorerAlias(
  db: SupabaseClient,
  seasonId: number,
  alias: string,
  playerQuery: string,
  clubCode?: string,
): Promise<{ ok: true; player: string } | { ok: false; error: string }> {
  const byClub = await loadSquadCandidates(db, seasonId);
  const { data: clubs } = await must(db.from("clubs").select("id, code"));
  const club = clubCode ? clubs!.find((c) => c.code.toUpperCase() === clubCode.toUpperCase()) : undefined;
  if (clubCode && !club) return { ok: false, error: `Verein „${clubCode}“ unbekannt` };
  const pool = club ? byClub.get(club.id) ?? [] : [...byClub.values()].flat();
  const asId = /^#?\d+$/.test(playerQuery.trim()) ? Number(playerQuery.replace("#", "")) : null;
  const q = normalizeName(playerQuery);
  const hits = asId != null ? pool.filter((p) => p.playerId === asId) : pool.filter((p) => normalizeName(p.fullName) === q || normalizeName(p.shortName) === q);
  if (hits.length === 0) return { ok: false, error: `Kein Spieler „${playerQuery}“${club ? ` bei ${club.code}` : ""} im Kader gefunden` };
  if (hits.length > 1) return { ok: false, error: `Mehrere Spieler „${playerQuery}“: ${hits.map((h) => `${h.fullName} (#${h.playerId})`).join(", ")}. Bitte mit --verein oder #Nummer eindeutig machen.` };
  const p = hits[0];
  const aliases = [...new Set([...p.aliases, alias.trim()])];
  const { error } = await db.from("players").update({ aliases }).eq("id", p.playerId);
  if (error) {
    return { ok: false, error: /aliases/.test(error.message) ? "Die Datenbank kennt feste Zuordnungen noch nicht. Bitte zuerst die neue Migration ausführen." : error.message };
  }
  return { ok: true, player: p.fullName };
}
