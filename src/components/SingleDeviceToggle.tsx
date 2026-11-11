"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setSingleDevice } from "@/app/spieltag/[nummer]/actions";

/**
 * Ein-Gerät-Modus: Schalter für den Admin, Hinweis für den anderen.
 * Der Zustand kommt live über die Spieltag-Seite (MatchdayLive lädt bei Änderung neu).
 */
export function SingleDeviceToggle({ matchdayId, on, isAdmin }: { matchdayId: number; on: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) {
    return on ? (
      <span className="sd-chip" title="Bent spielt gerade für beide an einem Gerät">
        Ein-Gerät-Modus an
      </span>
    ) : null;
  }
  return (
    <span className="sd-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`sd-switch ${on ? "is-on" : ""}`}
        disabled={pending}
        title="Beide spielen an diesem Laptop mit dem Admin-Konto"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await setSingleDevice(matchdayId, !on);
            if (res.ok) router.refresh();
            else setError(res.error);
          })
        }
      >
        <span className="sd-knob" aria-hidden="true" />
        Ein-Gerät-Modus
      </button>
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
