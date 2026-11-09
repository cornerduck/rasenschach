/**
 * Spielplan, Ergebnisse und Tore von OpenLigaDB in die Datenbank holen.
 * Aufruf im Terminal:  npm run sync:spielplan -- 2026
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFixtures } from "@/lib/sync/fixtures";

const season = Number(process.argv[2] ?? 2026);
const result = await syncFixtures(createAdminClient(), season);
console.log(result.ok ? "✓" : "✗", result.message);
process.exit(result.ok ? 0 : 1);
