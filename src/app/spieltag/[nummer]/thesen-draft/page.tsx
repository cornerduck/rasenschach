import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MatchdayHeader } from "@/components/MatchdayHeader";
import { ResetMatchday } from "@/components/ResetMatchday";
import { formatKickoff, loadMatchday } from "@/lib/matchday/load";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DraftBoard, type DraftPick } from "./DraftBoard";

export const metadata: Metadata = { title: "Thesen-Draft · Rasenschach" };

export default function ThesisDraftPage({ params }: PageProps<"/spieltag/[nummer]/thesen-draft">) {
  return (
    <Suspense fallback={<main className="page"><div className="skeleton" style={{ minHeight: 520 }} /></main>}>
      <DraftContent params={params} />
    </Suspense>
  );
}

async function DraftContent({ params }: { params: PageProps<"/spieltag/[nummer]/thesen-draft">["params"] }) {
  const { nummer } = await params;
  const number = Number(nummer);
  if (!Number.isInteger(number)) notFound();
  const db = await createClient();
  const [ctx, me] = await Promise.all([loadMatchday(db, number), getMe()]);
  if (!ctx) notFound();
  const md = ctx.matchday;

  if (!ctx.prepComplete || !md.thesisStarter || !md.questionValue) {
    return (
      <>
        <MatchdayHeader number={number} step="draft" />
        <main className="page">
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <h1 className="panel-title">Noch nicht bereit</h1>
            <p className="muted" style={{ margin: 0 }}>
              Für den Thesen-Draft braucht es 12 Thesen, den Startspieler und beide Räder.
            </p>
            <Link className="btn btn-bent" href={`/spieltag/${number}/vorbereitung`}>
              Zur Spielvorbereitung
            </Link>
          </div>
        </main>
      </>
    );
  }

  const { data: pickRows } = await db
    .from("thesis_picks")
    .select("pick_no, manager, field, thesis_id")
    .eq("matchday_id", md.id)
    .order("pick_no");
  const picks: DraftPick[] = (pickRows ?? []).map((p) => ({ pickNo: p.pick_no, manager: p.manager, field: p.field, thesisId: p.thesis_id }));
  const matchById = new Map(ctx.matches.map((m) => [m.id, m]));
  const first = ctx.matches[0];

  return (
    <>
      <MatchdayHeader number={number} step="draft" />
      <main className="page">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <h1 className="page-title">Thesen-Draft</h1>
          <span className="muted" style={{ fontSize: 13 }}>
            {ctx.deadline && `Deadline ${formatKickoff(ctx.deadline)}`}
            {first && ` · Anstoß ${first.home.code} – ${first.away.code}`}
          </span>
        </div>
        <DraftBoard
          matchdayId={md.id}
          number={number}
          me={me?.slot ?? null}
          starter={md.thesisStarter}
          questionValue={md.questionValue}
          theses={ctx.theses.map((t) => {
            const m = t.match_id ? matchById.get(t.match_id) : null;
            return { id: t.id, sortOrder: t.sort_order, text: t.text, label: m ? `${m.home.code} · ${m.away.code}` : "SPIELTAG" };
          })}
          initialPicks={picks}
          locked={ctx.deadlinePassed || !!md.closedAt}
        />
        {me?.isAdmin && !md.closedAt && <ResetMatchday matchdayId={md.id} number={number} />}
      </main>
    </>
  );
}
