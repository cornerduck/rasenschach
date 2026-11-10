import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ClubLogo } from "@/components/ClubLogo";
import { currentSeason } from "@/lib/matchday/load";
import { getMe } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { clubLogo, ownLogoUrl } from "@/lib/ui/club";
import { LogoUpload } from "./LogoUpload";

export const metadata: Metadata = { title: "Vereine · Rasenschach" };

export default function ClubsPage() {
  return (
    <>
      <AppHeader active="saison" />
      <main className="page">
        <Suspense fallback={<div className="skeleton" style={{ minHeight: 400 }} />}>
          <Clubs />
        </Suspense>
      </main>
    </>
  );
}

type Club = {
  id: number;
  code: string;
  name: string;
  short_name: string;
  color_primary: string;
  color_secondary: string;
  logo_url: string | null;
  logo_is_manual?: boolean;
  logo_source_url?: string | null;
};

async function Clubs() {
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

  const { data } = await db.from("season_clubs").select("clubs(*)").eq("season_id", season.id);
  const clubs = ((data ?? []) as unknown as { clubs: Club }[]).map((x) => x.clubs).sort((a, b) => a.short_name.localeCompare(b.short_name, "de"));
  const migrated = clubs.length === 0 || "logo_is_manual" in clubs[0];
  const missing = clubs.filter((c) => !ownLogoUrl(c.logo_url)).length;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 className="page-title">
          Vereinslogos <span className="chip-admin">ADMIN</span>
        </h1>
        <span className="muted">
          Saison {season.name} · {clubs.length - missing} von {clubs.length} Logos gespeichert. Ohne Logo erscheint das Kürzel in Vereinsfarbe.
        </span>
      </div>
      {!migrated && <p className="error-box">Die Datenbank kennt die Vereinslogos noch nicht. Bitte zuerst die Migration 20261116120000_vereinslogos.sql ausführen.</p>}
      <p className="stat-input-hint" style={{ margin: 0 }}>
        Alle Logos von OpenLigaDB holen: im Terminal <code>npm run import:logos -- --ausfuehren</code>. Per Hand hochgeladene Logos bleiben dabei erhalten.
        Ein Logo ersetzen: PNG, JPG oder WebP, höchstens 1 MB, am besten quadratisch mit durchsichtigem Hintergrund.
      </p>
      <div className="club-admin-grid">
        {clubs.map((c) => {
          const own = ownLogoUrl(c.logo_url);
          return (
            <div key={c.id} className="club-admin">
              <div className="club-admin-preview">
                <ClubLogo club={clubLogo(c)} size={48} decorative />
                <ClubLogo club={clubLogo(c)} size={18} decorative />
              </div>
              <div className="club-admin-info">
                <span className="rank-name">{c.short_name}</span>
                <span className="rank-meta">
                  {c.code} ·{" "}
                  {!own ? (
                    <span className="src-badge src-missing">fehlt</span>
                  ) : c.logo_is_manual ? (
                    <span className="src-badge src-manual">Hand</span>
                  ) : (
                    <span className="src-badge src-auto">OpenLigaDB</span>
                  )}
                </span>
              </div>
              {migrated && <LogoUpload clubId={c.id} clubName={c.short_name} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
