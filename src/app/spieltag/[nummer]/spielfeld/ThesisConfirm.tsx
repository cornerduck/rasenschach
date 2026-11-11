"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmThesis, setThesisOutcome } from "../actions";

/** Ergebnis einer These bestätigen oder widersprechen (dann muss der andere neu bestätigen) */
export function ThesisConfirm({
  thesisId,
  outcome,
  as,
  name,
}: {
  thesisId: number;
  outcome: boolean;
  /** Ein-Gerät-Modus: für den anderen bestätigen (Server prüft das Recht) */
  as?: "bent" | "bjoern";
  /** Name im Knopf, z. B. „Björn: Bestätigen“ */
  name?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error ?? "Fehler");
    });
  return (
    <div className={`thesis-confirm ${as ? `confirm-${as}` : ""}`}>
      <button type="button" className="btn btn-small btn-secondary" disabled={pending} onClick={() => run(() => confirmThesis(thesisId, as))}>
        {name ? `${name}: Bestätigen` : "Bestätigen"}
      </button>
      <button
        type="button"
        className="btn btn-small btn-ghost"
        disabled={pending}
        title={`Stattdessen „${outcome ? "nicht eingetroffen" : "eingetroffen"}“ eintragen`}
        onClick={() => run(() => setThesisOutcome(thesisId, !outcome, as))}
      >
        {name ? `${name}: Stimmt nicht` : "Stimmt nicht"}
      </button>
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
