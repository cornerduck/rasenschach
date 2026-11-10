import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SeasonLive } from "@/components/SeasonLive";
import { AppHeader } from "@/components/AppHeader";
import { SeasonSelect } from "@/components/SeasonSelect";
import { getSeasonStandings } from "@/lib/scoring/repository";
import { seasonStats } from "@/lib/stats/season-stats";
import { createClient } from "@/lib/supabase/server";
import { continueMatchday, seasonTiles, type Tile } from "@/lib/ui/season-tiles";

export const metadata: Metadata = { title: "Saison · Rasenschach" };

export default function SeasonPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <AppHeader active="saison" />
      <main className="page">
        <Suspense fallback={<SeasonSkeleton />}>
          <SeasonOverview searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

async function SeasonOverview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const db = await createClient();
  const { data: seasons, error } = await db.from("seasons").select("id, start_year, name, is_archived").order("start_year", { ascending: false });
  if (error) return <p className="error-box">Saisons konnten nicht geladen werden: {error.message}</p>;
  if (!seasons?.length) {
    return (
      <div className="panel">
        <h1 className="panel-title">Noch keine Saison</h1>
        <p className="muted">Bent muss zuerst den Spielplan abgleichen.</p>
      </div>
    );
  }

  const requested = Number(params.saison);
  const season =
    seasons.find((s) => s.start_year === requested) ?? seasons.find((s) => !s.is_archived) ?? seasons[0];
  const standings = await getSeasonStandings(db, season.start_year);
  const results = standings?.matchdays ?? [];
  const tiles = seasonTiles(results);
  const stats = seasonStats(results);
  const closed = stats.closedCount;
  const running = stats.perMatchday.find((m) => m.provisional);
  const next = season.is_archived ? null : continueMatchday(results);
  const archived = seasons.filter((s) => s.is_archived);
  const archivedStandings = await Promise.all(archived.map((s) => getSeasonStandings(db, s.start_year)));

  return (
    <>
      {!season.is_archived && <SeasonLive seasonId={season.id} />}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 className="page-title">Saisonübersicht</h1>
          <span className="muted">
            {closed} {closed === 1 ? "Spieltag" : "Spieltage"} gewertet
            {season.is_archived && " · archiviert"}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <SeasonSelect seasons={seasons.map((s) => ({ year: s.start_year, name: s.name }))} current={season.start_year} />
          {next !== null && (
            <Link className="btn btn-bent" href={`/spieltag/${next}`}>
              Spieltag {next} fortsetzen
            </Link>
          )}
        </div>
      </div>

      <section className="standing" aria-label="Gesamtstand">
        <div className="standing-side side-bent">
          <span className="label-small">BENT{stats.leader === "bent" ? " · FÜHRT" : ""}</span>
          <span className="standing-big">{stats.totals.bent}</span>
        </div>
        <div className="standing-mid">
          <span className="standing-vs">:</span>
        </div>
        <div className="standing-side side-bjoern" style={{ textAlign: "right" }}>
          <span className="label-small">{stats.leader === "bjoern" ? "FÜHRT · " : ""}BJÖRN</span>
          <span className="standing-big">{stats.totals.bjoern}</span>
        </div>
        <div className="standing-record">
          <span>
            Siege <strong style={{ color: "var(--bent-light)" }}>Bent {stats.wins.bent}</strong> ·{" "}
            <strong style={{ color: "var(--bjoern-light)" }}>Björn {stats.wins.bjoern}</strong> · Unentschieden {stats.draws}
          </span>
          {running ? (
            <span className="muted">
              ST {String(running.number).padStart(2, "0")} läuft (vorläufig, zählt noch nicht): Bent {signed(running.bent)} · Björn {signed(running.bjoern)}
            </span>
          ) : (
            <span className="muted">Gesamtstand aus abgeschlossenen Spieltagen</span>
          )}
          <Link href={season.is_archived ? `/statistik?saison=${season.start_year}` : "/statistik"}>Zur Statistik</Link>
        </div>
      </section>

      <div className="tiles">
        {tiles.map((t) => (
          <MatchdayTile key={t.number} tile={t} />
        ))}
      </div>

      <section id="archiv" className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="panel-title">Vergangene Saisons</h2>
        {archived.length === 0 ? (
          <span className="muted">
            Noch keine abgeschlossene Saison. Nach dem 34. Spieltag landet {seasons.find((s) => !s.is_archived)?.name ?? "die Saison"} hier im Archiv.
          </span>
        ) : (
          <ul className="archive-list">
            {archived.map((s, i) => {
              const st = archivedStandings[i];
              return (
                <li key={s.start_year}>
                  <a href={`/?saison=${s.start_year}`}>{s.name}</a>
                  <span className="muted">
                    <span style={{ color: "var(--bent-light)" }}>Bent {st?.bent ?? 0}</span> :{" "}
                    <span style={{ color: "var(--bjoern-light)" }}>Björn {st?.bjoern ?? 0}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function MatchdayTile({ tile }: { tile: Tile }) {
  const badgeColor = {
    bent: "var(--bent-light)",
    bjoern: "var(--bjoern-light)",
    amber: "var(--amber)",
    muted: "var(--text-muted)",
    faint: "var(--text-faint)",
  }[tile.badgeColor];
  return (
    <Link className={`tile tile-${tile.kind} tile-link`} href={`/spieltag/${tile.number}`} aria-label={`Spieltag ${tile.number} öffnen`}>
      <div className="tile-top">
        <span className="tile-number">ST {String(tile.number).padStart(2, "0")}</span>
        {tile.badge && (
          <span className="tile-badge" style={{ color: badgeColor }}>
            {tile.badge}
          </span>
        )}
      </div>
      {tile.points ? (
        <div className="tile-points">
          <div>
            <span style={{ color: "var(--bent-light)", fontWeight: tile.points.winner === "bent" ? 700 : 400 }}>Bent</span>
            <strong>{signed(tile.points.bent)}</strong>
          </div>
          <div>
            <span style={{ color: "var(--bjoern-light)", fontWeight: tile.points.winner === "bjoern" ? 700 : 400 }}>Björn</span>
            <strong>{signed(tile.points.bjoern)}</strong>
          </div>
        </div>
      ) : (
        <span className="tile-hint">{tile.hint}</span>
      )}
    </Link>
  );
}

function SeasonSkeleton() {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="page-title">Saisonübersicht</h1>
        <span className="faint">Lade Spieltage …</span>
      </div>
      <div className="tiles" aria-hidden="true">
        {Array.from({ length: 34 }, (_, i) => (
          <div key={i} className="skeleton" style={{ minHeight: 108 }} />
        ))}
      </div>
    </>
  );
}
