/**
 * Spielerbilder aus einem Ordner importieren.
 * Dateinamen: VEREIN_Name.png (auch .jpg/.webp), z. B. "SVW_Marco Grüll.png".
 * Zuordnung über Verein + Name (gleiche Namenslogik wie bei den Torschützen).
 * Unbekannte, mehrdeutige oder doppelte Dateien werden nur gemeldet, nicht hochgeladen.
 * Jedes Bild wird quadratisch auf 256 × 256 Pixel zugeschnitten (oben ausgerichtet,
 * damit der Kopf drin bleibt) und als WebP gespeichert. Vorhandene Bilder werden ersetzt.
 *
 *   npm run import:bilder -- <Ordner>                Probelauf: zeigt nur die Zuordnung
 *   npm run import:bilder -- <Ordner> --ausfuehren   lädt hoch
 *   (optional --saison 2026, Standard 2026)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { checkImage } from "@/lib/logos/image";
import { planPhotoImport, type SquadPlayer } from "@/lib/photos/files";
import { savePlayerPhoto } from "@/lib/photos/store";
import { createAdminClient } from "@/lib/supabase/admin";

const args = process.argv.slice(2);
const execute = args.includes("--ausfuehren");
const season = args.includes("--saison") ? Number(args[args.indexOf("--saison") + 1]) : 2026;
const folder = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--saison");
if (!folder) {
  console.log("Aufruf: npm run import:bilder -- <Ordner> [--ausfuehren]");
  process.exit(1);
}
const dir = resolve(folder.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
let files: string[];
try {
  files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());
} catch {
  console.log(`Ordner „${dir}“ nicht gefunden.`);
  process.exit(1);
}

const db = createAdminClient();
const { data: s } = await db.from("seasons").select("id").eq("start_year", season).maybeSingle();
if (!s) {
  console.log(`Saison ${season} gibt es noch nicht.`);
  process.exit(1);
}

type Row = { player_id: number; clubs: { code: string }; players: { full_name: string; short_name: string; aliases?: string[] } };
let res: { data: unknown; error: { message: string } | null } = await db
  .from("squad_memberships")
  .select("player_id, clubs(code), players(full_name, short_name, aliases)")
  .eq("season_id", s.id)
  .eq("is_active", true)
  .limit(3000);
if (res.error) {
  // vor der Migration für feste Zuordnungen gibt es players.aliases noch nicht
  res = await db.from("squad_memberships").select("player_id, clubs(code), players(full_name, short_name)").eq("season_id", s.id).eq("is_active", true).limit(3000);
}
if (res.error) throw new Error(res.error.message);
const squad: SquadPlayer[] = (res.data as unknown as Row[]).map((r) => ({
  playerId: r.player_id,
  clubCode: r.clubs.code,
  fullName: r.players.full_name,
  shortName: r.players.short_name,
  aliases: r.players.aliases ?? [],
}));

const plan = planPhotoImport(files, squad);
console.log(`\nSpielerbilder aus ${dir}, Saison ${season}${execute ? "" : " (Probelauf)"}\n`);
console.log(`  ${files.length} Dateien · ${plan.matched.length} zugeordnet · ${plan.problems.length} nicht zugeordnet\n`);
for (const m of plan.matched) console.log(`  ✓ ${m.file.padEnd(40)} → ${m.playerName} (${m.clubCode})`);
if (plan.problems.length) {
  console.log("\nNicht hochgeladen:");
  for (const p of plan.problems) console.log(`  ✗ ${p.file.padEnd(40)} ${p.reason}`);
}

if (!execute) {
  console.log(`\nNichts hochgeladen. Wenn alles stimmt: npm run import:bilder -- "${folder}" --ausfuehren\n`);
  process.exit(0);
}

let saved = 0;
const failed: string[] = [];
for (const m of plan.matched) {
  try {
    const raw = readFileSync(join(dir, m.file));
    if (raw.length > 20 * 1024 * 1024) throw new Error("Datei größer als 20 MB");
    const out = await sharp(raw, { limitInputPixels: 250_000_000 })
      .rotate() // Ausrichtung aus Handyfotos übernehmen
      .resize(256, 256, { fit: "cover", position: "top" })
      .webp({ quality: 85 })
      .toBuffer();
    const check = checkImage(out);
    if (!check.ok) throw new Error(check.error);
    await savePlayerPhoto(db, m.playerId, out, check.type);
    saved++;
  } catch (e) {
    failed.push(`${m.file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(`\n✓ ${saved} Bilder hochgeladen`);
if (failed.length) {
  console.log("Fehler:");
  for (const f of failed) console.log("  ✗ " + f);
}
console.log("");
