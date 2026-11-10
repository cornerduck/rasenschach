import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { loadMatchday } from "@/lib/matchday/load";
import { createClient } from "@/lib/supabase/server";

/** /spieltag/10 → passender Schritt (Thesen, Vorbereitung, Thesen-Draft, Spieler-Draft) */
export default function MatchdayHub({ params }: PageProps<"/spieltag/[nummer]">) {
  return (
    <Suspense fallback={null}>
      <Hub params={params} />
    </Suspense>
  );
}

async function Hub({ params }: { params: PageProps<"/spieltag/[nummer]">["params"] }): Promise<null> {
  const { nummer } = await params;
  const number = Number(nummer);
  if (!Number.isInteger(number)) notFound();
  const ctx = await loadMatchday(await createClient(), number);
  if (!ctx) notFound();
  const step = ctx.playerDraftStarted
    ? "spieler-draft"
    : ctx.draftStarted
      ? "thesen-draft"
      : ctx.theses.length < 12
        ? "thesen"
        : "vorbereitung";
  redirect(`/spieltag/${number}/${step}`);
}
