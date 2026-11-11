"use client";

import { useEffect, useRef } from "react";

const NAME = { bent: "Bent", bjoern: "Björn" } as const;

/** Ein-Gerät-Modus: nach einem Zug „Gerät an Björn übergeben“, bis „Weiter“ gedrückt wird */
export function HandoverOverlay({ to, onContinue }: { to: "bent" | "bjoern"; onContinue: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <div className={`handover handover-${to}`} role="dialog" aria-modal="true" aria-labelledby="handover-title">
      <div className="handover-card">
        <span className="label-small">EIN-GERÄT-MODUS</span>
        <h2 id="handover-title" className="handover-title">
          Gerät an {NAME[to]} übergeben
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {NAME[to]} ist jetzt am Zug.
        </p>
        <button ref={button} type="button" className={`btn btn-${to}`} onClick={onContinue}>
          Weiter
        </button>
      </div>
    </div>
  );
}
