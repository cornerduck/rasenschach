"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Wheel, WHEEL_SPIN_MS } from "@/components/Wheel";
import { KNIGHT_CATEGORIES } from "@/lib/scoring/players";
import type { KnightCategory, QuestionValue } from "@/lib/scoring/types";
import { KNIGHT_ORDER, QUESTION_EXPLAIN, QUESTION_LABELS, QUESTION_ORDER, knightExplain } from "@/lib/ui/prep-labels";
import { resetPrep, setStarter, spinWheel, type ActionResult } from "../actions";

type Manager = "bent" | "bjoern";

/** Zeigt das Ergebnis erst, wenn das Rad steht (bei neu gedrehtem Wert). */
function useReveal(value: string | null) {
  const [prev, setPrev] = useState(value);
  const [hidden, setHidden] = useState(false);
  if (value !== prev) {
    setPrev(value);
    setHidden(prev === null && value !== null);
  }
  useEffect(() => {
    if (!hidden) return;
    const t = setTimeout(() => setHidden(false), WHEEL_SPIN_MS);
    return () => clearTimeout(t);
  }, [hidden]);
  return hidden ? null : value;
}

export function PrepBoard({
  matchdayId,
  questionValue,
  knightCategory,
  thesisStarter,
  open,
  isAdmin,
}: {
  matchdayId: number;
  questionValue: QuestionValue | null;
  knightCategory: KnightCategory | null;
  thesisStarter: Manager | null;
  open: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const qShown = useReveal(questionValue);
  const kShown = useReveal(knightCategory);

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  const starterButton = (who: Manager) => {
    const name = who === "bent" ? "BENT" : "BJÖRN";
    const state = thesisStarter === null ? "" : thesisStarter === who ? "is-starter" : "is-other";
    const note =
      thesisStarter === null
        ? open
          ? "antippen, wenn gewonnen"
          : "offen"
        : thesisStarter === who
          ? "● BEGINNT DEN THESEN-DRAFT"
          : "beginnt den Spieler-Draft";
    return (
      <button
        type="button"
        className={`starter starter-${who} ${state}`}
        disabled={!open || pending || thesisStarter === who}
        aria-pressed={thesisStarter === who}
        onClick={() => run(() => setStarter(matchdayId, who))}
      >
        <span className="starter-name">{name}</span>
        <span className="starter-note">{note}</span>
      </button>
    );
  };

  return (
    <>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="prep-grid">
        <section className="prep-panel">
          <div className="prep-head">
            <h2>Wer beginnt?</h2>
            <span className="muted">Schnick Schnack Schnuck, danach den Gewinner antippen.</span>
          </div>
          {starterButton("bent")}
          <div className="vs">VS</div>
          {starterButton("bjoern")}
        </section>

        <section className="prep-panel centered">
          <div className="prep-head">
            <h2>?-Feld</h2>
            <span className="muted">Gilt diese Woche für beide.</span>
          </div>
          <Wheel
            labels={QUESTION_ORDER.map((q) => QUESTION_LABELS[q])}
            winner={questionValue ? QUESTION_ORDER.indexOf(questionValue) : null}
            ariaLabel={`Rad für das ?-Feld${qShown ? `, gelost ${QUESTION_LABELS[qShown as QuestionValue]}` : ""}`}
          />
          <div className="wheel-result" aria-live="polite">
            {qShown ? (
              <>
                <span className="wheel-value">{QUESTION_LABELS[qShown as QuestionValue]}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {QUESTION_EXPLAIN[qShown as QuestionValue]}
                </span>
              </>
            ) : (
              <span className="faint">{questionValue ? "…" : "noch nicht gedreht"}</span>
            )}
          </div>
          {open && !questionValue && (
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => spinWheel(matchdayId, "frage"))}>
              Rad drehen
            </button>
          )}
          {open && questionValue && isAdmin && (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => resetPrep(matchdayId, "frage"))}>
              Zurücksetzen (Admin)
            </button>
          )}
        </section>

        <section className="prep-panel centered">
          <div className="prep-head">
            <h2>Springer-Feld</h2>
            <span className="muted">Kategorie für beide Springer.</span>
          </div>
          <Wheel
            labels={KNIGHT_ORDER.map((k) => KNIGHT_CATEGORIES[k].label)}
            winner={knightCategory ? KNIGHT_ORDER.indexOf(knightCategory) : null}
            radial
            ariaLabel={`Rad für das Springer-Feld${kShown ? `, gelost ${KNIGHT_CATEGORIES[kShown as KnightCategory].label}` : ""}`}
          />
          <div className="wheel-result" aria-live="polite">
            {kShown ? (
              <>
                <span className="wheel-value">{KNIGHT_CATEGORIES[kShown as KnightCategory].label}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {knightExplain(kShown as KnightCategory)}
                </span>
              </>
            ) : (
              <span className="faint">{knightCategory ? "…" : "noch nicht gedreht"}</span>
            )}
          </div>
          {open && !knightCategory && (
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => spinWheel(matchdayId, "springer"))}>
              Rad drehen
            </button>
          )}
          {open && knightCategory && isAdmin && (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => resetPrep(matchdayId, "springer"))}>
              Zurücksetzen (Admin)
            </button>
          )}
        </section>
      </div>
    </>
  );
}
