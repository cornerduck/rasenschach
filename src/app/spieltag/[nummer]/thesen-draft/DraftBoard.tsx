"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition, type DragEvent } from "react";
import { picksInARow, snakeTurn } from "@/lib/scoring/assemble";
import { THESIS_FIELD_ORDER } from "@/lib/scoring/theses";
import type { QuestionValue, ThesisField } from "@/lib/scoring/types";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { QUESTION_LABELS, QUESTION_SHORT } from "@/lib/ui/prep-labels";
import { makeThesisPick } from "../actions";

type Manager = "bent" | "bjoern";

export interface DraftThesis {
  id: number;
  sortOrder: number;
  label: string; // "SPIELTAG" oder "SVW · RBL"
  text: string;
}

export interface DraftPick {
  pickNo: number;
  manager: Manager;
  field: ThesisField;
  thesisId: number;
}

const FIELDS = THESIS_FIELD_ORDER;
const FIELD_HEAD: Record<ThesisField, { v: string; l: string }> = {
  plus_minus_3: { v: "+/−3", l: "WAHRSCHEINLICH" },
  minus_plus_3: { v: "−/+3", l: "UNWAHRSCHEINLICH" },
  plus_1: { v: "+1", l: "WAHRSCHEINLICH" },
  minus_1: { v: "−1", l: "UNWAHRSCHEINLICH" },
  frage: { v: "?", l: "GELOST" },
};
const NAME: Record<Manager, string> = { bent: "Bent", bjoern: "Björn" };

export function DraftBoard({
  matchdayId,
  number,
  me,
  starter,
  questionValue,
  theses,
  initialPicks,
  locked,
}: {
  matchdayId: number;
  number: number;
  me: Manager | null;
  starter: Manager;
  questionValue: QuestionValue;
  theses: DraftThesis[];
  initialPicks: DraftPick[];
  locked: boolean;
}) {
  const [picks, setPicks] = useState<DraftPick[]>(initialPicks);
  const [selThesis, setSelThesis] = useState<number | null>(null);
  const [selField, setSelField] = useState<ThesisField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<ThesisField | null>(null);

  const addPicks = useCallback((list: DraftPick[]) => {
    setPicks((prev) => {
      const byNo = new Map(prev.map((p) => [p.pickNo, p]));
      for (const p of list) byNo.set(p.pickNo, p);
      return [...byNo.values()].sort((a, b) => a.pickNo - b.pickNo);
    });
  }, []);

  // Live: neue Züge per Realtime; beim (Wieder-)Verbinden einmal komplett nachladen.
  // Neu laden der Seite und Zurücksetzen erledigt MatchdayLive.
  const loadPicks = useCallback(async () => {
    const { data } = await createClient().from("thesis_picks").select("pick_no, manager, field, thesis_id").eq("matchday_id", matchdayId);
    if (data) setPicks(data.map((p) => ({ pickNo: p.pick_no, manager: p.manager, field: p.field, thesisId: p.thesis_id })).sort((a, b) => a.pickNo - b.pickNo));
  }, [matchdayId]);
  useRealtime(
    `thesen-draft-${matchdayId}`,
    [{ table: "thesis_picks", event: "INSERT", filter: `matchday_id=eq.${matchdayId}` }],
    (_table, payload) => {
      const p = payload.new as { pick_no: number; manager: Manager; field: ThesisField; thesis_id: number };
      addPicks([{ pickNo: p.pick_no, manager: p.manager, field: p.field, thesisId: p.thesis_id }]);
    },
    loadPicks,
  );

  const next = picks.length + 1;
  const done = picks.length >= 10;
  const turn: Manager | null = done || locked ? null : snakeTurn(starter, next);
  const inARow = turn ? picksInARow(next) : 0;
  const myTurn = !!me && turn === me && !locked;
  const thesisById = useMemo(() => new Map(theses.map((t) => [t.id, t])), [theses]);
  const usedTheses = new Set(picks.map((p) => p.thesisId));
  const pool = theses.filter((t) => !usedTheses.has(t.id));
  const slot = (m: Manager, f: ThesisField) => picks.find((p) => p.manager === m && p.field === f);

  const place = () => {
    if (selThesis === null || selField === null) return;
    const thesisId = selThesis;
    const field = selField;
    if (!myTurn || usedTheses.has(thesisId) || slot(me!, field)) return;
    startTransition(async () => {
      setError(null);
      const res = await makeThesisPick(matchdayId, field, thesisId);
      if (res.ok) {
        addPicks([{ pickNo: next, manager: me!, field, thesisId }]);
        setSelThesis(null);
        setSelField(null);
      } else setError(res.error);
    });
  };

  // ?-Feld zeigt direkt den ausgelosten Wert dieses Spieltags
  const fieldHead = (f: ThesisField) => (f === "frage" ? QUESTION_LABELS[questionValue] : FIELD_HEAD[f].v);
  const fieldShort = (f: ThesisField) => (f === "frage" ? QUESTION_SHORT[questionValue] : FIELD_HEAD[f].l);

  // Drag-and-drop: These aus dem Pool auf ein freies eigenes Feld ziehen (danach bestätigen)
  const onDragStart = (e: DragEvent, id: number) => {
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.effectAllowed = "move";
    setDragging(id);
    setSelThesis(id);
  };
  const onDragEnd = () => {
    setDragging(null);
    setDropTarget(null);
  };
  const dropProps = (f: ThesisField) => ({
    onDragOver: (e: DragEvent) => {
      if (dragging === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget !== f) setDropTarget(f);
    },
    onDragLeave: () => setDropTarget((t) => (t === f ? null : t)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = Number(e.dataTransfer.getData("text/plain")) || dragging;
      setDragging(null);
      setDropTarget(null);
      if (id) {
        setSelThesis(id);
        setSelField(f);
      }
    },
  });

  const row = (m: Manager) => (
    <div className="draft-row">
      {FIELDS.map((f) => {
        const p = slot(m, f);
        if (p) {
          const t = thesisById.get(p.thesisId);
          return (
            <div key={f} className={`draft-card card-${m}`}>
              <span className="draft-card-tag">{t?.label}</span>
              <span className="draft-card-text">{t?.text}</span>
            </div>
          );
        }
        if (m === me && myTurn) {
          const preview = selField === f && selThesis !== null ? thesisById.get(selThesis) : null;
          return (
            <button
              key={f}
              type="button"
              className={`draft-empty empty-${m} is-mine ${selField === f ? "is-selected" : ""} ${dragging !== null ? "is-droppable" : ""} ${dropTarget === f ? "is-drop" : ""} ${preview ? "has-preview" : ""}`}
              aria-label={`Feld ${fieldHead(f)} wählen`}
              aria-pressed={selField === f}
              onClick={() => setSelField(selField === f ? null : f)}
              {...dropProps(f)}
            >
              {preview ? (
                <>
                  <span className="draft-card-tag">{preview.label}</span>
                  <span className="draft-card-text">{preview.text}</span>
                </>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              )}
            </button>
          );
        }
        return <div key={f} className={`draft-empty empty-${m}`} />;
      })}
    </div>
  );

  const status = done
    ? "Thesen-Draft fertig"
    : locked
      ? "Deadline vorbei, Draft gesperrt"
      : `${myTurn ? "Du bist" : `${NAME[turn!]} ist`} am Zug · ${inARow} ${inARow === 1 ? "These" : "Thesen"} setzen`;

  return (
    <>
      <div className={`draft-status ${turn ? `status-${turn}` : ""}`} role="status" aria-live="polite">
        {turn && <span className="dot" />}
        <span style={{ fontWeight: 600 }}>{status}</span>
      </div>

      <div className="draft-order" aria-label="Reihenfolge">
        <span className="label-small muted">Reihenfolge</span>
        {Array.from({ length: 10 }, (_, i) => {
          const who = snakeTurn(starter, i + 1);
          const isDone = i < picks.length;
          const isNow = !!turn && i >= picks.length && i < picks.length + inARow;
          return (
            <span key={i} className={`order-box order-${who} ${isDone ? "is-done" : ""} ${isNow ? "is-now" : ""}`} title={`Zug ${i + 1}: ${NAME[who]}`}>
              {who === "bent" ? "B" : "J"}
            </span>
          );
        })}
        <span className="muted" style={{ fontSize: 12 }}>
          Snake-Draft · {NAME[starter]} hat den Münzwurf gewonnen
        </span>
      </div>

      <div className="draft-layout">
        <div className="draft-main">
          <div className="draft-scroll">
            <div className="draft-board">
              <div className="draft-row">
                {FIELDS.map((f) => (
                  <div key={f} className="draft-head">
                    <span className="draft-head-v">{fieldHead(f)}</span>
                    <span className="label-small muted">{fieldShort(f)}</span>
                  </div>
                ))}
              </div>
              {row("bent")}
              <div className="vs-bar">
                <div className={`vs-side vs-bent ${turn === "bent" ? "is-turn" : ""}`}>
                  <span className="vs-state">{turn === "bent" ? "● AM ZUG" : done ? "FERTIG" : "WARTET"}</span>
                  <span className="vs-name">BENT</span>
                </div>
                <div className="vs-mid">VS</div>
                <div className={`vs-side vs-bjoern ${turn === "bjoern" ? "is-turn" : ""}`}>
                  <span className="vs-name">BJÖRN</span>
                  <span className="vs-state">{turn === "bjoern" ? "● AM ZUG" : done ? "FERTIG" : "WARTET"}</span>
                </div>
              </div>
              {row("bjoern")}
            </div>
          </div>

          {myTurn && (
            <div className="place-bar">
              <span>
                {selThesis === null && selField === null && "These aus dem Pool auf ein freies Feld ziehen oder antippen."}
                {selThesis !== null && selField === null && "Jetzt ein freies Feld wählen."}
                {selThesis === null && selField !== null && "Jetzt eine These im Pool wählen."}
                {selThesis !== null && selField !== null && (
                  <>
                    <strong>„{thesisById.get(selThesis)?.text}“</strong> auf <strong>{fieldHead(selField)}</strong> setzen?
                  </>
                )}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                {(selThesis !== null || selField !== null) && (
                  <button type="button" className="btn btn-ghost" onClick={() => { setSelThesis(null); setSelField(null); }}>
                    Abbrechen
                  </button>
                )}
                <button type="button" className={`btn btn-${me}`} disabled={pending || selThesis === null || selField === null} onClick={place}>
                  {pending ? "Setze …" : "Setzen"}
                </button>
              </span>
            </div>
          )}
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          {done ? (
            <div className="done-bar">
              <span>Alle 10 Thesen sind gesetzt. Als Nächstes der Spieler-Draft, {NAME[starter === "bent" ? "bjoern" : "bent"]} beginnt.</span>
              <span className="btn btn-bent" aria-disabled="true" title="Die Seite folgt als Nächstes">
                Zum Spieler-Draft
              </span>
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              {me ? `These aus dem Pool auf ein freies Feld ziehen, oder These antippen und dann das Feld. ${NAME[me === "bent" ? "bjoern" : "bent"]} sieht deine Züge live.` : "Nur Bent und Björn können setzen."}
            </span>
          )}
        </div>

        <aside className="draft-pool">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 className="panel-title">Thesen-Pool</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              {pool.length} von {theses.length} frei
            </span>
          </div>
          {pool.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`pool-item ${selThesis === t.id ? `is-selected sel-${me}` : ""} ${dragging === t.id ? "is-dragging" : ""}`}
              disabled={!myTurn}
              draggable={myTurn}
              onDragStart={(e) => onDragStart(e, t.id)}
              onDragEnd={onDragEnd}
              aria-pressed={selThesis === t.id}
              onClick={() => setSelThesis(selThesis === t.id ? null : t.id)}
            >
              <span className="pool-tag">{t.label}</span>
              <span className="pool-text">{t.text}</span>
            </button>
          ))}
          {pool.length === 0 && <span className="faint">Alle Thesen vergeben.</span>}
          {done && pool.length > 0 && <span className="faint" style={{ fontSize: 12 }}>Diese {pool.length} bleiben übrig.</span>}
          {done && (
            <Link className="btn btn-secondary" href={`/spieltag/${number}/thesen`}>
              Alle Thesen ansehen
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
