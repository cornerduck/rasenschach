"use client";

import { useState } from "react";

export interface ClubLogoData {
  code: string;
  /** Vereinsfarben für den Ersatz ohne Logo */
  primary: string;
  secondary: string;
  /** Adresse im eigenen Speicher (nie eine fremde Seite) */
  logoUrl: string | null;
}

/**
 * Kleines Vereinslogo. Fehlt das Logo oder lädt es nicht, erscheint das Vereinskürzel
 * in Vereinsfarbe (bzw. ein Punkt in Vereinsfarbe). `decorative`: der Vereinsname steht daneben, das Logo braucht keinen
 * eigenen Text für Screenreader.
 */
export function ClubLogo({
  club,
  size = 18,
  decorative = false,
  fallback = "code",
}: {
  club: ClubLogoData;
  size?: number;
  decorative?: boolean;
  /** Ersatz ohne Logo: Kürzel, oder nur ein Punkt in Vereinsfarbe (wenn das Kürzel daneben steht) */
  fallback?: "code" | "dot";
}) {
  const [broken, setBroken] = useState(false);
  if (club.logoUrl && !broken) {
    // Heller runder Hintergrund, damit auch dunkle Logos (z. B. Paderborn) auf dem dunklen Design lesbar sind
    const inner = Math.round(size * 0.74);
    return (
      <span className="club-logo" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={club.logoUrl}
          alt={decorative ? "" : club.code}
          width={inner}
          height={inner}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      </span>
    );
  }
  if (fallback === "dot") {
    const d = Math.max(8, Math.round(size * 0.6));
    return (
      <span
        className="club-logo-dot"
        style={{ width: d, height: d, background: club.primary, borderColor: club.secondary }}
        aria-hidden={decorative || undefined}
        title={decorative ? undefined : club.code}
      />
    );
  }
  return (
    <span
      className="club-logo-fallback"
      style={{ height: size, fontSize: Math.max(8, Math.round(size * 0.45)), background: club.primary, color: club.secondary, borderColor: club.secondary }}
      aria-hidden={decorative || undefined}
      title={decorative ? undefined : club.code}
    >
      {club.code}
    </span>
  );
}
