import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MatchdayHeader } from "@/components/MatchdayHeader";
import { formatKickoff, loadMatchday } from "@/lib/matchday/load";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PrepBoard } from "./PrepBoard";

export const metadata: Metadata = { title: "Spielvorbereitung · Rasenschach" };

export default function PrepPage({ params }: PageProps<"/spieltag/[nummer]/vorbereitung">) {
  return (
    <Suspense fallback={<main className="page"><div className="skeleton" style={{ minHeight: 480 }} /></main>}>
      <PrepContent params={params} />
    </Suspense>
  );
}

async function PrepContent({ params }: { params: PageProps<"/spieltag/[nummer]/vorbereitung">["params"] }) {
  const { nummer } = await params;
  const number = Number(nummer);
  if (!Number.isInteger(number)) notFound();
  const db = await createClient();
  const [ctx, me] = await Promise.all([loadMatchday(db, number), getMe()]);
  if (!ctx) notFound();
  const md = ctx.matchday;

  const ready = [
    { label: `${ctx.theses.length}/12 Thesen`, done: ctx.theses.length === 12 },
    { label: "Startspieler", done: !!md.thesisStarter },
    { label: "?-Feld", done: !!md.questionValue },
    { label: "Springer-Feld", done: !!md.knightCategory },
  ];

  return (
    <>
      <MatchdayHeader number={number} step="vorbereitung" />
      <LiveRefresh
        matchdayId={md.id}
        tables={[
          { table: "matchdays", column: "id" },
          { table: "theses", column: "matchday_id" },
        ]}
      />
      <main className="page">
        <div>
          <h1 className="page-title">Spielvorbereitung</h1>
          <span className="muted">
            {ctx.deadline ? `Deadline ${formatKickoff(ctx.deadline)}` : "Noch kein Anstoß bekannt"}
            {!ctx.prepOpen && " · gesperrt (Draft begonnen oder Deadline vorbei)"}
          </span>
        </div>

        <PrepBoard
          matchdayId={md.id}
          questionValue={md.questionValue}
          knightCategory={md.knightCategory}
          thesisStarter={md.thesisStarter}
          open={ctx.prepOpen}
          isAdmin={!!me?.isAdmin}
        />

        <div className="prep-footer">
          <ul className="ready-list" aria-label="Bereit für den Draft">
            {ready.map((r) => (
              <li key={r.label} className={r.done ? "done" : "open"}>
                {r.done ? "✓" : "○"} {r.label}
              </li>
            ))}
          </ul>
          {ctx.theses.length < 12 && (
            <Link className="btn btn-secondary" href={`/spieltag/${number}/thesen`}>
              Zu den Thesen
            </Link>
          )}
          <span
            className="btn btn-bent"
            aria-disabled="true"
            title={ctx.prepComplete ? "Die Draft-Seite folgt als Nächstes" : "Erst alles vorbereiten"}
          >
            Thesen-Draft starten
          </span>
        </div>
      </main>
    </>
  );
}
