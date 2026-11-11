import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClubLogo } from "@/components/ClubLogo";
import { CloseMatchday } from "@/components/CloseMatchday";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { MatchdayHeader } from "@/components/MatchdayHeader";
import { MatchdayLive } from "@/components/MatchdayLive";
import { loadEvaluation, type EvalPlayer } from "@/lib/matchday/evaluation";
import { formatKickoff, loadMatchday, type MatchRow } from "@/lib/matchday/load";
import type { Manager, PlayerResult, ThesisResult } from "@/lib/scoring/assemble";
import { KNIGHT_CATEGORIES } from "@/lib/scoring/players";
import { THESIS_FIELD_ORDER, thesisPoints } from "@/lib/scoring/theses";
import type { QuestionValue, ThesisField } from "@/lib/scoring/types";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { clubLogo } from "@/lib/ui/club";
import { signed } from "@/lib/ui/evaluation";
import { PIECE_LABEL, PIECE_ORDER } from "@/lib/ui/pieces";
import { QUESTION_LABELS } from "@/lib/ui/prep-labels";
import { confirmableFor } from "@/lib/matchday/single-device";
import { ThesisConfirm } from "./ThesisConfirm";

export const metadata: Metadata = { title: "Spielfeld · Rasenschach" };

export default function FieldPage({ params }: PageProps<"/spieltag/[nummer]/spielfeld">) {
  return (
    <Suspense fallback={<main className="page"><div className="skeleton" style={{ minHeight: 520 }} /></main>}>
      <FieldContent params={params} />
    </Suspense>
  );
}

const NAME: Record<Manager, string> = { bent: "Bent", bjoern: "Björn" };
const FIELD_LABEL: Record<ThesisField, string> = { plus_minus_3: "+/−3", minus_plus_3: "−/+3", plus_1: "+1", minus_1: "−1", frage: "?-FELD" };

const STATUS_LABEL = {
  vorbereitung: "Vorbereitung",
  thesen_draft: "Thesen-Draft läuft",
  spieler_draft: "Vor dem Anstoß",
  laeuft: "Spieltag läuft · Punkte vorläufig",
  auswertung: "Alle Spiele beendet · Auswertung",
  abgeschlossen: "Abgeschlossen",
} as const;

async function FieldContent({ params }: { params: PageProps<"/spieltag/[nummer]/spielfeld">["params"] }) {
  const { nummer } = await params;
  const number = Number(nummer);
  if (!Number.isInteger(number)) notFound();
  const db = await createClient();
  const [ctx, me] = await Promise.all([loadMatchday(db, number), getMe()]);
  if (!ctx) notFound();
  const ev = await loadEvaluation(db, ctx);
  if (!ev) notFound();
  const { result: r } = ev;
  const md = ctx.matchday;
  const started = r.status === "laeuft" || r.status === "auswertung" || r.status === "abgeschlossen";
  const closed = r.status === "abgeschlossen";

  const playerCard = (m: Manager, p: PlayerResult | undefined, key: string) => {
    if (!p) {
      return (
        <div key={key} className={`field-card field-empty empty-${m}`}>
          <span className="faint">nicht gesetzt</span>
        </div>
      );
    }
    const info = ev.players.get(p.playerId);
    const lines = p.score.lines.filter((l) => l.points !== 0 || l.label === "Nicht eingesetzt" || l.label.endsWith("Gegentore"));
    return (
      <div key={key} className={`field-card card-${m}`}>
        <div className="field-card-top">
          <span className={`field-card-tag tag-${m}`}>{PIECE_LABEL[p.piece]}</span>
          <span className="field-card-meta with-logo">
            {info?.club && <ClubLogo club={info.club.logo} size={14} decorative fallback="dot" />}
            {info ? `${info.position ?? ""} · ${info.club?.code ?? ""}` : ""}
          </span>
        </div>
        <div className="field-card-player">
          {info && <Kit p={info} />}
          <span className="field-card-name">{(info?.shortName ?? `Spieler #${p.playerId}`).toUpperCase()}</span>
        </div>
        <div className="field-card-bottom">
          <span className="field-card-note">
            {!started ? "wartet auf Anstoß" : lines.length ? lines.map((l) => (l.points ? `${l.label} ${signed(l.points)}` : l.label)).join(" · ") : "ohne Ertrag"}
          </span>
          <span className={`field-pts ${ptsClass(p.score.points)}`}>{started ? signed(p.score.points) : "–"}</span>
        </div>
      </div>
    );
  };

  const thesisCard = (m: Manager, t: ThesisResult | undefined, key: string, field: ThesisField) => {
    if (!t) {
      return (
        <div key={key} className={`field-card field-empty empty-${m}`}>
          <span className="faint">nicht gesetzt</span>
        </div>
      );
    }
    const info = ev.theses.get(t.thesisId);
    const head = field === "frage" && md.questionValue ? `?-FELD ${QUESTION_LABELS[md.questionValue as QuestionValue]}` : FIELD_LABEL[field];
    const both = t.confirmedBent && t.confirmedBjoern;
    const waiting: Manager[] = t.outcome === null ? [] : (["bent", "bjoern"] as const).filter((x) => !(x === "bent" ? t.confirmedBent : t.confirmedBjoern));
    const tentative =
      t.outcome === null || (field === "frage" && !md.questionValue)
        ? null
        : thesisPoints(field, { outcome: t.outcome, confirmedBent: true, confirmedBjoern: true }, md.questionValue);
    const state = t.outcome === null ? "offen" : t.outcome ? "eingetroffen" : "nicht eingetroffen";
    // Für wen darf dieses Gerät bestätigen? (im Ein-Gerät-Modus der Admin auch für Björn)
    const canFor = closed ? [] : confirmableFor({ mySlot: me?.slot ?? null, isAdmin: !!me?.isAdmin, singleDevice: md.singleDevice }, waiting);
    const sharedNote = (["bent", "bjoern"] as const).filter((x) => (x === "bent" ? t.sharedBent : t.sharedBjoern));
    return (
      <div key={key} className={`field-card card-${m} ${t.outcome === null ? "" : both ? "is-resolved" : "is-pending"}`}>
        <div className="field-card-top">
          <span className={`field-card-tag tag-${m}`}>{head}</span>
          <span className="field-card-meta">{info?.label}</span>
        </div>
        <span className="field-thesis-text">{info?.text}</span>
        <div className="field-card-bottom">
          <span className="field-card-note">
            {state}
            {waiting.length > 0 && ` · wartet auf ${waiting.map((x) => NAME[x]).join(" und ")}`}
            {sharedNote.length > 0 && (
              <span className="shared-note"> · {sharedNote.map((x) => NAME[x]).join(" und ")} am gemeinsamen Gerät bestätigt</span>
            )}
          </span>
          <span className={`field-pts ${t.points !== null ? ptsClass(t.points) : "is-tentative"}`}>
            {t.points !== null ? signed(t.points) : tentative !== null ? `vorl. ${signed(tentative)}` : "–"}
          </span>
        </div>
        {canFor.map((x) => (
          <ThesisConfirm key={x} thesisId={t.thesisId} outcome={t.outcome!} as={x === me?.slot ? undefined : x} name={canFor.length > 1 || x !== me?.slot ? NAME[x] : undefined} />
        ))}
      </div>
    );
  };

  const playersRow = (m: Manager) => (
    <div className="draft-row">{PIECE_ORDER.map((piece) => playerCard(m, r[m].players.find((p) => p.piece === piece), piece))}</div>
  );
  const thesesRow = (m: Manager) => (
    <div className="draft-row">{THESIS_FIELD_ORDER.map((f) => thesisCard(m, r[m].theses.find((t) => t.field === f), f, f))}</div>
  );

  const knight = md.knightCategory ? KNIGHT_CATEGORIES[md.knightCategory].label : "–";
  const total = ev.season.bent + ev.season.bjoern;
  const share = total > 0 ? Math.round((ev.season.bent / total) * 100) : 50;

  return (
    <>
      <MatchdayHeader number={number} step="spielfeld" mode={{ matchdayId: ctx.matchday.id, on: ctx.matchday.singleDevice, isAdmin: !!me?.isAdmin }} />
      <MatchdayLive matchdayId={md.id} number={number} page="auswertung" />
      <main className="page">
        <div className="field-layout">
          <aside className="field-aside">
            <div className="panel field-score">
              <div className="field-score-head">
                <span className="label-small">SPIELTAG {String(number).padStart(2, "0")}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <div className="field-score-pair">
                {(["bent", "bjoern"] as const).map((m) => (
                  <div key={m} className={`field-score-side side-${m}`}>
                    <span className="label-small">{NAME[m].toUpperCase()}</span>
                    <span className="field-score-big">{signed(r[m].total)}</span>
                    <span className="field-score-sub">
                      {closed && r.winner === m ? "Spieltagssieg" : `Thesen ${signed(r[m].thesisPoints)} · Spieler ${signed(r[m].playerPoints)}`}
                    </span>
                  </div>
                ))}
              </div>
              {closed && !r.winner && <span className="muted" style={{ fontSize: 12 }}>Unentschieden</span>}
              <div className="field-total">
                <span className="label-small muted">
                  GESAMT NACH {ev.season.played} {ev.season.played === 1 ? "SPIELTAG" : "SPIELTAGEN"}
                </span>
                <div className="field-total-row">
                  <span style={{ color: "var(--bent-light)" }}>Bent</span>
                  <strong>{ev.season.bent}</strong>
                </div>
                <div className="field-total-bar" aria-hidden="true">
                  <div style={{ width: `${share}%`, background: "var(--bent)" }} />
                  <div style={{ width: `${100 - share}%`, background: "var(--bjoern)" }} />
                </div>
                <div className="field-total-row">
                  <span style={{ color: "var(--bjoern-light)" }}>Björn</span>
                  <strong>{ev.season.bjoern}</strong>
                </div>
              </div>
            </div>
            <div className="panel field-fixtures">
              <span className="label-small muted">SPIELE</span>
              {ctx.matches.map((m) => (
                <Fixture key={m.id} m={m} now={ctx.now} />
              ))}
              <span className="faint" style={{ fontSize: 11 }}>
                Spielplan, Ergebnisse und Torschützen automatisch von OpenLigaDB
              </span>
            </div>
          </aside>

          <section className="field-main">
            <div className="field-title">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h1 className="page-title">Spielfeld</h1>
                <span className="muted" style={{ fontSize: 13 }}>
                  ?-Feld diese Woche {md.questionValue ? QUESTION_LABELS[md.questionValue] : "–"} · Springer diese Woche {knight}
                </span>
              </div>
              {me?.isAdmin && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Link className="btn btn-secondary" href={`/spieltag/${number}/werte`}>
                    Werte eintragen
                  </Link>
                  {started && <CloseMatchday matchdayId={md.id} closed={closed} canClose={r.status === "auswertung"} />}
                </div>
              )}
            </div>
            {started && (r.missingLeagueStats.length > 0 || r.unassignedScorers > 0 || r.bent.openTheses + r.bjoern.openTheses > 0) && !closed && (
              <p className="muted field-hints">
                Noch offen: {[
                  r.bent.openTheses + r.bjoern.openTheses > 0 && `${r.bent.openTheses + r.bjoern.openTheses} Thesen nicht von beiden bestätigt`,
                  r.missingLeagueStats.length > 0 && `${r.missingLeagueStats.length} ligaweite Werte nicht eingetragen`,
                  r.unassignedScorers > 0 && `${r.unassignedScorers} Torschützen ohne Zuordnung`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <div className="draft-scroll">
              <div className="draft-board">
                {playersRow("bent")}
                {thesesRow("bent")}
                <div className="vs-bar">
                  <div className={`vs-side vs-bent ${closed && r.winner === "bent" ? "is-turn" : ""}`}>
                    <span className="vs-state">{signed(r.bent.total)} Punkte</span>
                    <span className="vs-name">BENT</span>
                  </div>
                  <div className="vs-mid">VS</div>
                  <div className={`vs-side vs-bjoern ${closed && r.winner === "bjoern" ? "is-turn" : ""}`}>
                    <span className="vs-name">BJÖRN</span>
                    <span className="vs-state">{signed(r.bjoern.total)} Punkte</span>
                  </div>
                </div>
                {thesesRow("bjoern")}
                {playersRow("bjoern")}
              </div>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Thesen zählen erst, wenn beide das Ergebnis bestätigt haben („vorl.“ = vorläufig). Punkte aktualisieren sich live.
            </span>
          </section>
        </div>
      </main>
    </>
  );
}

const ptsClass = (n: number) => (n > 0 ? "is-plus" : n < 0 ? "is-minus" : "is-zero");

function Kit({ p }: { p: EvalPlayer }) {
  return (
    <PlayerAvatar
      photoUrl={p.photoUrl}
      primary={p.club?.primary ?? "#2A312E"}
      secondary={p.club?.secondary ?? "#ECEFED"}
      number={p.number}
      size={52}
      jerseyWidth={46}
    />
  );
}

function Fixture({ m, now }: { m: MatchRow; now: number }) {
  const hasScore = m.home_goals !== null && m.away_goals !== null;
  const live = !m.is_finished && Date.parse(m.kickoff) <= now;
  return (
    <div className="fixture">
      <span className="fixture-team with-logo">
        <ClubLogo club={clubLogo(m.home)} size={18} decorative fallback="dot" />
        {m.home.code}
      </span>
      <span className={`fixture-score ${live ? "is-live" : ""} ${hasScore ? "" : "is-time"}`} title={live ? "läuft" : undefined}>
        {hasScore ? `${m.home_goals} : ${m.away_goals}` : formatKickoff(m.kickoff)}
      </span>
      <span className="fixture-team with-logo" style={{ justifyContent: "flex-end" }}>
        {m.away.code}
        <ClubLogo club={clubLogo(m.away)} size={18} decorative fallback="dot" />
      </span>
    </div>
  );
}
