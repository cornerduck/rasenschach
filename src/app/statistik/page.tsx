import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SeasonLive } from "@/components/SeasonLive";
import { formatKickoff } from "@/lib/matchday/load";
import { getSeasonStandings } from "@/lib/scoring/repository";
import { THESIS_FIELD_ORDER } from "@/lib/scoring/theses";
import type { ThesisField } from "@/lib/scoring/types";
import { formatRate, seasonStats, type MatchdayPoints } from "@/lib/stats/season-stats";
import { createClient } from "@/lib/supabase/server";
import { clubLogo } from "@/lib/ui/club";
import { PIECE_LABEL, PIECE_ORDER } from "@/lib/ui/pieces";
import { BestPerformances, DraftedPlayers, type PlayerLabel } from "./StatsLists";

export const metadata: Metadata = { title: "Statistik · Rasenschach" };

export default function StatsPage({ searchParams }: PageProps<"/statistik">) {
  return (
    <>
      <AppHeader active="statistik" />
      <main className="page">
        <Suspense fallback={<div className="skeleton" style={{ minHeight: 520 }} />}>
          <Stats searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");
const avg = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const FIELD_LABEL: Record<ThesisField, string> = { plus_minus_3: "+/−3", minus_plus_3: "−/+3", plus_1: "+1", minus_1: "−1", frage: "?-Feld" };
const pieceName = (p: string) => p.charAt(0) + p.slice(1).toLowerCase();

async function Stats({ searchParams }: { searchParams: PageProps<"/statistik">["searchParams"] }) {
  const params = await searchParams;
  const db = await createClient();
  const { data: seasons } = await db.from("seasons").select("id, start_year, name, is_archived, rules").order("start_year", { ascending: false });
  const season = seasons?.find((s) => s.start_year === Number(params.saison)) ?? seasons?.find((s) => !s.is_archived) ?? seasons?.[0];
  if (!season) return <p className="muted">Noch keine Saison.</p>;

  const standings = await getSeasonStandings(db, season.start_year);
  const s = seasonStats(standings?.matchdays ?? []);
  const limit = Number((season.rules as { saisonlimit?: number } | null)?.saisonlimit ?? 3);

  // Namen der gedrafteten Spieler
  const ids = s.drafted.map((d) => d.playerId);
  const players: Record<number, PlayerLabel> = {};
  if (ids.length) {
    const { data } = await db
      .from("squad_memberships")
      .select("player_id, position, players(full_name), clubs(code, color_primary, color_secondary, logo_url)")
      .eq("season_id", season.id)
      .in("player_id", ids);
    type Row = { player_id: number; position: string; players: { full_name: string }; clubs: { code: string; color_primary: string; color_secondary: string; logo_url: string | null } };
    for (const r of (data ?? []) as unknown as Row[]) {
      players[r.player_id] = { name: r.players.full_name, meta: `${r.position} · ${r.clubs.code}`, club: clubLogo(r.clubs) };
    }
  }

  const running = s.perMatchday.find((m) => m.provisional);
  const leaderText = (m: "bent" | "bjoern") =>
    s.leader === m ? "FÜHRT" : s.leader === null ? "GLEICHSTAND" : `−${s.lead}`;

  return (
    <>
      {!season.is_archived && <SeasonLive seasonId={season.id} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className="page-title">Statistik</h1>
        <span className="muted">
          Saison {season.name} · {s.closedCount} {s.closedCount === 1 ? "Spieltag" : "Spieltage"} abgeschlossen · nur abgeschlossene Spieltage zählen
        </span>
      </div>

      <div className="kpi-row">
        {(["bent", "bjoern"] as const).map((m) => (
          <div key={m} className={`kpi kpi-${m}`}>
            <span className="label-small">
              {m === "bent" ? "BENT" : "BJÖRN"} · {leaderText(m)}
            </span>
            <span className="kpi-big">{s.totals[m]}</span>
            <span className="kpi-sub">
              Ø {avg(s.average[m])} pro Spieltag · {s.wins[m]} {s.wins[m] === 1 ? "Spieltagssieg" : "Spieltagssiege"}
            </span>
          </div>
        ))}
        <div className="kpi">
          <span className="label-small muted">NOCH ZU SPIELEN</span>
          <span className="kpi-big">{s.remaining}</span>
          <span className="kpi-sub">
            Spieltage{s.nextDeadline ? ` · nächster Draft vor ${formatKickoff(s.nextDeadline)}` : ""} · {s.draws} Unentschieden
          </span>
        </div>
      </div>
      {running && (
        <p className="provisional-note">
          ST {String(running.number).padStart(2, "0")} läuft: Bent {signed(running.bent)} · Björn {signed(running.bjoern)}. Vorläufig, zählt erst nach dem Abschluss.
        </p>
      )}

      <section className="panel stats-panel">
        <div className="stats-head">
          <h2 className="panel-title">Punkte pro Spieltag</h2>
          <span className="legend">
            <span className="legend-swatch sw-bent" /> Bent
            <span className="legend-swatch sw-bjoern" /> Björn
            {running && (
              <>
                <span className="legend-swatch sw-prov" /> vorläufig
              </>
            )}
          </span>
        </div>
        <PointsChart days={s.perMatchday} />
        <details className="table-toggle">
          <summary>Als Tabelle</summary>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">Spieltag</th>
                  <th scope="col" className="num">Bent</th>
                  <th scope="col" className="num">Björn</th>
                  <th scope="col">Sieger</th>
                </tr>
              </thead>
              <tbody>
                {s.perMatchday.map((d) => (
                  <tr key={d.number}>
                    <th scope="row">ST {String(d.number).padStart(2, "0")}{d.provisional ? " (vorläufig)" : ""}</th>
                    <td className="num">{signed(d.bent)}</td>
                    <td className="num">{signed(d.bjoern)}</td>
                    <td>{d.provisional ? "–" : d.winner === "bent" ? "Bent" : d.winner === "bjoern" ? "Björn" : "unentschieden"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="stats-grid">
        <section className="panel stats-panel">
          <h2 className="panel-title">Punkte nach Feld</h2>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">Feld</th>
                  <th scope="col" className="num">Bent</th>
                  <th scope="col" className="num">Björn</th>
                </tr>
              </thead>
              <tbody>
                {THESIS_FIELD_ORDER.map((f) => (
                  <CompareRow key={f} label={`These ${FIELD_LABEL[f]}`} v={s.byThesisField[f]} />
                ))}
                <CompareRow label="Thesen gesamt" v={s.thesisTotal} strong />
                {PIECE_ORDER.map((p) => (
                  <CompareRow key={p} label={pieceName(PIECE_LABEL[p])} v={s.byPiece[p]} />
                ))}
                <CompareRow
                  label="Spieler gesamt"
                  v={{
                    bent: PIECE_ORDER.reduce((a, p) => a + s.byPiece[p].bent, 0),
                    bjoern: PIECE_ORDER.reduce((a, p) => a + s.byPiece[p].bjoern, 0),
                  }}
                  strong
                />
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel stats-panel">
          <h2 className="panel-title">Thesen-Trefferquote</h2>
          <span className="stat-input-hint">
            Richtig gelegen: auf +/−3, +1 und ?-Feld mit Plus-Wert eingetroffen, auf −/+3, −1 und ?-Feld −3 nicht eingetroffen. Nur von beiden bestätigte Thesen.
          </span>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">Feld</th>
                  <th scope="col" className="num">Bent</th>
                  <th scope="col" className="num">Björn</th>
                </tr>
              </thead>
              <tbody>
                {THESIS_FIELD_ORDER.map((f) => (
                  <tr key={f}>
                    <th scope="row">{FIELD_LABEL[f]}</th>
                    <td className="num">{formatRate(s.hitRate.byField[f].bent)}</td>
                    <td className="num">{formatRate(s.hitRate.byField[f].bjoern)}</td>
                  </tr>
                ))}
                <tr className="row-strong">
                  <th scope="row">Gesamt</th>
                  <td className="num">{formatRate(s.hitRate.overall.bent)}</td>
                  <td className="num">{formatRate(s.hitRate.overall.bjoern)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel stats-panel">
          <h2 className="panel-title">Beste Einzelleistungen</h2>
          <span className="stat-input-hint">Meiste Punkte einer Figur an einem Spieltag</span>
          <BestPerformances rows={s.performances} players={players} />
        </section>

        <section className="panel stats-panel">
          <h2 className="panel-title">Meistgedraftete Spieler</h2>
          <span className="stat-input-hint">
            Einsätze pro Person fürs {limit}er-Limit. Zählt jeden Draft, auch am laufenden Spieltag und ohne Einsatz. Punkte nur aus abgeschlossenen Spieltagen.
          </span>
          <DraftedPlayers rows={s.drafted} players={players} limit={limit} />
        </section>
      </div>
    </>
  );
}

function CompareRow({ label, v, strong }: { label: string; v: { bent: number; bjoern: number }; strong?: boolean }) {
  return (
    <tr className={strong ? "row-strong" : undefined}>
      <th scope="row">{label}</th>
      <td className={`num ${v.bent > v.bjoern ? "is-ahead" : ""}`}>{signed(v.bent)}</td>
      <td className={`num ${v.bjoern > v.bent ? "is-ahead" : ""}`}>{signed(v.bjoern)}</td>
    </tr>
  );
}

/** Balken pro Spieltag für beide; Nulllinie, negative Werte nach unten, vorläufige blass */
function PointsChart({ days }: { days: MatchdayPoints[] }) {
  if (days.length === 0) return <p className="faint">Noch kein abgeschlossener Spieltag.</p>;
  const H = 180;
  const max = Math.max(1, ...days.flatMap((d) => [d.bent, d.bjoern]));
  const min = Math.min(0, ...days.flatMap((d) => [d.bent, d.bjoern]));
  const span = max - min;
  const zero = (max / span) * H;
  const bar = (v: number, who: "bent" | "bjoern", prov: boolean, n: number) => {
    const h = Math.max(2, (Math.abs(v) / span) * H);
    const top = v >= 0 ? zero - h : zero;
    return (
      <div className="chart-col" title={`ST ${n} · ${who === "bent" ? "Bent" : "Björn"} ${signed(v)}${prov ? " (vorläufig)" : ""}`}>
        <span className="chart-val" style={{ top: v >= 0 ? top - 18 : top + h + 2 }}>
          {signed(v)}
        </span>
        <div className={`chart-bar bar-${who} ${prov ? "is-prov" : ""} ${v < 0 ? "is-neg" : ""}`} style={{ top, height: h }} />
      </div>
    );
  };
  return (
    <div className="chart-scroll">
      <div className="chart" style={{ minWidth: days.length * 64 }} role="img" aria-label="Punkte pro Spieltag, Bent und Björn">
        <div className="chart-plot" style={{ height: H + 36, paddingTop: 18 }}>
          <div className="chart-zero" style={{ top: zero + 18 }} />
          {days.map((d) => (
            <div key={d.number} className="chart-group" style={{ height: H }}>
              {bar(d.bent, "bent", d.provisional, d.number)}
              {bar(d.bjoern, "bjoern", d.provisional, d.number)}
            </div>
          ))}
        </div>
        <div className="chart-axis">
          {days.map((d) => (
            <span key={d.number}>
              ST {String(d.number).padStart(2, "0")}
              {d.provisional ? " vorl." : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
