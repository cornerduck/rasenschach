"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startThesisDraft } from "@/app/spieltag/[nummer]/actions";

/** Startet den Thesen-Draft. Der andere wird über Realtime automatisch mitgenommen. */
export function StartDraftButton({ matchdayId, number }: { matchdayId: number; number: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-bent"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await startThesisDraft(matchdayId);
            if (res.ok) router.push(`/spieltag/${number}/thesen-draft`);
            else setError(res.error);
          })
        }
      >
        {pending ? "Starte …" : "Thesen-Draft starten"}
      </button>
      {error && (
        <p className="error-box" role="alert" style={{ flexBasis: "100%" }}>
          {error}
        </p>
      )}
    </>
  );
}
