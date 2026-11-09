"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { resetMatchday } from "@/app/spieltag/[nummer]/actions";

/** Admin: Spieltag auf Anfang stellen, mit Sicherheitsabfrage */
export function ResetMatchday({ matchdayId, number }: { matchdayId: number; number: number }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const word = `Spieltag ${number}`;

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const res = await resetMatchday(matchdayId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      dialog.current?.close();
      router.push(`/spieltag/${number}/thesen`);
      router.refresh();
    });

  return (
    <div className="admin-zone">
      <span className="chip-admin">ADMIN</span>
      <span className="muted" style={{ fontSize: 13 }}>
        Thesen, Räder, Startspieler und Drafts löschen und neu beginnen.
      </span>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          setTyped("");
          setError(null);
          dialog.current?.showModal();
        }}
      >
        Spieltag zurücksetzen
      </button>

      <dialog ref={dialog} className="confirm-dialog" aria-labelledby="reset-title">
        <h2 id="reset-title" className="panel-title">
          {word} zurücksetzen?
        </h2>
        <p>
          Das löscht <strong>alle 12 Thesen, beide Räder, den Startspieler und alle Züge</strong> im Thesen- und Spieler-Draft
          dieses Spieltags. Spiele, Tore und eingetragene Spielerwerte bleiben. Das lässt sich nicht rückgängig machen.
        </p>
        <label className="field">
          Zur Bestätigung „{word}“ eintippen
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-danger" disabled={pending || typed.trim() !== word} onClick={confirm}>
            {pending ? "Wird zurückgesetzt …" : "Endgültig zurücksetzen"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
