import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { loadMatchday } from "@/lib/matchday/load";
import { createClient } from "@/lib/supabase/server";

/** /spieltag/10 → passender Schritt (Thesen, Vorbereitung, später Draft und Spielfeld) */
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
  redirect(`/spieltag/${number}/${ctx.theses.length < 12 ? "thesen" : ctx.prepComplete ? "thesen-draft" : "vorbereitung"}`);
}
