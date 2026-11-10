/**
 * Vereinslogos einmalig von OpenLigaDB holen und im eigenen Speicher ablegen.
 * Jedes Logo wird direkt auf 128 × 128 Pixel verkleinert und als PNG gespeichert
 * (auch SVG-Logos, die so keine Skripte mehr enthalten können).
 *
 *   npm run import:logos                 Probelauf: zeigt nur, was passieren würde
 *   npm run import:logos -- --ausfuehren speichert die Logos
 *   npm run import:logos -- --ausfuehren --alle
 *                                        überschreibt auch Logos, die per Hand hochgeladen wurden
 *   (optional --saison 2026, Standard 2026)
 */
import sharp from "sharp";
import { fixtureSource } from "@/lib/datasource";
import { checkLogo } from "@/lib/logos/image";
import { saveClubLogo } from "@/lib/logos/store";
import { createAdminClient } from "@/lib/supabase/admin";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lädt ein Bild. Antwortet der Server mit „zu viele Anfragen“ oder einem Serverfehler,
 * wird bis zu dreimal erneut versucht (mit Wartezeit, wie vom Server verlangt).
 * Nur echte Bilder werden angenommen, keine HTML-Fehlerseiten.
 */
async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "rasenschach-logos/1.0 (privates Tippspiel)" }, signal: AbortSignal.timeout(15000) });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = Math.min(30, Number(res.headers.get("retry-after")) || 5 * attempt);
      console.log(`      Server bremst (HTTP ${res.status}), neuer Versuch in ${wait} s …`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error(`kein Bild (${type || "unbekannter Typ"})`);
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length > 10 * 1024 * 1024) throw new Error("Datei größer als 10 MB");
    return raw;
  }
}

/** Zielgröße der gespeicherten Logos (Pixel, quadratisch) */
const LOGO_SIZE = 128;
/** Obergrenze für das Quellbild: großzügig für sehr große Logos, aber nicht unbegrenzt */
const MAX_INPUT_PIXELS = 250_000_000;

/**
 * Quellbild → PNG in Zielgröße. SVG-Logos werden direkt passend gerendert (etwa 4-fache
 * Zielgröße für saubere Kanten) statt erst riesig und dann verkleinert; so bleiben auch
 * sehr groß angelegte SVGs unter der Pixelgrenze.
 */
async function toLogoPng(raw: Buffer): Promise<Buffer> {
  const meta = await sharp(raw, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  let density: number | undefined;
  if (meta.format === "svg" && meta.width && meta.height) {
    // Standard sind 72 dpi; so skalieren, dass die längere Seite etwa 4 × LOGO_SIZE wird
    const scale = (LOGO_SIZE * 4) / Math.max(meta.width, meta.height);
    density = Math.min(2400, Math.max(1, Math.round(72 * scale)));
  }
  return sharp(raw, { limitInputPixels: MAX_INPUT_PIXELS, ...(density ? { density } : {}) })
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const args = process.argv.slice(2);
const execute = args.includes("--ausfuehren");
const overwriteManual = args.includes("--alle");
const season = args.includes("--saison") ? Number(args[args.indexOf("--saison") + 1]) : 2026;
const db = createAdminClient();

const { data: s } = await db.from("seasons").select("id").eq("start_year", season).maybeSingle();
if (!s) {
  console.log(`Saison ${season} gibt es noch nicht. Erst den Spielplan abgleichen.`);
  process.exit(1);
}

type Club = { id: number; code: string; short_name: string; external_ids: Record<string, string>; logo_source_url?: string | null; logo_is_manual?: boolean; logo_url: string | null };
const { data: sc, error } = await db.from("season_clubs").select("clubs(*)").eq("season_id", s.id);
if (error) throw new Error(error.message);
const clubs = (sc as unknown as { clubs: Club }[]).map((x) => x.clubs).sort((a, b) => a.code.localeCompare(b.code));
if (clubs.length && !("logo_source_url" in clubs[0])) {
  console.log("Die Datenbank kennt die Vereinslogos noch nicht. Bitte zuerst die Migration 20261116120000_vereinslogos.sql ausführen.");
  process.exit(1);
}

// Aktuelle Logo-Adressen direkt bei OpenLigaDB
const teams = await fixtureSource.getTeams(season);
const sourceById = new Map<string, string | null>(teams.ok ? teams.data.map((t) => [t.externalIds.openligadb!, t.logoUrl]) : []);
if (!teams.ok) console.log(`Hinweis: OpenLigaDB nicht erreichbar (${teams.error}), nehme gespeicherte Adressen.`);

console.log(`\nVereinslogos, Saison ${season}${execute ? "" : " (Probelauf)"}\n`);
let saved = 0;
const problems: string[] = [];
for (const c of clubs) {
  const source = sourceById.get(c.external_ids?.openligadb) ?? c.logo_source_url ?? null;
  const label = `${c.code.padEnd(4)}${c.short_name.padEnd(16)}`;
  if (c.logo_is_manual && !overwriteManual) {
    console.log(`  ${label} übersprungen (per Hand hochgeladen, überschreiben mit --alle)`);
    continue;
  }
  if (!source) {
    problems.push(`${c.code}: keine Logo-Adresse bei OpenLigaDB`);
    console.log(`  ${label} ✗ keine Logo-Adresse`);
    continue;
  }
  if (!/^https:\/\//.test(source)) {
    problems.push(`${c.code}: Adresse ohne https (${source})`);
    continue;
  }
  if (!execute) {
    console.log(`  ${label} würde laden: ${source}`);
    continue;
  }
  try {
    const raw = await download(source);
    // Verkleinern, transparent auffüllen, als PNG speichern
    const png = await toLogoPng(raw);
    const check = checkLogo(png);
    if (!check.ok) throw new Error(check.error);
    await saveClubLogo(db, c, png, check.type, false);
    if (source !== c.logo_source_url) await db.from("clubs").update({ logo_source_url: source }).eq("id", c.id);
    saved++;
    console.log(`  ${label} ✓ gespeichert (${Math.round(png.length / 1024)} KB)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    problems.push(`${c.code}: ${msg}`);
    console.log(`  ${label} ✗ ${msg}`);
  }
  await sleep(1500); // fremde Server schonen
}

if (problems.length) {
  console.log("\nProbleme (Logo bei Bedarf auf /vereine per Hand hochladen):");
  for (const p of problems) console.log("  " + p);
}
console.log(execute ? `\n✓ ${saved} Logos gespeichert\n` : "\nNichts gespeichert. Wenn alles stimmt: npm run import:logos -- --ausfuehren\n");
