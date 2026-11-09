import { KNIGHT_CATEGORIES } from "@/lib/scoring/players";
import type { KnightCategory, QuestionValue } from "@/lib/scoring/types";

/** Reihenfolge der Felder auf dem ?-Rad (wie im Entwurf) */
export const QUESTION_ORDER: QuestionValue[] = ["plus_minus_3", "plus_1", "plus_2", "plus_3", "minus_3"];
export const QUESTION_LABELS: Record<QuestionValue, string> = {
  plus_minus_3: "±3",
  plus_1: "+1",
  plus_2: "+2",
  plus_3: "+3",
  minus_3: "−3",
};
export const QUESTION_EXPLAIN: Record<QuestionValue, string> = {
  plus_minus_3: "Trifft ein +3 · trifft nicht ein −3",
  plus_1: "Trifft ein +1 · trifft nicht ein 0",
  plus_2: "Trifft ein +2 · trifft nicht ein 0",
  plus_3: "Trifft ein +3 · trifft nicht ein 0",
  minus_3: "Trifft ein −3 · trifft nicht ein 0",
};

/** Reihenfolge der Kategorien auf dem Springer-Rad (wie im Entwurf) */
export const KNIGHT_ORDER: KnightCategory[] = [
  "ballmagnet",
  "raumdeuter",
  "alleingang",
  "gefahrensucher",
  "schallmauer",
  "zweikaempfer",
  "tuersteher",
  "dauerfeuer",
  "bollwerk",
  "laser",
];

const num = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? (n * 10) % 1 ? 2 : 1 : 0 });

export function knightExplain(c: KnightCategory): string {
  const k = KNIGHT_CATEGORIES[c];
  const unit = (v: number) => (k.unit === "%" ? `${num(v)} %` : k.unit ? `${num(v)} ${k.unit}` : num(v));
  return `${k.metric}: +1 ab ${unit(k.one)} · +2 ab ${unit(k.two)} · Platz 1–3 ligaweit +3/+2/+1`;
}
