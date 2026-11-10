"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useRef, useState, useTransition } from "react";
import { ClubLogo, type ClubLogoData } from "@/components/ClubLogo";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { normalizeName } from "@/lib/roster/names";
import { removePlayerPhoto, uploadPlayerPhoto } from "./actions";

export interface PhotoPlayer {
  id: number;
  name: string;
  position: string;
  number: number | null;
  club: ClubLogoData & { name: string };
  photoUrl: string | null;
  drafted: number;
}

const MAX = 1024 * 1024;
const LIMIT = 40;

/** Eine Zeile: Bild bzw. Trikot, Name, Hochladen/Ersetzen, Löschen */
function PhotoRow({ p }: { p: PhotoPlayer }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (input.current) input.current.value = "";
      if (res.ok) router.refresh();
      else setError(res.error ?? "Fehler");
    });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX) return setError("Die Datei ist größer als 1 MB");
    const data = new FormData();
    data.set("playerId", String(p.id));
    data.set("bild", file);
    run(() => uploadPlayerPhoto(data));
  };

  return (
    <li className="photo-row">
      <PlayerAvatar photoUrl={p.photoUrl} primary={p.club.primary} secondary={p.club.secondary} number={p.number} size={44} jerseyWidth={40} label={false} />
      <span className="rank-main">
        <span className="rank-name">{p.name}</span>
        <span className="rank-meta with-logo">
          <ClubLogo club={p.club} size={14} decorative fallback="dot" />
          {p.position} · {p.club.name}
          {p.drafted > 0 && ` · ${p.drafted}× gedraftet`}
        </span>
        {error && (
          <span className="error-text" role="alert">
            {error}
          </span>
        )}
      </span>
      <span className="photo-actions">
        <label className="btn btn-small btn-secondary">
          {pending ? "…" : p.photoUrl ? "Ersetzen" : "Hochladen"}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            disabled={pending}
            aria-label={`Bild für ${p.name}`}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {p.photoUrl && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            disabled={pending}
            onClick={() => window.confirm(`Bild von ${p.name} löschen?`) && run(() => removePlayerPhoto(p.id))}
          >
            Löschen
          </button>
        )}
      </span>
    </li>
  );
}

export function PhotoManager({ players }: { players: PhotoPlayer[] }) {
  const [query, setQuery] = useState("");
  const q = normalizeName(useDeferredValue(query));
  const missing = players.filter((p) => p.drafted > 0 && !p.photoUrl).sort((a, b) => b.drafted - a.drafted || a.name.localeCompare(b.name, "de"));
  const found = q ? players.filter((p) => q.split(" ").every((t) => normalizeName(`${p.name} ${p.club.code} ${p.club.name}`).includes(t))) : [];

  return (
    <div className="stats-grid">
      <section className="panel stats-panel">
        <div className="stats-head">
          <h2 className="panel-title">Gedraftete Spieler ohne Bild</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            {missing.length}
          </span>
        </div>
        <ul className="photo-list">
          {missing.map((p) => (
            <PhotoRow key={p.id} p={p} />
          ))}
          {missing.length === 0 && <li className="faint">Alle gedrafteten Spieler haben ein Bild.</li>}
        </ul>
      </section>
      <section className="panel stats-panel">
        <h2 className="panel-title">Spieler suchen</h2>
        <label className="field">
          Name oder Verein
          <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="z. B. Grüll oder SVW" autoComplete="off" />
        </label>
        <ul className="photo-list">
          {found.slice(0, LIMIT).map((p) => (
            <PhotoRow key={p.id} p={p} />
          ))}
          {q && found.length === 0 && <li className="faint">Kein Spieler gefunden.</li>}
          {found.length > LIMIT && <li className="faint">… und {found.length - LIMIT} weitere. Suche verfeinern.</li>}
        </ul>
      </section>
    </div>
  );
}
