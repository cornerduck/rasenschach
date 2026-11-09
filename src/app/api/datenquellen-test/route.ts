import { NextResponse } from "next/server";
import { fixtureSource } from "@/lib/datasource";

/**
 * Diagnose: prüft, was die Datenquelle liefert. Gibt nur öffentliche Fußballdaten zurück.
 * Aufruf: /api/datenquellen-test?saison=2026&spieltag=9
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const season = Number(params.get("saison") ?? 2026);

  const current = await fixtureSource.getCurrentMatchday();
  const matchday = Number(params.get("spieltag") ?? (current.ok ? Math.max(1, current.data.number) : 1));

  const [teams, matchdays, matches] = await Promise.all([
    fixtureSource.getTeams(season),
    fixtureSource.getMatchdays(season),
    fixtureSource.getMatches(season, matchday),
  ]);

  const summary = matches.ok
    ? matches.data.map((m) => ({
        anstoss: m.kickoff,
        spiel: `${m.home.shortName} – ${m.away.shortName}`,
        ergebnis: m.fulltime ? `${m.fulltime.home}:${m.fulltime.away}` : null,
        beendet: m.isFinished,
        tore: m.goals.map((g) => `${g.minute}' ${g.scorerName}${g.isPenalty ? " (E)" : ""}${g.isOwnGoal ? " (ET)" : ""}`),
      }))
    : null;

  return NextResponse.json({
    quelle: fixtureSource.id,
    laufzeit: process.env.VERCEL ? `Vercel (${process.env.VERCEL_REGION ?? "?"})` : "lokal",
    aktuellerSpieltag: current.ok ? current.data : { fehler: current.error },
    teams: teams.ok ? teams.data.length : { fehler: teams.error },
    spieltage: matchdays.ok ? matchdays.data.length : { fehler: matchdays.error },
    spieltag: matchday,
    spiele: summary ?? { fehler: matches.ok ? null : matches.error },
  });
}
