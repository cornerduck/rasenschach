"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { assignTheses, splitTheses, validateTheses, type ClubInfo, type DraftThesis, type MatchInfo } from "@/lib/theses/parse";
import { saveTheses } from "../actions";

export interface EditorMatch extends MatchInfo {
  label: string;
}

export function ThesesEditor({
  matchdayId,
  number,
  matches,
  clubs,
  initial,
}: {
  matchdayId: number;
  number: number;
  matches: EditorMatch[];
  clubs: ClubInfo[];
  initial: DraftThesis[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftThesis[]>(initial);
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const check = useMemo(() => validateTheses(rows, matches.length), [rows, matches.length]);

  const apply = () => {
    const lines = splitTheses(paste);
    if (lines.length === 0) return;
    setRows(assignTheses(lines, matches, clubs));
    setDirty(true);
    setMessage(null);
  };

  const update = (i: number, patch: Partial<DraftThesis>) => {
    setRows((r) => r.map((t, j) => (j === i ? { ...t, ...patch, matchSource: patch.matchId !== undefined ? null : t.matchSource } : t)));
    setDirty(true);
    setMessage(null);
  };

  const move = (i: number, dir: -1 | 1) => {
    setRows((r) => {
      const j = i + dir;
      if (j < 0 || j >= r.length) return r;
      const copy = [...r];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setDirty(true);
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveTheses(
        matchdayId,
        rows.map((t) => ({ kind: t.kind, matchId: t.kind === "spiel" ? t.matchId : null, text: t.text.trim() })),
      );
      if (res.ok) {
        setMessage({ kind: "ok", text: "Gespeichert." });
        setDirty(false);
        router.refresh();
      } else setMessage({ kind: "error", text: res.error });
    });

  return (
    <div className="theses-layout">
      <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 className="panel-title">Thesen einfügen</h2>
        <p className="muted" style={{ margin: 0 }}>
          Alle 12 Thesen von Calcio Berlin hier einfügen, eine pro Zeile: zuerst die 3 Spieltagsthesen, dann die 9 Spielthesen.
          Nummern und Überschriften werden entfernt, Spiele über die Vereinsnamen erkannt.
        </p>
        <textarea
          className="input"
          rows={12}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"1. Es gibt mindestens 3 Unentschieden.\n2. …"}
          aria-label="Thesen einfügen"
        />
        <button type="button" className="btn btn-secondary" onClick={apply} disabled={!paste.trim()}>
          In die Liste übernehmen
        </button>
      </section>

      <section className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h2 className="panel-title">Thesen ({rows.length}/12)</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            <span className="legend-name" /> per Vereinsname erkannt · <span className="legend-order" /> nach Reihenfolge, bitte prüfen
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="faint">Noch keine Thesen. Links einfügen und übernehmen.</p>
        ) : (
          <ol className="thesis-rows">
            {rows.map((t, i) => (
              <li key={i} className="thesis-row">
                <span className="thesis-no">{i + 1}</span>
                <div className="thesis-fields">
                  <input className="input" value={t.text} onChange={(e) => update(i, { text: e.target.value })} aria-label={`These ${i + 1}`} />
                  <div className="thesis-meta">
                    <select
                      className="select"
                      value={t.kind}
                      onChange={(e) => update(i, { kind: e.target.value as DraftThesis["kind"], matchId: null })}
                      aria-label={`Art von These ${i + 1}`}
                    >
                      <option value="spieltag">Spieltagsthese</option>
                      <option value="spiel">Spielthese</option>
                    </select>
                    {t.kind === "spiel" && (
                      <select
                        className={`select ${t.matchSource === "reihenfolge" ? "select-check" : t.matchSource === "name" ? "select-found" : ""}`}
                        value={t.matchId ?? ""}
                        onChange={(e) => update(i, { matchId: e.target.value ? Number(e.target.value) : null })}
                        aria-label={`Spiel zu These ${i + 1}`}
                      >
                        <option value="">Spiel wählen …</option>
                        {matches.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <span className="thesis-move">
                      <button type="button" className="btn btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="nach oben">
                        ↑
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="nach unten">
                        ↓
                      </button>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        {(check.errors.length > 0 || check.warnings.length > 0) && rows.length > 0 && (
          <ul className="check-list">
            {check.errors.map((e) => (
              <li key={e} className="check-error">
                {e}
              </li>
            ))}
            {check.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {message && (
          <p className={message.kind === "error" ? "error-box" : "ok-box"} role="status">
            {message.text}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" onClick={save} disabled={pending || check.errors.length > 0 || !dirty}>
            {pending ? "Speichern …" : "Thesen speichern"}
          </button>
          {!dirty && rows.length === 12 && (
            <Link className="btn btn-bent" href={`/spieltag/${number}/vorbereitung`}>
              Weiter zur Spielvorbereitung
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
