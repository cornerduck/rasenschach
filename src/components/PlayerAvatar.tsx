"use client";

import { useState } from "react";
import { Jersey } from "./Jersey";

/**
 * Spielerbild rund zugeschnitten. Ohne Bild (oder wenn es nicht lädt) das Trikot
 * in Vereinsfarbe mit Rückennummer.
 */
export function PlayerAvatar({
  photoUrl,
  primary,
  secondary,
  number,
  size,
  jerseyWidth = Math.round(size * 0.85),
  label = true,
}: {
  photoUrl: string | null;
  primary: string;
  secondary: string;
  number: number | null;
  /** Durchmesser des Bildes in Pixeln */
  size: number;
  /** Breite des Trikots, falls kein Bild da ist */
  jerseyWidth?: number;
  /** false = rein dekorativ (Name steht daneben) */
  label?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (photoUrl && !broken) {
    return (
      <span className="player-photo" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </span>
    );
  }
  return <Jersey primary={primary} secondary={secondary} number={number} width={jerseyWidth} label={label} />;
}
