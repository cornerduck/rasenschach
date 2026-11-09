import "server-only";

/** Lädt JSON mit Zeitlimit und verständlichen Fehlermeldungen. */
export async function fetchJson(
  url: string,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json", "User-Agent": "rasenschach (privat)" },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} von ${new URL(url).host}` };
    return { ok: true, data: await res.json() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Abruf fehlgeschlagen (${new URL(url).host}): ${msg}` };
  }
}
