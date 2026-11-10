/**
 * Saisonstatistik aus den berechneten Spieltagen. Rein und getestet.
 *
 * Gezählt werden nur abgeschlossene Spieltage. Ein laufender Spieltag (Spiele laufen oder
 * Auswertung) erscheint im Verlauf als „vorläufig“, fließt aber in keine Summe ein.
 * Ausnahme: Einsätze für das 3er-Limit zählen jeden gedrafteten Spieler (Regelwerk,
 * Auslegung 6), auch an laufenden Spieltagen.
 */
import type { Manager, MatchdayResult } from "@/lib/scoring/assemble";
import { thesisPoints } from "@/lib/scoring/theses";
import type { Piece, ThesisField } from "@/lib/scoring/types";

const MANAGERS: Manager[] = ["bent", "bjoern"];
type PerManager<T> = Record<Manager, T>;

export interface MatchdayPoints {
  number: number;
  bent: number;
  bjoern: number;
  /** laufender Spieltag, zählt noch nicht */
  provisional: boolean;
  winner: Manager | null;
}

export interface Performance {
  number: number;
  manager: Manager;
  piece: Piece;
  playerId: number;
  points: number;
  lines: string[];
}

export interface DraftedPlayer {
  playerId: number;
  /** wie oft gedraftet (alle Spieltage, auch laufende) */
  picks: PerManager<number>;
  total: number;
  /** Punkte aus abgeschlossenen Spieltagen */
  points: PerManager<number>;
}

export interface HitRate {
  right: number;
  total: number;
}

export interface SeasonStats {
  closedCount: number;
  totals: PerManager<number>;
  average: PerManager<number>;
  wins: PerManager<number>;
  draws: number;
  leader: Manager | null;
  lead: number;
  /** Spieltage, deren Deadline noch nicht vorbei ist */
  remaining: number;
  nextDeadline: string | null;
  perMatchday: MatchdayPoints[];
  byThesisField: Record<ThesisField, PerManager<number>>;
  byPiece: Record<Piece, PerManager<number>>;
  thesisTotal: PerManager<number>;
  performances: Performance[];
  drafted: DraftedPlayer[];
  hitRate: { overall: PerManager<HitRate>; byField: Record<ThesisField, PerManager<HitRate>> };
}

const FIELDS: ThesisField[] = ["minus_plus_3", "minus_1", "frage", "plus_1", "plus_minus_3"];
const PIECES: Piece[] = ["turm", "laeufer", "springer", "dame", "koenig"];
const zero = (): PerManager<number> => ({ bent: 0, bjoern: 0 });
const zeroRate = (): PerManager<HitRate> => ({ bent: { right: 0, total: 0 }, bjoern: { right: 0, total: 0 } });

const isClosed = (r: MatchdayResult) => r.status === "abgeschlossen" && r.played;
const isRunning = (r: MatchdayResult) => r.played && (r.status === "laeuft" || r.status === "auswertung");

/**
 * Richtig gelegen: Die These hat sich so entwickelt, wie es das Feld will, also das
 * bessere der beiden Ergebnisse (auf +/−3, +1, ?-Feld mit Plus-Wert und ±3: eingetroffen;
 * auf −/+3, −1 und ?-Feld −3: nicht eingetroffen). Festgelegt am 10.11.2026.
 */
export function thesisRight(field: ThesisField, outcome: boolean, questionValue: MatchdayResult["questionValue"]): boolean {
  const both = (o: boolean) => thesisPoints(field, { outcome: o, confirmedBent: true, confirmedBjoern: true }, questionValue ?? null)!;
  const hit = both(true);
  const miss = both(false);
  return outcome ? hit > miss : miss > hit;
}

export function seasonStats(results: MatchdayResult[], now: Date = new Date()): SeasonStats {
  const sorted = [...results].sort((a, b) => a.number - b.number);
  const closed = sorted.filter(isClosed);

  const totals = zero();
  const wins = zero();
  let draws = 0;
  const byThesisField = Object.fromEntries(FIELDS.map((f) => [f, zero()])) as SeasonStats["byThesisField"];
  const byPiece = Object.fromEntries(PIECES.map((p) => [p, zero()])) as SeasonStats["byPiece"];
  const thesisTotal = zero();
  const performances: Performance[] = [];
  const hitOverall = zeroRate();
  const hitByField = Object.fromEntries(FIELDS.map((f) => [f, zeroRate()])) as SeasonStats["hitRate"]["byField"];

  for (const r of closed) {
    if (r.winner) wins[r.winner]++;
    else draws++;
    for (const m of MANAGERS) {
      totals[m] += r[m].total;
      for (const t of r[m].theses) {
        if (t.points === null || t.outcome === null) continue;
        byThesisField[t.field][m] += t.points;
        thesisTotal[m] += t.points;
        const right = thesisRight(t.field, t.outcome, r.questionValue);
        for (const rate of [hitOverall[m], hitByField[t.field][m]]) {
          rate.total++;
          if (right) rate.right++;
        }
      }
      for (const p of r[m].players) {
        byPiece[p.piece][m] += p.score.points;
        performances.push({
          number: r.number,
          manager: m,
          piece: p.piece,
          playerId: p.playerId,
          points: p.score.points,
          lines: p.score.lines.map((l) => l.label),
        });
      }
    }
  }
  performances.sort((a, b) => b.points - a.points || a.number - b.number || a.manager.localeCompare(b.manager));

  // Gedraftete Spieler: alle Spieltage mit Zügen (3er-Limit zählt jeden Draft)
  const drafted = new Map<number, DraftedPlayer>();
  for (const r of sorted) {
    for (const m of MANAGERS) {
      for (const p of r[m].players) {
        const d = drafted.get(p.playerId) ?? { playerId: p.playerId, picks: zero(), total: 0, points: zero() };
        d.picks[m]++;
        d.total++;
        if (isClosed(r)) d.points[m] += p.score.points;
        drafted.set(p.playerId, d);
      }
    }
  }

  const perMatchday: MatchdayPoints[] = sorted
    .filter((r) => isClosed(r) || isRunning(r))
    .map((r) => ({ number: r.number, bent: r.bent.total, bjoern: r.bjoern.total, provisional: !isClosed(r), winner: isClosed(r) ? r.winner : null }));

  const future = sorted.filter((r) => r.deadline === null || Date.parse(r.deadline) > now.getTime());
  const n = closed.length;
  const lead = Math.abs(totals.bent - totals.bjoern);

  return {
    closedCount: n,
    totals,
    average: { bent: n ? totals.bent / n : 0, bjoern: n ? totals.bjoern / n : 0 },
    wins,
    draws,
    leader: totals.bent === totals.bjoern ? null : totals.bent > totals.bjoern ? "bent" : "bjoern",
    lead,
    remaining: future.length,
    nextDeadline: future.find((r) => r.deadline)?.deadline ?? null,
    perMatchday,
    byThesisField,
    byPiece,
    thesisTotal,
    performances,
    drafted: [...drafted.values()].sort((a, b) => b.total - a.total || b.points.bent + b.points.bjoern - (a.points.bent + a.points.bjoern)),
    hitRate: { overall: hitOverall, byField: hitByField },
  };
}

/** "12 von 20 (60 %)" bzw. "–" ohne gewertete Thesen */
export function formatRate(r: HitRate): string {
  if (r.total === 0) return "–";
  return `${r.right} von ${r.total} (${Math.round((r.right / r.total) * 100)} %)`;
}
