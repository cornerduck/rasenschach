"use client";

import { useState } from "react";
import type { Piece } from "@/lib/scoring/types";
import { PIECE_LABEL, PIECE_ORDER } from "@/lib/ui/pieces";

type Manager = "bent" | "bjoern";
const NAME: Record<Manager, string> = { bent: "Bent", bjoern: "Björn" };
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");

export interface PlayerLabel {
  name: string;
  meta: string; // "ST · FCB"
}

export interface PerformanceRow {
  number: number;
  manager: Manager;
  piece: Piece;
  playerId: number;
  points: number;
  lines: string[];
}

/** Beste Einzelleistungen: meiste Punkte einer Figur an einem Spieltag, filterbar nach Figur */
export function BestPerformances({ rows, players }: { rows: PerformanceRow[]; players: Record<number, PlayerLabel> }) {
  const [piece, setPiece] = useState<Piece | null>(null);
  const list = rows.filter((r) => !piece || r.piece === piece).slice(0, 10);
  return (
    <>
      <div className="filter-chips" role="group" aria-label="Figur">
        <button type="button" className={`filter-chip ${piece === null ? "is-active" : ""}`} aria-pressed={piece === null} onClick={() => setPiece(null)}>
          Gesamt
        </button>
        {PIECE_ORDER.map((p) => (
          <button key={p} type="button" className={`filter-chip ${piece === p ? "is-active" : ""}`} aria-pressed={piece === p} onClick={() => setPiece(p)}>
            {PIECE_LABEL[p].charAt(0) + PIECE_LABEL[p].slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <ol className="rank-list">
        {list.map((r, i) => {
          const p = players[r.playerId];
          return (
            <li key={`${r.number}-${r.manager}-${r.piece}`} className="rank-row">
              <span className="rank-no">{i + 1}</span>
              <span className="rank-main">
                <span className="rank-name">{p?.name ?? `Spieler #${r.playerId}`}</span>
                <span className="rank-meta">
                  {p?.meta} · {PIECE_LABEL[r.piece].charAt(0) + PIECE_LABEL[r.piece].slice(1).toLowerCase()} · ST {String(r.number).padStart(2, "0")}
                  {r.lines.length ? ` · ${r.lines.join(", ")}` : ""}
                </span>
              </span>
              <span className={`rank-who who-${r.manager}`}>{NAME[r.manager]}</span>
              <span className="rank-pts">{signed(r.points)}</span>
            </li>
          );
        })}
        {list.length === 0 && <li className="faint">Noch keine abgeschlossenen Spieltage.</li>}
      </ol>
    </>
  );
}

export interface DraftedRow {
  playerId: number;
  picks: Record<Manager, number>;
  total: number;
  points: Record<Manager, number>;
}

/** Meistgedraftete Spieler mit Einsätzen pro Person und 3er-Limit */
export function DraftedPlayers({ rows, players, limit }: { rows: DraftedRow[]; players: Record<number, PlayerLabel>; limit: number }) {
  const [all, setAll] = useState(false);
  const list = all ? rows : rows.slice(0, 12);
  const use = (n: number) => (
    <span className={n >= limit ? "use-full" : n === 0 ? "faint" : ""} title={n >= limit ? "Saisonlimit erreicht" : undefined}>
      {n}/{limit}
    </span>
  );
  return (
    <>
      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col">Spieler</th>
              <th scope="col" className="num">Gedraftet</th>
              <th scope="col" className="num">Bent</th>
              <th scope="col" className="num">Björn</th>
              <th scope="col" className="num">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const p = players[r.playerId];
              return (
                <tr key={r.playerId}>
                  <th scope="row">
                    <span className="rank-name">{p?.name ?? `Spieler #${r.playerId}`}</span>
                    <span className="rank-meta">{p?.meta}</span>
                  </th>
                  <td className="num">{r.total}×</td>
                  <td className="num">{use(r.picks.bent)}</td>
                  <td className="num">{use(r.picks.bjoern)}</td>
                  <td className="num">{signed(r.points.bent + r.points.bjoern)}</td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="faint">
                  Noch keine Spieler gedraftet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && (
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setAll(!all)}>
          {all ? "Weniger anzeigen" : `Alle ${rows.length} anzeigen`}
        </button>
      )}
    </>
  );
}
