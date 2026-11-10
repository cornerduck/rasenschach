"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatNumber, parseNumber } from "@/lib/ui/evaluation";
import { setLeagueEntries, setStatValue, setThesisOutcome, setWeekly, type ActionResult } from "../actions";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        onOk?.();
        router.refresh();
      } else setError(res.error);
    });
  return { pending, error, setError, run };
}

const ErrorText = ({ error }: { error: string | null }) =>
  error ? (
    <span className="error-text" role="alert">
      {error}
    </span>
  ) : null;

// ---------------------------------------------------------------------------

/** These auflösen: Eingetroffen / Nicht eingetroffen (zählt als Bents Bestätigung) */
export function ThesisResolver({ thesisId, outcome, locked }: { thesisId: number; outcome: boolean | null; locked: boolean }) {
  const { pending, error, run } = useAction();
  const btn = (value: boolean, label: string) => (
    <button
      type="button"
      className={`seg-btn ${outcome === value ? "is-active" : ""}`}
      aria-pressed={outcome === value}
      disabled={pending || locked}
      onClick={() => run(() => setThesisOutcome(thesisId, outcome === value ? null : value))}
    >
      {label}
    </button>
  );
  return (
    <span className="seg">
      {btn(true, "Eingetroffen")}
      {btn(false, "Nicht eingetroffen")}
      <ErrorText error={error} />
    </span>
  );
}

// ---------------------------------------------------------------------------

export interface ValueModel {
  key: string;
  label: string;
  unit?: string;
  decimal?: boolean;
  hint?: string;
  /** automatischer Wert und seine Herkunft */
  auto: number | null;
  autoSource: string | null;
  manual: number | null;
}

/** Ein Wert: automatisch (falls vorhanden) plus Eingabefeld zum Überschreiben. Speichert beim Verlassen des Feldes. */
export function StatInput({ matchdayId, playerId, v, locked }: { matchdayId: number; playerId: number; v: ValueModel; locked: boolean }) {
  const { pending, error, setError, run } = useAction();
  const initial = v.manual === null ? "" : formatNumber(v.manual);
  const [text, setText] = useState(initial);
  const [last, setLast] = useState(initial);
  // Wert von außen geändert (z. B. Live-Aktualisierung): Feld nachziehen
  if (initial !== last) {
    setLast(initial);
    setText(initial);
  }

  const save = () => {
    if (text.trim() === initial) return;
    const n = parseNumber(text);
    if (n !== null && Number.isNaN(n)) return setError("Bitte eine Zahl eintragen, z. B. 12,4");
    if (n !== null && !v.decimal && !Number.isInteger(n)) return setError("Bitte eine ganze Zahl eintragen");
    run(() => setStatValue(matchdayId, playerId, v.key, n));
  };

  const source = v.manual !== null ? "manual" : v.auto !== null ? "auto" : "missing";
  return (
    <label className="stat-input">
      <span className="stat-input-label">
        {v.label}
        {v.unit ? ` (${v.unit})` : ""}
        <span className={`src-badge src-${source}`} title={source === "auto" ? `automatisch: ${v.autoSource}` : undefined}>
          {source === "manual" ? "Hand" : source === "auto" ? "auto" : v.key === "minutes_played" ? "leer" : "fehlt"}
        </span>
      </span>
      <span className="stat-input-row">
        <input
          className="input input-small"
          inputMode={v.decimal ? "decimal" : "numeric"}
          value={text}
          placeholder={v.auto !== null ? formatNumber(v.auto) : "–"}
          disabled={locked || pending}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-describedby={`h-${playerId}-${v.key}`}
        />
        {v.manual !== null && !locked && (
          <button
            type="button"
            className="link-btn"
            title={v.auto !== null ? `Zurück auf automatisch (${formatNumber(v.auto)})` : "Handeingabe löschen"}
            onClick={() => {
              setText("");
              run(() => setStatValue(matchdayId, playerId, v.key, null));
            }}
          >
            ×
          </button>
        )}
      </span>
      <span id={`h-${playerId}-${v.key}`} className="stat-input-hint">
        {v.auto !== null ? `${v.manual !== null ? "überschreibt " : ""}auto ${formatNumber(v.auto)} (${v.autoSource})` : v.hint ?? ""}
      </span>
      <ErrorText error={error} />
    </label>
  );
}

// ---------------------------------------------------------------------------

/** Team der Woche (+2) / Spieler der Woche (+3) */
export function WeeklySelect({ matchdayId, playerId, value, locked }: { matchdayId: number; playerId: number; value: "keins" | "team" | "spieler"; locked: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <label className="stat-input">
      <span className="stat-input-label">
        Woche (Sofascore)
        <span className={`src-badge src-${value === "keins" ? "missing" : "manual"}`}>{value === "keins" ? "–" : "Hand"}</span>
      </span>
      <select
        className="input input-small"
        value={value}
        disabled={locked || pending}
        onChange={(e) => run(() => setWeekly(matchdayId, playerId, e.target.value as "keins" | "team" | "spieler"))}
      >
        <option value="keins">nicht dabei</option>
        <option value="team">Team der Woche +2</option>
        <option value="spieler">Spieler der Woche +3</option>
      </select>
      <ErrorText error={error} />
    </label>
  );
}

// ---------------------------------------------------------------------------

export interface LeagueOption {
  playerId: number;
  label: string;
}
export interface LeagueEntryModel {
  playerId: number | null;
  name: string;
  value: number | null;
  rank: number;
}

/**
 * Ligaweite Bestwerte eintragen (z. B. die drei besten Laufleistungen).
 * Das Tool berechnet daraus die Plätze: geteilter Platz für alle, danach der übernächste.
 */
export function LeagueEditor({
  matchdayId,
  statKey,
  title,
  unit,
  topN,
  options,
  entries,
  locked,
  note,
}: {
  matchdayId: number;
  statKey: string;
  title: string;
  unit: string;
  topN: number;
  options: LeagueOption[];
  entries: LeagueEntryModel[];
  locked: boolean;
  note?: string;
}) {
  const { pending, error, setError, run } = useAction();
  type Row = { playerId: string; name: string; value: string };
  const fromProps = (): Row[] =>
    entries.length
      ? entries.map((e) => ({ playerId: e.playerId === null ? "anderer" : String(e.playerId), name: e.name, value: e.value === null ? "" : formatNumber(e.value) }))
      : [{ playerId: "anderer", name: "", value: "" }];
  const [rows, setRows] = useState<Row[]>(fromProps);
  const [dirty, setDirty] = useState(false);
  const key = JSON.stringify(entries);
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    if (!dirty) setRows(fromProps());
  }

  const update = (i: number, patch: Partial<Row>) => {
    setDirty(true);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const save = () => {
    const list = rows.filter((r) => r.value.trim() !== "" || r.name.trim() !== "" || r.playerId !== "anderer");
    const parsed: { playerId: number | null; name: string; value: number }[] = [];
    for (const r of list) {
      const v = parseNumber(r.value);
      if (v === null || Number.isNaN(v)) return setError("Bitte bei jedem Eintrag einen Wert eintragen, z. B. 12,4");
      const pid = r.playerId === "anderer" ? null : Number(r.playerId);
      parsed.push({ playerId: pid, name: pid === null ? r.name : options.find((o) => o.playerId === pid)?.label.split(" (")[0] ?? "", value: v });
    }
    run(() => setLeagueEntries(matchdayId, statKey, parsed), () => setDirty(false));
  };

  const rankOf = (i: number) => {
    const row = rows[i];
    const saved = entries.find((e) => (e.playerId === null ? row.playerId === "anderer" && e.name === row.name : String(e.playerId) === row.playerId));
    return !dirty && saved ? saved.rank : null;
  };

  return (
    <div className="league-editor">
      <div className="league-head">
        <span className="league-title">{title}</span>
        <span className={`src-badge src-${entries.length ? "manual" : "missing"}`}>{entries.length ? "eingetragen" : "fehlt"}</span>
      </div>
      {note && <span className="stat-input-hint">{note}</span>}
      {rows.map((r, i) => (
        <div key={i} className="league-row">
          <span className="league-rank">{rankOf(i) ? `${rankOf(i)}.` : "–"}</span>
          <select className="input input-small" value={r.playerId} disabled={locked} onChange={(e) => update(i, { playerId: e.target.value })} aria-label="Spieler">
            <option value="anderer">Anderer Spieler …</option>
            {options.map((o) => (
              <option key={o.playerId} value={o.playerId}>
                {o.label}
              </option>
            ))}
          </select>
          {r.playerId === "anderer" && (
            <input className="input input-small" placeholder="Name" value={r.name} disabled={locked} onChange={(e) => update(i, { name: e.target.value })} aria-label="Name" />
          )}
          <input
            className="input input-small league-value"
            inputMode="decimal"
            placeholder={unit || "Wert"}
            value={r.value}
            disabled={locked}
            onChange={(e) => update(i, { value: e.target.value })}
            aria-label={`Wert${unit ? ` in ${unit}` : ""}`}
          />
          {!locked && (
            <button type="button" className="link-btn" aria-label="Eintrag entfernen" onClick={() => { setDirty(true); setRows((rs) => rs.filter((_, j) => j !== i)); }}>
              ×
            </button>
          )}
        </div>
      ))}
      {!locked && (
        <div className="league-actions">
          {rows.length < topN + 3 && (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => { setDirty(true); setRows((rs) => [...rs, { playerId: "anderer", name: "", value: "" }]); }}>
              + Eintrag
            </button>
          )}
          <button type="button" className="btn btn-small btn-secondary" disabled={pending || !dirty} onClick={save}>
            {pending ? "Speichere …" : "Speichern"}
          </button>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}
