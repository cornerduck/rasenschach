/**
 * Kader aus CSV importieren.
 *
 *   npm run import:kader -- kader.csv                Probelauf: zeigt nur, was sich ändern würde
 *   npm run import:kader -- kader.csv --ausfuehren   schreibt in die Datenbank
 *   (optional --saison 2026, Standard 2026)
 */
import { readFileSync } from "node:fs";
import { parseRosterCsv } from "@/lib/roster/csv";
import { applyRosterImport, assignScorers, planRosterImport } from "@/lib/roster/import";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFixtures } from "@/lib/sync/fixtures";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && !/^\d{4}$/.test(a));
const execute = args.includes("--ausfuehren");
const seasonArg = args[args.indexOf("--saison") + 1];
const season = args.includes("--saison") ? Number(seasonArg) : 2026;

if (!file) {
  console.log("Aufruf: npm run import:kader -- datei.csv [--ausfuehren] [--saison 2026]");
  process.exit(1);
}

const parsed = parseRosterCsv(readFileSync(file, "utf8"));
const db = createAdminClient();
const plan = await planRosterImport(db, season, parsed.rows);
const errors = [...parsed.errors, ...plan.errors];

console.log(`\nKader-Import ${file}, Saison ${season}${execute ? "" : " (Probelauf)"}\n`);
console.log(`  ${parsed.rows.length} Zeilen gelesen`);
console.log(`  ${plan.newPlayers.length} neue Spieler`);
console.log(`  ${plan.updates.length} Änderungen`);
console.log(`  ${plan.unchanged} unverändert`);
console.log(`  ${plan.deactivate.length} nicht mehr in der CSV → werden aus dem Kader genommen`);

const show = <T,>(title: string, list: T[], fmt: (x: T) => string, max = 15) => {
  if (!list.length) return;
  console.log(`\n${title}:`);
  list.slice(0, max).forEach((x) => console.log("  " + fmt(x)));
  if (list.length > max) console.log(`  … und ${list.length - max} weitere`);
};
show("Fehler (Zeilen werden übersprungen)", errors, (e) => e, 100);
show("Neu", plan.newPlayers, (n) => `${n.row.fullName} (${n.row.club}, ${n.row.position}${n.row.shirtNumber ? ", #" + n.row.shirtNumber : ""})`);
show("Geändert", plan.updates, (u) => `${u.row.fullName}: ${u.changes.join(", ")}`);
show("Aus dem Kader", plan.deactivate, (d) => `${d.name} (${d.club})`, 50);

if (!execute) {
  console.log(`\nNichts geschrieben. Wenn alles stimmt: npm run import:kader -- ${file} --ausfuehren\n`);
  process.exit(0);
}

await applyRosterImport(db, plan);
console.log("\n✓ Kader gespeichert");

const scorers = await assignScorers(db, plan.seasonId);
console.log(`✓ ${scorers.assigned} Tore Spielern zugeordnet`);
show("Torschützen ohne eindeutige Zuordnung (später per Hand)", scorers.open, (o) => `${o.name} (${o.club}, ${o.goals} Tor${o.goals > 1 ? "e" : ""})`, 50);

const sync = await syncFixtures(db, season);
console.log(sync.ok ? "✓" : "✗", "Tor-Messwerte aktualisiert:", sync.message, "\n");
