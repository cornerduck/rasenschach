import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MatchdayLive } from "@/components/MatchdayLive";
import { ClubLogo } from "@/components/ClubLogo";
import { MatchdayHeader } from "@/components/MatchdayHeader";
import { clubLogo } from "@/lib/ui/club";
import { formatKickoff, loadMatchday, type MatchdayContext } from "@/lib/matchday/load";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { DraftThesis } from "@/lib/theses/parse";
import { ThesesEditor } from "./ThesesEditor";

export const metadata: Metadata = { title: "Thesen · Rasenschach" };

export default function ThesesPage({ params }: PageProps<"/spieltag/[nummer]/thesen">) {
  return (
    <Suspense fallback={<main className="page"><div className="skeleton" style={{ minHeight: 400 }} /></main>}>
      <ThesesContent params={params} />
    </Suspense>
  );
}

const matchLabel = (m: MatchdayContext["matches"][number]) => `${m.home.short_name} – ${m.away.short_name} · ${formatKickoff(m.kickoff)}`;

async function ThesesContent({ params }: { params: PageProps<"/spieltag/[nummer]/thesen">["params"] }) {
  const { nummer } = await params;
  const number = Number(nummer);
  if (!Number.isInteger(number)) notFound();
  const db = await createClient();
  const [ctx, me] = await Promise.all([loadMatchday(db, number), getMe()]);
  if (!ctx) notFound();

  const editable = !!me?.isAdmin && ctx.prepOpen;
  const clubs = new Map<number, { id: number; code: string; name: string; shortName: string }>();
  for (const m of ctx.matches) for (const c of [m.home, m.away]) clubs.set(c.id, { id: c.id, code: c.code, name: c.name, shortName: c.short_name });

  const initial: DraftThesis[] = ctx.theses.map((t) => ({ text: t.text, kind: t.kind, matchId: t.match_id, matchSource: null }));

  return (
    <>
      <MatchdayHeader number={number} step="thesen" />
      <MatchdayLive matchdayId={ctx.matchday.id} number={number} page="thesen" started={ctx.draftStarted} />
      <main className="page">
        <div>
          <h1 className="page-title">Thesen Spieltag {number}</h1>
          <span className="muted">
            {ctx.theses.length}/12 eingetragen
            {ctx.deadline && ` · Deadline ${formatKickoff(ctx.deadline)}`}
            {!ctx.prepOpen && " · gesperrt (Draft begonnen oder Deadline vorbei)"}
          </span>
        </div>

        {editable ? (
          <ThesesEditor
            matchdayId={ctx.matchday.id}
            number={number}
            matches={ctx.matches.map((m) => ({ id: m.id, homeClubId: m.home.id, awayClubId: m.away.id, label: matchLabel(m) }))}
            clubs={[...clubs.values()]}
            initial={initial}
          />
        ) : (
          <ThesesReadOnly ctx={ctx} isAdmin={!!me?.isAdmin} />
        )}
      </main>
    </>
  );
}

function ThesesReadOnly({ ctx, isAdmin }: { ctx: MatchdayContext; isAdmin: boolean }) {
  if (ctx.theses.length === 0) {
    return (
      <div className="panel">
        <p className="muted" style={{ margin: 0 }}>
          {isAdmin ? "Keine Thesen eingetragen." : "Bent hat die Thesen für diesen Spieltag noch nicht eingetragen."}
        </p>
      </div>
    );
  }
  const matchById = new Map(ctx.matches.map((m) => [m.id, m]));
  const day = ctx.theses.filter((t) => t.kind === "spieltag");
  const game = ctx.theses.filter((t) => t.kind === "spiel");
  return (
    <div className="theses-layout">
      <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="panel-title">Spieltagsthesen</h2>
        <ol className="thesis-list">
          {day.map((t) => (
            <li key={t.id}>
              <span className="thesis-no">{t.sort_order}</span>
              {t.text}
            </li>
          ))}
        </ol>
      </section>
      <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="panel-title">Thesen zu den Spielen</h2>
        <ol className="thesis-list">
          {game.map((t) => {
            const m = t.match_id ? matchById.get(t.match_id) : null;
            return (
              <li key={t.id}>
                <span className="thesis-no">{t.sort_order}</span>
                <span>
                  {m && (
                    <span className="label-small muted with-logo" style={{ display: "flex" }}>
                      <ClubLogo club={clubLogo(m.home)} size={14} decorative fallback="dot" />
                      {m.home.code} – {m.away.code}
                      <ClubLogo club={clubLogo(m.away)} size={14} decorative fallback="dot" />
                    </span>
                  )}
                  {t.text}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      {ctx.theses.length === 12 && (
        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
          <Link className="btn btn-bent" href={`/spieltag/${ctx.matchday.number}/vorbereitung`}>
            Zur Spielvorbereitung
          </Link>
        </div>
      )}
    </div>
  );
}
