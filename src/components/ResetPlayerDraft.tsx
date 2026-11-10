"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { resetPlayerDraft } from "@/app/spieltag/[nummer]/actions";
import { ResetMatchday } from "./ResetMatchday";

/** Admin: nur den Spieler-Draft löschen (Thesen-Draft bleibt), mit Sicherheitsabfrage */
export function ResetPlayerDraft({ matchdayId, number }: { matchdayId: number; number: number }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const res = await resetPlayerDraft(matchdayId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      dialog.current?.close();
      router.push(`/spieltag/${number}/thesen-draft`);
      router.refresh();
    });

  return (
    <>
      <div className="admin-zone">
        <span className="chip-admin">ADMIN</span>
        <span className="muted" style={{ fontSize: 13 }}>
          Nur den Spieler-Draft löschen und neu beginnen. Der Thesen-Draft bleibt.
        </span>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            setError(null);
            dialog.current?.showModal();
          }}
        >
          Spieler-Draft zurücksetzen
        </button>
        <dialog ref={dialog} className="confirm-dialog" aria-labelledby="reset-pd-title">
          <h2 id="reset-pd-title" className="panel-title">
            Spieler-Draft von Spieltag {number} zurücksetzen?
          </h2>
          <p>
            Das löscht <strong>alle gesetzten Spieler</strong> dieses Spieltags. Thesen, Räder, Münzwurf und Thesen-Draft bleiben.
            Beide landen wieder beim fertigen Thesen-Draft und können den Spieler-Draft neu starten.
          </p>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>
              Abbrechen
            </button>
            <button type="button" className="btn btn-danger" disabled={pending} onClick={confirm}>
              {pending ? "Wird zurückgesetzt …" : "Spieler-Draft löschen"}
            </button>
          </div>
        </dialog>
      </div>
      <ResetMatchday matchdayId={matchdayId} number={number} />
    </>
  );
}
