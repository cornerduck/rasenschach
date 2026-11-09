"use client";

import { useEffect, useState } from "react";

const SIZE = 280;
const C = SIZE / 2;
const R = 136;
const FILLS = ["#1F2522", "#262D29"];
const SPIN_MS = 3800;

/**
 * Glücksrad. Der Zeiger steht rechts. Das Ergebnis kommt immer vom Server; das Rad
 * dreht sich, sobald ein Wert neu da ist, egal ob man selbst gedreht hat oder der andere.
 */
export function Wheel({
  labels,
  winner,
  radial = false,
  ariaLabel,
}: {
  labels: string[];
  /** Index des Ergebnisses oder null, solange nicht gedreht */
  winner: number | null;
  /** Beschriftung entlang der Speichen (für viele, lange Einträge) */
  radial?: boolean;
  ariaLabel: string;
}) {
  const n = labels.length;
  const step = 360 / n;
  const target = (i: number) => -i * step;

  const [prevWinner, setPrevWinner] = useState(winner);
  const [rotation, setRotation] = useState(() => (winner === null ? 0 : target(winner)));
  const [spinning, setSpinning] = useState(false);

  // Neuer Wert vom Server: beim Rendern anpassen (kein setState im Effect)
  if (winner !== prevWinner) {
    setPrevWinner(winner);
    if (winner === null) {
      setRotation(0);
      setSpinning(false);
    } else if (prevWinner === null) {
      setRotation(Math.ceil(rotation / 360) * 360 - 360 * 6 + target(winner)); // 6 volle Umdrehungen
      setSpinning(true);
    } else {
      setRotation(target(winner));
      setSpinning(false);
    }
  }

  useEffect(() => {
    if (!spinning) return;
    const t = setTimeout(() => setSpinning(false), SPIN_MS);
    return () => clearTimeout(t);
  }, [spinning]);

  const settled = winner !== null && !spinning;

  const rad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (deg: number, r: number) => `${(C + r * Math.cos(rad(deg))).toFixed(1)} ${(C + r * Math.sin(rad(deg))).toFixed(1)}`;

  return (
    <div className="wheel" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={ariaLabel}>
        <g
          className="wheel-disc"
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.2, 1)` : "none",
          }}
        >
          {labels.map((label, i) => {
            const a0 = i * step - step / 2;
            const a1 = a0 + step;
            const am = i * step;
            const win = settled && i === winner;
            const lr = radial ? 86 : 92;
            const tx = C + lr * Math.cos(rad(am));
            const ty = C + lr * Math.sin(rad(am));
            return (
              <g key={label}>
                <path
                  d={`M ${C} ${C} L ${pt(a0, R)} A ${R} ${R} 0 0 1 ${pt(a1, R)} Z`}
                  fill={win ? "#ECEFED" : FILLS[i % 2]}
                  stroke="#0B0D0C"
                  strokeWidth={radial ? 2 : 3}
                />
                <text
                  x={tx}
                  y={ty}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={radial ? `rotate(${am} ${tx} ${ty})` : undefined}
                  fontFamily={radial ? "var(--font-body)" : "var(--font-display)"}
                  fontWeight={radial ? 600 : 800}
                  fontSize={radial ? 11 : 30}
                  fill={win ? "#0B0D0C" : "#ECEFED"}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>
        <circle cx={C} cy={C} r={26} fill="#0B0D0C" stroke="#2A312E" strokeWidth={2} />
      </svg>
      <svg className="wheel-pointer" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <path d="M2 14 L26 2 L26 26 Z" fill="#ECEFED" />
      </svg>
    </div>
  );
}

/** Ob die Dreh-Animation gerade läuft (für Ergebnistext erst nach dem Stopp) */
export const WHEEL_SPIN_MS = SPIN_MS;
