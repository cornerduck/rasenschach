import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFixtures } from "@/lib/sync/fixtures";

/** Spielplan, Ergebnisse und Tore abgleichen. Nur Admin. POST /api/admin/sync-spielplan?saison=2026 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });

  const season = Number(new URL(request.url).searchParams.get("saison"));
  if (!Number.isInteger(season) || season < 2000) {
    return NextResponse.json({ ok: false, message: "Parameter saison fehlt (z. B. 2026)" }, { status: 400 });
  }

  const result = await syncFixtures(createAdminClient(), season);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
