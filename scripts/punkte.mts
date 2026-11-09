/**
 * Punkte eines Spieltags bzw. Saisonstand im Terminal anzeigen.
 *
 *   npm run punkte -- 2026 9     Spieltag 9 der Saison 2026/27
 *   npm run punkte -- 2026       Saisonstand
 */
import { getMatchdayResult, getSeasonStandings } from "@/lib/scoring/repository";
import { LEAGUE_STAT_LABELS, type ManagerResult } from "@/lib/scoring/assemble";
import { PIECE_LABELS } from "@/lib/scoring/players";
import { THESIS_FIELD_LABELS } from "@/lib/scoring/theses";
import { createAdminClient } from "@/lib/supabase/admin";

const [seasonArg, mdArg] = process.argv.slice(2);
const season = Number(seasonArg ?? 2026);
const db = createAdminClient();

const fmt = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");

if (mdArg) {
  const r = await getMatchdayResult(db, season, Number(mdArg));
  if (!r) {
    console.log("Spieltag nicht gefunden");
    process.exit(1);
  }
  const { data: players } = await db.from("players").select("id, short_name");
  const name = new Map((players ?? []).map((p) => [p.id, p.short_name]));

  console.log(`\nSpieltag ${r.number} · Status: ${r.status} · Deadline ${r.deadline ? new Date(r.deadline).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "–"}\n`);
  const show = (label: string, m: ManagerResult) => {
    console.log(`${label}: ${m.total} Punkte (Thesen ${fmt(m.thesisPoints)}, Spieler ${fmt(m.playerPoints)}${m.openTheses ? `, ${m.openTheses} Thesen offen` : ""})`);
    for (const t of m.theses) {
      console.log(`  ${THESIS_FIELD_LABELS[t.field].padEnd(7)} ${t.points === null ? "offen" : fmt(t.points)}  ${t.text}`);
    }
    for (const p of m.players) {
      const lines = p.score.lines.map((l) => `${l.label} ${fmt(l.points)}`).join(", ");
      console.log(`  ${PIECE_LABELS[p.piece].padEnd(8)} ${fmt(p.score.points).padEnd(3)}  ${name.get(p.playerId) ?? p.playerId}${lines ? ` (${lines})` : ""}`);
    }
  };
  show("BENT", r.bent);
  show("BJÖRN", r.bjoern);
  if (r.winner) console.log(`\nSpieltagssieger: ${r.winner === "bent" ? "Bent" : "Björn"}`);
  if (r.missingLeagueStats.length) {
    console.log(`\nNoch einzutragen (ligaweit): ${r.missingLeagueStats.map((k) => LEAGUE_STAT_LABELS[k] ?? `${k} Platz 1–3`).join(", ")}`);
  }
  if (r.unassignedScorers) console.log(`Torschützen ohne Zuordnung: ${r.unassignedScorers}`);
  console.log();
} else {
  const s = await getSeasonStandings(db, season);
  if (!s) {
    console.log("Saison nicht gefunden");
    process.exit(1);
  }
  console.log(`\nSaison ${season}: Bent ${s.bent} · Björn ${s.bjoern}  (abgeschlossen: ${s.bentClosed} : ${s.bjoernClosed})`);
  console.log(`Spieltagssiege: Bent ${s.wins.bent}, Björn ${s.wins.bjoern}, unentschieden ${s.wins.draws}\n`);
  for (const m of s.matchdays) {
    if (m.bent.total === 0 && m.bjoern.total === 0 && m.bent.theses.length === 0) continue;
    console.log(`  ${String(m.number).padStart(2)}. Spieltag  ${String(m.bent.total).padStart(3)} : ${String(m.bjoern.total).padEnd(3)}  ${m.status}`);
  }
  console.log();
}
