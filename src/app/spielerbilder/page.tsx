import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { currentSeason } from "@/lib/matchday/load";
import { ownPhotoUrl } from "@/lib/photos/files";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { clubLogo } from "@/lib/ui/club";
import { PhotoManager, type PhotoPlayer } from "./PhotoManager";

export const metadata: Metadata = { title: "Spielerbilder · Rasenschach" };

export default function PhotosPage() {
  return (
    <>
      <AppHeader active="saison" />
      <main className="page">
        <Suspense fallback={<div className="skeleton" style={{ minHeight: 400 }} />}>
          <Photos />
        </Suspense>
      </main>
    </>
  );
}

async function Photos() {
  const db = await createClient();
  const [me, season] = await Promise.all([getMe(), currentSeason(db)]);
  if (!me?.isAdmin) {
    return (
      <div className="panel">
        <h1 className="panel-title">Nur für Bent</h1>
        <Link href="/">Zur Saisonübersicht</Link>
      </div>
    );
  }
  if (!season) return <p className="muted">Noch keine Saison.</p>;

  type Row = {
    player_id: number;
    position: string;
    shirt_number: number | null;
    players: { full_name: string; photo_url: string | null };
    clubs: { code: string; short_name: string; color_primary: string; color_secondary: string; logo_url: string | null };
  };
  const [squad, picks] = await Promise.all([
    db
      .from("squad_memberships")
      .select("player_id, position, shirt_number, players(full_name, photo_url), clubs(code, short_name, color_primary, color_secondary, logo_url)")
      .eq("season_id", season.id)
      .eq("is_active", true)
      .limit(3000),
    db.from("player_picks").select("player_id, matchdays!inner(season_id)").eq("matchdays.season_id", season.id).limit(5000),
  ]);
  if (squad.error) return <p className="error-box">Spieler konnten nicht geladen werden: {squad.error.message}</p>;

  const drafted = new Map<number, number>();
  for (const p of (picks.data ?? []) as { player_id: number }[]) drafted.set(p.player_id, (drafted.get(p.player_id) ?? 0) + 1);

  const players: PhotoPlayer[] = ((squad.data ?? []) as unknown as Row[]).map((r) => ({
    id: r.player_id,
    name: r.players.full_name,
    position: r.position,
    number: r.shirt_number,
    club: { ...clubLogo(r.clubs), name: r.clubs.short_name },
    photoUrl: ownPhotoUrl(r.players.photo_url),
    drafted: drafted.get(r.player_id) ?? 0,
  }));
  const withPhoto = players.filter((p) => p.photoUrl).length;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className="page-title">
          Spielerbilder <span className="chip-admin">ADMIN</span>
        </h1>
        <span className="muted">
          Saison {season.name} · {withPhoto} von {players.length} Spielern mit Bild. Ohne Bild erscheint das Trikot mit Rückennummer.
        </span>
      </div>
      <p className="stat-input-hint" style={{ margin: 0 }}>
        Viele Bilder auf einmal: Dateien als <code>VEREIN_Name.png</code> in einen Ordner legen, dann im Terminal{" "}
        <code>npm run import:bilder -- &lt;Ordner&gt;</code> (Probelauf) und mit <code>--ausfuehren</code> hochladen. Einzeln hier: PNG, JPG oder WebP,
        höchstens 1 MB, am besten quadratisch mit dem Kopf oben.
      </p>
      <PhotoManager players={players} />
    </>
  );
}
