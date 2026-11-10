/**
 * Torschützen zuordnen (für alle bisherigen Spieltage der Saison).
 *
 *   npm run torschuetzen
 *       ordnet offene Tore zu und zeigt, was noch fehlt
 *
 *   npm run torschuetzen -- --alias "D. Mokwa" "David Mokwa Ntusu" [--verein SVE]
 *       feste Zuordnung speichern (Name aus der Quelle → Spieler), danach neu zuordnen.
 *       Statt des Spielernamens geht auch die Nummer aus der Liste, z. B. "#428".
 *
 *   optional --saison 2026 (Standard 2026)
 */
import { addScorerAlias, assignScorers } from "@/lib/roster/import";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFixtures } from "@/lib/sync/fixtures";

const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const season = Number(opt("--saison") ?? 2026);
const db = createAdminClient();

const { data: s } = await db.from("seasons").select("id").eq("start_year", season).maybeSingle();
if (!s) {
  console.log(`Saison ${season} gibt es noch nicht.`);
  process.exit(1);
}

if (args.includes("--alias")) {
  const i = args.indexOf("--alias");
  const [alias, player] = [args[i + 1], args[i + 2]];
  if (!alias || !player || player.startsWith("--")) {
    console.log('Aufruf: npm run torschuetzen -- --alias "Name aus der Quelle" "Spieler" [--verein KÜRZEL]');
    process.exit(1);
  }
  const r = await addScorerAlias(db, s.id, alias, player, opt("--verein"));
  if (!r.ok) {
    console.log("✗", r.error);
    process.exit(1);
  }
  console.log(`✓ Feste Zuordnung gespeichert: „${alias.trim()}“ → ${r.player}`);
}

const res = await assignScorers(db, s.id);
console.log(`\n✓ ${res.assigned} Tore neu zugeordnet`);
if (res.open.length) {
  console.log("\nOhne eindeutige Zuordnung:");
  for (const o of res.open) {
    console.log(`  „${o.name}“ (${o.club}, ${o.goals} Tor${o.goals > 1 ? "e" : ""}): ${o.candidates.length ? "mögliche Spieler " + o.candidates.join(", ") : "kein passender Spieler im Kader"}`);
  }
  console.log('\nLösen mit: npm run torschuetzen -- --alias "Name wie oben" "Spielername oder #Nummer" --verein KÜRZEL');
} else {
  console.log("✓ Alle Tore (außer Eigentoren) sind einem Spieler zugeordnet");
}

const sync = await syncFixtures(db, season);
console.log(sync.ok ? "✓" : "✗", "Tor-Messwerte aktualisiert:", sync.message, "\n");
