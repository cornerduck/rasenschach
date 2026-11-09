import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MatchdayHeader } from "@/components/MatchdayHeader";
import { formatKickoff, loadMatchday } from "@/lib/matchday/load";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ResetMatchday } from "@/components/ResetMatchday";
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

  return (
    <>
      <MatchdayHeader number={number} step="vorbereitung" />
      <LiveRefresh matchdayId={md.id} tables={[{ table: "theses", column: "matchday_id" }]} />
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
          number={number}
          questionValue={md.questionValue}
          knightCategory={md.knightCategory}
          thesisStarter={md.thesisStarter}
          thesesCount={ctx.theses.length}
          open={ctx.prepOpen}
          isAdmin={!!me?.isAdmin}
        />

        {me?.isAdmin && !md.closedAt && <ResetMatchday matchdayId={md.id} number={number} />}
      </main>
    </>
  );
}
