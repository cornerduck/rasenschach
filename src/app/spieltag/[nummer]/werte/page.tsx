import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CloseMatchday } from "@/components/CloseMatchday";
import { MatchdayHeader } from "@/components/MatchdayHeader";
import { MatchdayLive } from "@/components/MatchdayLive";
import { loadEvaluation } from "@/lib/matchday/evaluation";
import { loadMatchday } from "@/lib/matchday/load";
import { RESULT_SOURCE, teamConceded, type Manager, type PlayerResult } from "@/lib/scoring/assemble";
import { leagueTopN } from "@/lib/scoring/league";
import { THESIS_FIELD_ORDER } from "@/lib/scoring/theses";
import type { ThesisField } from "@/lib/scoring/types";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { leagueKeysFor, leagueLabel, leagueUnit, signed, statKeysFor, statMeta } from "@/lib/ui/evaluation";
import { PIECE_LABEL, PIECE_ORDER } from "@/lib/ui/pieces";
import { QUESTION_LABELS } from "@/lib/ui/prep-labels";
import { LeagueEditor, StatInput, ThesisResolver, WeeklySelect, type LeagueEntryModel, type ValueModel } from "./WerteForms";

export const metadata: Metadata = { title: "Werte eintragen · Rasenschach" };

export default function ValuesPage({ params }: PageProps<"/spieltag/[nummer]/werte">) {
  return (
    <Suspense fallback={<main className="page"><div className="skeleton" style={{ minHeight: 520 }} /></main>}>
      <ValuesContent params={params} />
    </Suspense>
  );
}

const NAME: Record<Manager, string> = { bent: "Bent", bjoern: "Björn" };
const FIELD_LABEL: Record<ThesisField, string> = { plus_minus_3: "+/−3", minus_plus_3: "−/+3", plus_1: "+1", minus_1: "−1", frage: "?-Feld" };
const SOURCE_LABEL: Record<string, string> = { openligadb: "OpenLigaDB", sofascore: "Sofascore", csv: "CSV", [RESULT_SOURCE]: "aus dem Ergebnis" };

async function ValuesContent({ params }: { params: PageProps<"/spieltag/[nummer]/werte">["params"] }) {
  const { nummer } = await params;
  const number = Number(nummer);
  if (!Number.isInteger(number)) notFound();
  const db = await createClient();
  const [ctx, me] = await Promise.all([loadMatchday(db, number), getMe()]);
  if (!ctx) notFound();
  const md = ctx.matchday;

  if (!me?.isAdmin) {
    return (
      <>
        <MatchdayHeader number={number} step="spielfeld" />
        <main className="page">
          <div className="panel">
            <h1 className="panel-title">Nur für Bent</h1>
            <p className="muted">Werte trägt der Admin ein. Die Punkte siehst du live auf dem Spielfeld.</p>
            <Link className="btn btn-secondary" href={`/spieltag/${number}/spielfeld`}>
              Zum Spielfeld
            </Link>
          </div>
        </main>
      </>
    );
  }

  const ev = await loadEvaluation(db, ctx);
  if (!ev) notFound();
  const r = ev.result;
  const closed = r.status === "abgeschlossen";
  const picks: (PlayerResult & { manager: Manager })[] = (["bent", "bjoern"] as const).flatMap((m) =>
    PIECE_ORDER.map((piece) => r[m].players.find((p) => p.piece === piece)).filter((p): p is PlayerResult => !!p).map((p) => ({ ...p, manager: m })),
  );
  const ids = picks.map((p) => p.playerId);

  const [statsRes, ranksRes] = await Promise.all([
    ids.length
      ? db.from("stat_values").select("player_id, stat_key, value, source").eq("matchday_id", md.id).in("player_id", ids)
      : Promise.resolve({ data: [] as { player_id: number; stat_key: string; value: number; source: string }[] }),
    db.from("league_ranks").select("stat_key, rank, player_id, player_name, value").eq("matchday_id", md.id).order("rank"),
  ]);
  const stats = (statsRes.data ?? []) as { player_id: number; stat_key: string; value: number; source: string }[];
  const statOf = (pid: number, key: string, manual: boolean) => {
    const rows = stats.filter((s) => s.player_id === pid && s.stat_key === key && (s.source === "manual") === manual);
    const order = ["sofascore", "openligadb", "csv"];
    rows.sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source));
    return rows[0] ?? null;
  };

  const rawMatches = ctx.matches.map((m) => ({
    kickoff: m.kickoff,
    originalKickoff: m.original_kickoff,
    isFinished: m.is_finished,
    homeClubId: m.home.id,
    awayClubId: m.away.id,
    homeGoals: m.home_goals,
    awayGoals: m.away_goals,
  }));

  const valuesFor = (p: PlayerResult): ValueModel[] => {
    const club = ev.players.get(p.playerId)?.club?.id ?? null;
    return statKeysFor(p.piece, md.knightCategory).map((key) => {
      const meta = statMeta(key);
      const auto = statOf(p.playerId, key, false);
      const manual = statOf(p.playerId, key, true);
      let autoValue = auto ? Number(auto.value) : null;
      let autoSource = auto ? SOURCE_LABEL[auto.source] ?? auto.source : null;
      if (autoValue === null && key === "goals_conceded_on_pitch") {
        const c = teamConceded(rawMatches, club);
        if (c !== null) [autoValue, autoSource] = [c, "aus dem Ergebnis"];
      }
      if (autoValue === null && key === "goals" && teamConceded(rawMatches, club) !== null) [autoValue, autoSource] = [0, "OpenLigaDB"];
      return { key, ...meta, auto: autoValue, autoSource, manual: manual ? Number(manual.value) : null };
    });
  };

  const weeklyOf = (pid: number): "keins" | "team" | "spieler" => {
    const pow = statOf(pid, "player_of_week", true) ?? statOf(pid, "player_of_week", false);
    if (pow && Number(pow.value) > 0) return "spieler";
    const tow = statOf(pid, "team_of_week", true) ?? statOf(pid, "team_of_week", false);
    return tow && Number(tow.value) > 0 ? "team" : "keins";
  };

  // Thesen: nur die 10 gesetzten, in Feldreihenfolge
  const theses = (["bent", "bjoern"] as const).flatMap((m) =>
    THESIS_FIELD_ORDER.map((f) => r[m].theses.find((t) => t.field === f)).filter((t) => !!t).map((t) => ({ ...t!, manager: m })),
  );
  const confirmed = theses.filter((t) => t.outcome !== null && t.confirmedBent && t.confirmedBjoern).length;

  // Ligaweite Werte, die diese Woche gebraucht werden
  const leagueKeys = [...new Set(picks.flatMap((p) => leagueKeysFor(p.piece, md.knightCategory)))];
  const pieceOrder = (k: string) => ["goals", "scorer_points", "goals_prevented", "distance_km", "sprints"].indexOf(k);
  leagueKeys.sort((a, b) => (pieceOrder(a) === -1 ? 99 : pieceOrder(a)) - (pieceOrder(b) === -1 ? 99 : pieceOrder(b)));
  const ranks = (ranksRes.data ?? []) as { stat_key: string; rank: number; player_id: number | null; player_name: string | null; value: number | null }[];
  const options = picks.map((p) => ({ playerId: p.playerId, label: `${ev.players.get(p.playerId)?.name ?? "#" + p.playerId} (${NAME[p.manager]}, ${PIECE_LABEL[p.piece]})` }));

  const finished = ctx.matches.filter((m) => m.is_finished).length;
  const checklist = [
    { ok: finished === ctx.matches.length && ctx.matches.length > 0, text: `Spiele beendet: ${finished} von ${ctx.matches.length}${finished < ctx.matches.length ? " (Nachholspiele abwarten)" : ""}` },
    { ok: confirmed === theses.length, text: `Thesen von beiden bestätigt: ${confirmed} von ${theses.length}` },
    { ok: r.missingLeagueStats.length === 0, text: r.missingLeagueStats.length ? `Ligaweit fehlt noch: ${r.missingLeagueStats.map(leagueLabel).join(", ")}` : "Ligaweite Werte eingetragen" },
    { ok: r.unassignedScorers === 0, text: r.unassignedScorers ? `${r.unassignedScorers} Torschützen ohne Zuordnung (npm run torschuetzen)` : "Alle Torschützen zugeordnet" },
  ];

  return (
    <>
      <MatchdayHeader number={number} step="spielfeld" />
      <MatchdayLive matchdayId={md.id} number={number} page="auswertung" />
      <main className="page">
        <div className="field-title">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h1 className="page-title">
              Werte eintragen <span className="chip-admin">ADMIN</span>
            </h1>
            <span className="muted" style={{ fontSize: 13 }}>
              Tore, Ergebnisse und Torschützen kommen automatisch von OpenLigaDB. Alles andere trägst du hier ein. Jeder Wert ist per Hand überschreibbar.
            </span>
            <span className="legend">
              <span className="src-badge src-auto">auto</span> automatisch
              <span className="src-badge src-manual">Hand</span> per Hand
              <span className="src-badge src-missing">fehlt</span> noch nicht eingetragen
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Link className="btn btn-secondary" href={`/spieltag/${number}/spielfeld`}>
              Zum Spielfeld
            </Link>
            {(r.status === "laeuft" || r.status === "auswertung" || closed) && (
              <CloseMatchday matchdayId={md.id} closed={closed} canClose={r.status === "auswertung"} />
            )}
          </div>
        </div>
        {closed && <p className="muted">Der Spieltag ist abgeschlossen. Zum Ändern erst „Wieder öffnen“.</p>}

        <div className="values-layout">
          <section className="panel values-theses">
            <div className="values-head">
              <h2 className="panel-title">Thesen auflösen</h2>
              <span className="muted" style={{ fontSize: 12 }}>
                {confirmed} von {theses.length} bestätigt
              </span>
            </div>
            <p className="stat-input-hint" style={{ margin: 0 }}>
              Dein Klick zählt als deine Bestätigung. Björn bestätigt auf dem Spielfeld.
            </p>
            {theses.map((t) => {
              const info = ev.theses.get(t.thesisId);
              const fl = t.field === "frage" && md.questionValue ? `?-Feld ${QUESTION_LABELS[md.questionValue]}` : FIELD_LABEL[t.field];
              return (
                <div key={t.thesisId} className="resolve-row">
                  <div className="resolve-text">
                    <span>
                      <span style={{ color: `var(--${t.manager}-light)`, fontWeight: 600 }}>{NAME[t.manager]}</span> · {fl} · <span className="muted">{info?.label}</span>
                    </span>
                    <span>{info?.text}</span>
                  </div>
                  <div className="resolve-actions">
                    <ThesisResolver thesisId={t.thesisId} outcome={t.outcome} locked={closed} />
                    <span className={t.confirmedBent ? "ok-bent" : "faint"}>Bent {t.confirmedBent ? "✓" : "offen"}</span>
                    <span className={t.confirmedBjoern ? "ok-bjoern" : "faint"}>Björn {t.confirmedBjoern ? "✓" : "offen"}</span>
                    <span className="resolve-pts">{t.points !== null ? signed(t.points) : ""}</span>
                  </div>
                </div>
              );
            })}
            {theses.length === 0 && <span className="faint">Noch keine Thesen gesetzt.</span>}
          </section>

          <section className="values-right">
            <div className="panel">
              <h2 className="panel-title">Spielerwerte</h2>
              <div className="values-players">
                {picks.map((p) => {
                  const info = ev.players.get(p.playerId);
                  return (
                    <div key={p.playerId} className={`value-row row-${p.manager}`}>
                      <div className="value-who">
                        <span className="value-name">{info?.name ?? `Spieler #${p.playerId}`}</span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          <span style={{ color: `var(--${p.manager}-light)` }}>{NAME[p.manager]}</span> · {PIECE_LABEL[p.piece]} · {info?.position} · {info?.club?.code}
                        </span>
                      </div>
                      <div className="value-inputs">
                        {valuesFor(p).map((v) => (
                          <StatInput key={v.key} matchdayId={md.id} playerId={p.playerId} v={v} locked={closed} />
                        ))}
                        <WeeklySelect matchdayId={md.id} playerId={p.playerId} value={weeklyOf(p.playerId)} locked={closed} />
                      </div>
                      <div className="value-points">
                        <span className="value-pts">{signed(p.score.points)}</span>
                        <span className="stat-input-hint">
                          {p.score.lines.map((l) => (l.points ? `${l.label} ${signed(l.points)}` : l.label)).join(" · ") || "noch keine Punkte"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {picks.length === 0 && <span className="faint">Noch keine Spieler gesetzt.</span>}
              </div>
            </div>

            <div className="panel">
              <h2 className="panel-title">Ligaweit</h2>
              <p className="stat-input-hint" style={{ margin: "0 0 8px" }}>
                Verglichen wird mit allen Bundesligaspielern. Trag die Besten mit ihrem Wert ein, auch wenn sie bei uns nicht gesetzt sind. Die
                Plätze rechnet das Tool: Gleichstand teilt sich den Platz, danach kommt der übernächste (1, 1, 3). Wert 0 bringt keinen Platz.
              </p>
              <div className="values-league">
                {leagueKeys.map((key) => (
                  <LeagueEditor
                    key={key}
                    matchdayId={md.id}
                    statKey={key}
                    title={leagueLabel(key)}
                    unit={leagueUnit(key)}
                    topN={leagueTopN(key)}
                    options={options}
                    entries={ranks
                      .filter((x) => x.stat_key === key)
                      .map((x): LeagueEntryModel => ({ playerId: x.player_id, name: x.player_name ?? "", value: x.value === null ? null : Number(x.value), rank: x.rank }))}
                    locked={closed}
                    note={key === "goals" ? "Automatisch aus allen Toren des Spieltags (OpenLigaDB). Nur eintragen, um zu überschreiben." : undefined}
                  />
                ))}
                {leagueKeys.length === 0 && <span className="faint">Noch keine Spieler gesetzt.</span>}
              </div>
            </div>

            <div className="panel">
              <h2 className="panel-title">Abschluss</h2>
              <ul className="checklist">
                {checklist.map((c) => (
                  <li key={c.text} className={c.ok ? "is-ok" : "is-open"}>
                    {c.ok ? "✓" : "○"} {c.text}
                  </li>
                ))}
              </ul>
              <p className="stat-input-hint" style={{ margin: 0 }}>
                Abschließen geht erst, wenn alle Spiele beendet und alle Thesen von beiden bestätigt sind. Danach zählt der Spieltagssieg in der Statistik.
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
