"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Coin, COIN_SPIN_MS } from "@/components/Coin";
import { Wheel, WHEEL_SPIN_MS } from "@/components/Wheel";
import { KNIGHT_CATEGORIES } from "@/lib/scoring/players";
import type { KnightCategory, QuestionValue } from "@/lib/scoring/types";
import { KNIGHT_ORDER, QUESTION_EXPLAIN, QUESTION_LABELS, QUESTION_ORDER, knightExplain } from "@/lib/ui/prep-labels";
import { StartDraftButton } from "@/components/StartDraftButton";
import { useRealtime } from "@/lib/supabase/realtime";
import { resetPrep, spinWheel, tossCoin, type PrepResult, type PrepState } from "../actions";

type Manager = "bent" | "bjoern";

/** Zeigt das Ergebnis erst, wenn das Rad steht (bei neu gedrehtem Wert). */
function useReveal(value: string | null, ms = WHEEL_SPIN_MS) {
  const [prev, setPrev] = useState(value);
  const [hidden, setHidden] = useState(false);
  if (value !== prev) {
    setPrev(value);
    setHidden(prev === null && value !== null);
  }
  useEffect(() => {
    if (!hidden) return;
    const t = setTimeout(() => setHidden(false), ms);
    return () => clearTimeout(t);
  }, [hidden, ms]);
  return hidden ? null : value;
}

/**
 * Hält den Stand der Vorbereitung selbst und hört per Realtime auf den Spieltag.
 * So dreht das Rad beim anderen Gerät mit derselben Animation, ohne dass die Seite
 * neu lädt. Wer die Seite später öffnet, sieht direkt das fertige Ergebnis.
 */
function useLivePrep(matchdayId: number, initial: PrepState) {
  const [state, setState] = useState(initial);
  // neuer Stand vom Server (z. B. nach Neuladen): übernehmen
  const [prevInitial, setPrevInitial] = useState(initial);
  if (
    initial.questionValue !== prevInitial.questionValue ||
    initial.knightCategory !== prevInitial.knightCategory ||
    initial.thesisStarter !== prevInitial.thesisStarter
  ) {
    setPrevInitial(initial);
    setState(initial);
  }

  useRealtime(`vorbereitung-${matchdayId}`, [{ table: "matchdays", event: "UPDATE", filter: `id=eq.${matchdayId}` }], (_table, payload) => {
    const row = payload.new as { question_value: PrepState["questionValue"]; knight_category: PrepState["knightCategory"]; thesis_starter: PrepState["thesisStarter"] };
    setState({ questionValue: row.question_value, knightCategory: row.knight_category, thesisStarter: row.thesis_starter });
  });

  return [state, setState] as const;
}

export function PrepBoard({
  matchdayId,
  questionValue: initialQuestion,
  knightCategory: initialKnight,
  thesisStarter: initialStarter,
  thesesCount,
  open,
  isAdmin,
  number,
  draftStarted,
}: {
  matchdayId: number;
  questionValue: QuestionValue | null;
  knightCategory: KnightCategory | null;
  thesisStarter: Manager | null;
  thesesCount: number;
  open: boolean;
  isAdmin: boolean;
  number: number;
  draftStarted: boolean;
}) {
  const [{ questionValue, knightCategory, thesisStarter }, setState] = useLivePrep(matchdayId, {
    questionValue: initialQuestion,
    knightCategory: initialKnight,
    thesisStarter: initialStarter,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const qShown = useReveal(questionValue);
  const kShown = useReveal(knightCategory);
  const sShown = useReveal(thesisStarter, COIN_SPIN_MS) as Manager | null;
  const NAME: Record<Manager, string> = { bent: "Bent", bjoern: "Björn" };

  const run = (fn: () => Promise<PrepResult>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) setState(res.state);
      else setError(res.error);
    });

  const ready = [
    { label: `${thesesCount}/12 Thesen`, done: thesesCount === 12 },
    { label: "Münzwurf", done: !!thesisStarter },
    { label: "?-Feld", done: !!questionValue },
    { label: "Springer-Feld", done: !!knightCategory },
  ];

  return (
    <>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="prep-grid">
        <section className="prep-panel centered">
          <div className="prep-head">
            <h2>Wer beginnt?</h2>
            <span className="muted">Münzwurf: Wer gewinnt, beginnt den Thesen-Draft.</span>
          </div>
          <Coin result={thesisStarter} />
          <div className="wheel-result" aria-live="polite">
            {sShown ? (
              <>
                <span className="wheel-value" style={{ color: sShown === "bent" ? "var(--bent-light)" : "var(--bjoern-light)" }}>
                  {NAME[sShown]} beginnt
                </span>
                <span className="muted" style={{ fontSize: 13 }}>
                  Thesen-Draft: {NAME[sShown]} · Spieler-Draft: {NAME[sShown === "bent" ? "bjoern" : "bent"]}
                </span>
              </>
            ) : (
              <span className="faint">{thesisStarter ? "…" : "noch nicht geworfen"}</span>
            )}
          </div>
          {open && !thesisStarter && (
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => tossCoin(matchdayId))}>
              Münze werfen
            </button>
          )}
          {open && thesisStarter && isAdmin && (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => resetPrep(matchdayId, "start"))}>
              Zurücksetzen (Admin)
            </button>
          )}
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

      <div className="prep-footer">
        <ul className="ready-list" aria-label="Bereit für den Draft">
          {ready.map((r) => (
            <li key={r.label} className={r.done ? "done" : "open"}>
              {r.done ? "✓" : "○"} {r.label}
            </li>
          ))}
        </ul>
        {thesesCount < 12 && (
          <Link className="btn btn-secondary" href={`/spieltag/${number}/thesen`}>
            Zu den Thesen
          </Link>
        )}
        {draftStarted ? (
          <Link className="btn btn-bent" href={`/spieltag/${number}/thesen-draft`}>
            Zum Thesen-Draft
          </Link>
        ) : ready.every((r) => r.done) ? (
          <StartDraftButton matchdayId={matchdayId} number={number} />
        ) : (
          <span className="btn btn-bent" aria-disabled="true" title="Erst alles vorbereiten">
            Thesen-Draft starten
          </span>
        )}
      </div>
    </>
  );
}
