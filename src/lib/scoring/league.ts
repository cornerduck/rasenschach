/**
 * Ligaweite Platzierungen (Regelwerk 4, „Ligaweite Boni“).
 * Verglichen wird mit allen Bundesligaspielern des Spieltags. Teilen sich mehrere einen
 * Platz, bekommen alle die Punkte dieses Platzes. Nach einem geteilten Platz geht es mit
 * dem übernächsten weiter (1, 1, 3), wie in Sporttabellen üblich.
 */
export function leagueRanks<Id>(
  entries: { id: Id; value: number | null | undefined }[],
  topN = 3,
): Map<Id, number> {
  const valid = entries
    .filter((e): e is { id: Id; value: number } => typeof e.value === "number" && e.value > 0)
    .sort((a, b) => b.value - a.value);

  const ranks = new Map<Id, number>();
  let rank = 0;
  let prev: number | null = null;
  valid.forEach((e, index) => {
    if (e.value !== prev) {
      rank = index + 1;
      prev = e.value;
    }
    if (rank <= topN) ranks.set(e.id, rank);
  });
  return ranks;
}

/** Punkte für Platz 1/2/3 (Läufer-Laufleistung und alle Springer-Kategorien). */
export function podiumPoints(rank: number | undefined): number {
  if (rank === 1) return 3;
  if (rank === 2) return 2;
  if (rank === 3) return 1;
  return 0;
}

/** Wie viele Plätze zählen pro ligaweitem Wert? Laufleistung und Springer: Platz 1–3, sonst nur Platz 1. */
export function leagueTopN(statKey: string): number {
  return statKey === "goals" || statKey === "scorer_points" || statKey === "goals_prevented" || statKey === "sprints" ? 1 : 3;
}

/**
 * Eingetragene Bestwerte (z. B. Laufleistung der drei Besten) → Plätze nach den Regeln:
 * geteilter Platz für alle, danach der übernächste (1, 1, 3); nur Werte über 0.
 * Einträge ohne Platz (zu weit hinten oder Wert 0) fallen weg.
 */
export function rankEntries<T extends { value: number | null | undefined }>(entries: T[], topN: number): (T & { rank: number })[] {
  const ranks = leagueRanks(entries.map((e, i) => ({ id: i, value: e.value })), topN);
  return entries
    .map((e, i) => ({ ...e, rank: ranks.get(i) }))
    .filter((e): e is T & { rank: number } => e.rank !== undefined)
    .sort((a, b) => a.rank - b.rank);
}
