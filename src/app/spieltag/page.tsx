import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSeasonStandings } from "@/lib/scoring/repository";
import { currentSeason } from "@/lib/matchday/load";
import { createClient } from "@/lib/supabase/server";
import { continueMatchday } from "@/lib/ui/season-tiles";

/** /spieltag → aktueller Spieltag */
export default function CurrentMatchday() {
  return (
    <Suspense fallback={null}>
      <Current />
    </Suspense>
  );
}

async function Current(): Promise<null> {
  const db = await createClient();
  const season = await currentSeason(db);
  if (!season) redirect("/");
  const standings = await getSeasonStandings(db, season.start_year);
  const next = standings ? continueMatchday(standings.matchdays) : null;
  redirect(next ? `/spieltag/${next}` : "/");
}
