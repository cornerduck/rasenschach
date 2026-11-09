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
