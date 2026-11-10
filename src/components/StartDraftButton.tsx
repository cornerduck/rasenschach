"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startPlayerDraft, startThesisDraft } from "@/app/spieltag/[nummer]/actions";

/** Startet den Thesen- oder Spieler-Draft. Der andere wird über Realtime automatisch mitgenommen. */
export function StartDraftButton({
  matchdayId,
  number,
  kind = "thesen",
  className = "btn btn-bent",
}: {
  matchdayId: number;
  number: number;
  kind?: "thesen" | "spieler";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = kind === "thesen" ? "Thesen-Draft" : "Spieler-Draft";
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = kind === "thesen" ? await startThesisDraft(matchdayId) : await startPlayerDraft(matchdayId);
            if (res.ok) router.push(`/spieltag/${number}/${kind === "thesen" ? "thesen-draft" : "spieler-draft"}`);
            else setError(res.error);
          })
        }
      >
        {pending ? "Starte …" : `${label} starten`}
      </button>
      {error && (
        <p className="error-box" role="alert" style={{ flexBasis: "100%" }}>
          {error}
        </p>
      )}
    </>
  );
}
