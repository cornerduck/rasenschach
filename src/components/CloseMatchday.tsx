"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { closeMatchday, reopenMatchday } from "@/app/spieltag/[nummer]/actions";

/** Admin: Spieltag freigeben (abschließen) bzw. wieder öffnen */
export function CloseMatchday({ matchdayId, closed, canClose }: { matchdayId: number; closed: boolean; canClose: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    startTransition(async () => {
      setError(null);
      if (!closed && !window.confirm("Spieltag abschließen? Die Punkte werden dann endgültig gewertet. Du kannst ihn später wieder öffnen.")) return;
      const res = closed ? await reopenMatchday(matchdayId) : await closeMatchday(matchdayId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  return (
    <>
      <button
        type="button"
        className={closed ? "btn btn-secondary" : "btn btn-bent"}
        disabled={pending || (!closed && !canClose)}
        title={!closed && !canClose ? "Erst wenn alle Spiele (auch Nachholspiele) beendet sind" : undefined}
        onClick={run}
      >
        {pending ? "…" : closed ? "Wieder öffnen" : "Spieltag abschließen"}
      </button>
      {error && (
        <p className="error-box" role="alert" style={{ flexBasis: "100%", margin: 0 }}>
          {error}
        </p>
      )}
    </>
  );
}
