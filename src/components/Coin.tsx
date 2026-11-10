"use client";

import { useEffect, useState } from "react";

export const COIN_SPIN_MS = 2600;
type Manager = "bent" | "bjoern";

/**
 * Münze für „Wer beginnt?“. Vorderseite Bent, Rückseite Björn. Das Ergebnis kommt immer
 * vom Server; sobald es neu da ist, wirft sich die Münze bei beiden gleich und landet
 * auf derselben Seite. Wer die Seite später öffnet, sieht direkt das Ergebnis.
 */
export function Coin({ result }: { result: Manager | null }) {
  const face = (m: Manager) => (m === "bjoern" ? 180 : 0);
  const [prev, setPrev] = useState(result);
  const [rotation, setRotation] = useState(result ? face(result) : 0);
  const [spinning, setSpinning] = useState(false);

  // Neuer Wert vom Server: beim Rendern anpassen (kein setState im Effect)
  if (result !== prev) {
    setPrev(result);
    if (result === null) {
      setRotation(0);
      setSpinning(false);
    } else if (prev === null) {
      setRotation(Math.ceil(rotation / 360) * 360 + 360 * 8 + face(result)); // 8 volle Drehungen
      setSpinning(true);
    } else {
      setRotation(face(result));
      setSpinning(false);
    }
  }

  useEffect(() => {
    if (!spinning) return;
    const t = setTimeout(() => setSpinning(false), COIN_SPIN_MS);
    return () => clearTimeout(t);
  }, [spinning]);

  const label = result === null ? "Münze noch nicht geworfen" : spinning ? "Münze fliegt" : `Münze zeigt ${result === "bent" ? "Bent" : "Björn"}`;

  return (
    <div className={`coin ${spinning ? "is-tossing" : ""} ${result === null ? "is-idle" : ""}`} role="img" aria-label={label}>
      <div
        className="coin-inner"
        style={{
          transform: `rotateY(${rotation}deg)`,
          transition: spinning ? `transform ${COIN_SPIN_MS}ms cubic-bezier(0.2, 0.6, 0.25, 1)` : "none",
        }}
      >
        <div className="coin-face coin-bent">
          <span>{result === null ? "?" : "BENT"}</span>
        </div>
        <div className="coin-face coin-bjoern">
          <span>BJÖRN</span>
        </div>
      </div>
    </div>
  );
}
