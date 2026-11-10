import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MatchdayHeader } from "@/components/MatchdayHeader";
import { MatchdayLive } from "@/components/MatchdayLive";
import { ResetPlayerDraft } from "@/components/ResetPlayerDraft";
import { StartDraftButton } from "@/components/StartDraftButton";
import { formatKickoff, loadMatchday } from "@/lib/matchday/load";
import type { Piece } from "@/lib/scoring/types";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ownLogoUrl } from "@/lib/ui/club";
import type { Position } from "@/lib/ui/pieces";
import { PlayerDraftBoard, type DraftClub, type DraftPlayer, type PlayerPick } from "./PlayerDraftBoard";

export const metadata: Metadata = { title: "Spieler-Draft · Rasenschach" };

export default function PlayerDraftPage({ params }: PageProps<"/spieltag/[nummer]/spieler-draft">) {
  return (
    <Suspense fallback={<main className="page"><div className="skeleton" style={{ minHeight: 520 }} /></main>}>
      <PlayerDraftContent params={params} />
    </Suspense>
  );
}

const other = (m: "bent" | "bjoern") => (m === "bent" ? "bjoern" : "bent");
const NAME = { bent: "Bent", bjoern: "Björn" } as const;

async function PlayerDraftContent({ params }: { params: PageProps<"/spieltag/[nummer]/spieler-draft">["params"] }) {
  const { nummer } = await params;
  const number = Number(nummer);
  if (!Number.isInteger(number)) notFound();
  const db = await createClient();
  const [ctx, me] = await Promise.all([loadMatchday(db, number), getMe()]);
  if (!ctx) notFound();
  const md = ctx.matchday;
  const locked = ctx.deadlinePassed || !!md.closedAt;

  // Noch nicht so weit: Thesen-Draft fertig machen bzw. Spieler-Draft starten
  if (ctx.thesisPickCount < 10 || !ctx.playerDraftStarted || !md.thesisStarter) {
    const ready = ctx.thesisPickCount >= 10 && !!md.thesisStarter && !locked;
    return (
      <>
        <MatchdayHeader number={number} step="spieler" />
        {/* wechselt live in den Draft, sobald der andere startet */}
        <MatchdayLive matchdayId={md.id} number={number} page="spieler-wartet" />
        <main className="page">
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <h1 className="panel-title">{ready ? "Spieler-Draft noch nicht gestartet" : "Noch nicht bereit"}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {ready
                ? `Der Thesen-Draft ist fertig. ${NAME[other(md.thesisStarter!)]} beginnt den Spieler-Draft. Wer startet, nimmt den anderen automatisch mit.`
                : locked
                  ? "Die Deadline ist vorbei, der Draft ist gesperrt."
                  : `Erst den Thesen-Draft abschließen (${ctx.thesisPickCount}/10 Thesen gesetzt).`}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Link className="btn btn-secondary" href={`/spieltag/${number}/thesen-draft`}>
                Zum Thesen-Draft
              </Link>
              {ready && <StartDraftButton matchdayId={md.id} number={number} kind="spieler" />}
            </div>
          </div>
        </main>
      </>
    );
  }

  const [squad, clubsRes, picksRes, usageRes, seasonRes] = await Promise.all([
    db
      .from("squad_memberships")
      .select("player_id, club_id, position, shirt_number, players(full_name, short_name, photo_url)")
      .eq("season_id", ctx.season.id)
      .eq("is_active", true)
      .limit(3000),
    db.from("season_clubs").select("clubs(id, code, short_name, color_primary, color_secondary, logo_url)").eq("season_id", ctx.season.id),
    db.from("player_picks").select("pick_no, manager, piece, player_id").eq("matchday_id", md.id).order("pick_no"),
    // Einsätze an anderen Spieltagen dieser Saison (für das 3er-Limit)
    db
      .from("player_picks")
      .select("manager, player_id, matchdays!inner(season_id)")
      .eq("matchdays.season_id", ctx.season.id)
      .neq("matchday_id", md.id)
      .limit(5000),
    db.from("seasons").select("rules").eq("id", ctx.season.id).single(),
  ]);
  if (squad.error) throw new Error(`Datenbank: ${squad.error.message}`);

  type SquadRow = {
    player_id: number;
    club_id: number;
    position: Position;
    shirt_number: number | null;
    players: { full_name: string; short_name: string; photo_url: string | null };
  };
  const clubs: DraftClub[] = ((clubsRes.data ?? []) as unknown as { clubs: { id: number; code: string; short_name: string; color_primary: string; color_secondary: string; logo_url: string | null } }[])
    .map(({ clubs: c }) => ({ id: c.id, code: c.code, name: c.short_name, primary: c.color_primary, secondary: c.color_secondary, logoUrl: ownLogoUrl(c.logo_url) }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  // Gegner dieses Spieltags pro Verein
  const opponent = new Map<number, string>();
  for (const m of ctx.matches) {
    opponent.set(m.home.id, `gegen ${m.away.code}`);
    opponent.set(m.away.id, `bei ${m.home.code}`);
  }

  const usage = new Map<number, { bent: number; bjoern: number }>();
  for (const u of (usageRes.data ?? []) as { manager: "bent" | "bjoern"; player_id: number }[]) {
    const x = usage.get(u.player_id) ?? { bent: 0, bjoern: 0 };
    x[u.manager]++;
    usage.set(u.player_id, x);
  }

  const players: DraftPlayer[] = ((squad.data ?? []) as unknown as SquadRow[]).map((r) => ({
    id: r.player_id,
    name: r.players.full_name,
    shortName: r.players.short_name,
    photoUrl: r.players.photo_url,
    clubId: r.club_id,
    position: r.position,
    number: r.shirt_number,
    used: usage.get(r.player_id) ?? { bent: 0, bjoern: 0 },
    opponent: opponent.get(r.club_id) ?? "spielt nicht",
  }));

  const picks: PlayerPick[] = (picksRes.data ?? []).map((p) => ({ pickNo: p.pick_no, manager: p.manager, piece: p.piece as Piece, playerId: p.player_id }));
  const limit = Number((seasonRes.data?.rules as { saisonlimit?: number } | null)?.saisonlimit ?? 3);
  const first = ctx.matches[0];

  return (
    <>
      <MatchdayHeader number={number} step="spieler" />
      <MatchdayLive matchdayId={md.id} number={number} page="spieler-draft" />
      <main className="page">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <h1 className="page-title">Spieler-Draft</h1>
          <span className="muted" style={{ fontSize: 13 }}>
            {ctx.deadline && `Deadline ${formatKickoff(ctx.deadline)}`}
            {first && ` · Anstoß ${first.home.code} – ${first.away.code}`}
          </span>
        </div>
        <PlayerDraftBoard
          matchdayId={md.id}
          me={me?.slot ?? null}
          first={other(md.thesisStarter)}
          knight={md.knightCategory}
          players={players}
          clubs={clubs}
          initialPicks={picks}
          limit={limit}
          locked={locked}
        />
        {me?.isAdmin && !md.closedAt && <ResetPlayerDraft matchdayId={md.id} number={number} />}
      </main>
    </>
  );
}
