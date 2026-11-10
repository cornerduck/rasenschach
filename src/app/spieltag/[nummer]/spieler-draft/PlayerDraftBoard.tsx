"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useMemo, useState, useTransition, type DragEvent } from "react";
import { ClubLogo } from "@/components/ClubLogo";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { normalizeName } from "@/lib/roster/names";
import { picksInARow, snakeTurn } from "@/lib/scoring/assemble";
import type { KnightCategory, Piece } from "@/lib/scoring/types";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { PIECE_LABEL, PIECE_ORDER, POSITION_LABEL, POSITION_ORDER, pieceRole, type Position } from "@/lib/ui/pieces";
import { makePlayerPick } from "../actions";

type Manager = "bent" | "bjoern";

export interface DraftClub {
  id: number;
  code: string;
  name: string;
  primary: string;
  secondary: string;
  /** Logo im eigenen Speicher, sonst null (dann Kürzel in Vereinsfarbe) */
  logoUrl: string | null;
}

export interface DraftPlayer {
  id: number;
  name: string;
  shortName: string;
  photoUrl: string | null;
  clubId: number;
  position: Position;
  number: number | null;
  /** Einsätze an anderen Spieltagen dieser Saison */
  used: Record<Manager, number>;
  /** "gegen SVW" / "bei FCB" */
  opponent: string;
}

export interface PlayerPick {
  pickNo: number;
  manager: Manager;
  piece: Piece;
  playerId: number;
}

const NAME: Record<Manager, string> = { bent: "Bent", bjoern: "Björn" };
const otherOf = (m: Manager): Manager => (m === "bent" ? "bjoern" : "bent");
const MAX_LIST = 80;

/** Warum darf ich diesen Spieler gerade nicht nehmen? null = frei */
function blockReason(p: DraftPlayer, me: Manager | null, takenBy: Manager | undefined, limit: number): string | null {
  if (takenBy) return takenBy === me ? "gesetzt" : `bei ${NAME[takenBy]}`;
  if (me && p.used[me] >= limit) return `${p.used[me]}/${limit}`;
  return null;
}

export function PlayerDraftBoard({
  matchdayId,
  me,
  first,
  knight,
  players,
  clubs,
  initialPicks,
  limit,
  locked,
}: {
  matchdayId: number;
  me: Manager | null;
  /** beginnt den Spieler-Draft (hat den Thesen-Draft nicht begonnen) */
  first: Manager;
  knight: KnightCategory | null;
  players: DraftPlayer[];
  clubs: DraftClub[];
  initialPicks: PlayerPick[];
  limit: number;
  locked: boolean;
}) {
  const [picks, setPicks] = useState<PlayerPick[]>(initialPicks);
  const [selPlayer, setSelPlayer] = useState<number | null>(null);
  const [selPiece, setSelPiece] = useState<Piece | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<Piece | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [clubFilter, setClubFilter] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(query);

  const addPicks = useCallback((list: PlayerPick[]) => {
    setPicks((prev) => {
      const byNo = new Map(prev.map((p) => [p.pickNo, p]));
      for (const p of list) byNo.set(p.pickNo, p);
      return [...byNo.values()].sort((a, b) => a.pickNo - b.pickNo);
    });
  }, []);

  // Live: neue Züge per Realtime; beim (Wieder-)Verbinden einmal komplett nachladen.
  // Zurücksetzen erledigt MatchdayLive.
  const loadPicks = useCallback(async () => {
    const { data } = await createClient().from("player_picks").select("pick_no, manager, piece, player_id").eq("matchday_id", matchdayId);
    if (data) setPicks(data.map((p) => ({ pickNo: p.pick_no, manager: p.manager, piece: p.piece, playerId: p.player_id })).sort((a, b) => a.pickNo - b.pickNo));
  }, [matchdayId]);
  useRealtime(
    `spieler-draft-${matchdayId}`,
    [{ table: "player_picks", event: "INSERT", filter: `matchday_id=eq.${matchdayId}` }],
    (_table, payload) => {
      const p = payload.new as { pick_no: number; manager: Manager; piece: Piece; player_id: number };
      addPicks([{ pickNo: p.pick_no, manager: p.manager, piece: p.piece, playerId: p.player_id }]);
    },
    loadPicks,
  );

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const takenBy = new Map(picks.map((p) => [p.playerId, p.manager]));

  const next = picks.length + 1;
  const done = picks.length >= 10;
  const turn: Manager | null = done || locked ? null : snakeTurn(first, next);
  const inARow = turn ? picksInARow(next) : 0;
  const myTurn = !!me && turn === me && !locked;
  const slot = (m: Manager, piece: Piece) => picks.find((p) => p.manager === m && p.piece === piece);

  // Ist diese Kombination erlaubt? (gleiche Regeln wie in der Datenbank, damit man es sofort sieht)
  const fits = (playerId: number | null, piece: Piece | null) => {
    if (playerId === null || piece === null) return true;
    const p = playerById.get(playerId);
    return !(piece === "turm" && p?.position !== "TW");
  };

  // Spielerliste: Suche, Position, Verein
  const filtered = useMemo(() => {
    const q = normalizeName(deferredQuery);
    const posRank = (p: Position) => POSITION_ORDER.indexOf(p);
    return players
      .filter((p) => {
        if (position && p.position !== position) return false;
        if (clubFilter && p.clubId !== clubFilter) return false;
        if (!q) return true;
        const c = clubById.get(p.clubId);
        const hay = normalizeName(`${p.name} ${p.shortName} ${c?.code ?? ""} ${c?.name ?? ""}`);
        return q.split(" ").every((t) => hay.includes(t));
      })
      .sort(
        (a, b) =>
          (clubById.get(a.clubId)?.name ?? "").localeCompare(clubById.get(b.clubId)?.name ?? "", "de") ||
          posRank(a.position) - posRank(b.position) ||
          (a.number ?? 100) - (b.number ?? 100) ||
          a.name.localeCompare(b.name, "de"),
      );
  }, [players, deferredQuery, position, clubFilter, clubById]);
  const shown = filtered.slice(0, MAX_LIST);

  const place = () => {
    if (selPlayer === null || selPiece === null || !myTurn) return;
    const playerId = selPlayer;
    const piece = selPiece;
    if (takenBy.has(playerId) || slot(me!, piece) || !fits(playerId, piece)) return;
    startTransition(async () => {
      setError(null);
      const res = await makePlayerPick(matchdayId, piece, playerId);
      if (res.ok) {
        addPicks([{ pickNo: next, manager: me!, piece, playerId }]);
        setSelPlayer(null);
        setSelPiece(null);
      } else setError(res.error);
    });
  };

  const choosePlayer = (id: number) => {
    setError(null);
    if (selPlayer === id) return setSelPlayer(null);
    setSelPlayer(id);
    if (!fits(id, selPiece)) setSelPiece(null); // Feldspieler gewählt, Turm war markiert
  };
  const choosePiece = (piece: Piece) => {
    setError(null);
    if (selPiece === piece) return setSelPiece(null);
    setSelPiece(piece);
    if (!fits(selPlayer, piece)) setSelPlayer(null);
  };

  // Drag-and-drop: Spieler aus der Liste auf eine freie eigene Figur ziehen (danach bestätigen)
  const onDragStart = (e: DragEvent, id: number) => {
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.effectAllowed = "move";
    setDragging(id);
    setSelPlayer(id);
  };
  const onDragEnd = () => {
    setDragging(null);
    setDropTarget(null);
  };
  const dropProps = (piece: Piece) => ({
    onDragOver: (e: DragEvent) => {
      if (dragging === null || !fits(dragging, piece)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget !== piece) setDropTarget(piece);
    },
    onDragLeave: () => setDropTarget((t) => (t === piece ? null : t)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = Number(e.dataTransfer.getData("text/plain")) || dragging;
      setDragging(null);
      setDropTarget(null);
      if (id && fits(id, piece)) {
        setSelPlayer(id);
        setSelPiece(piece);
      }
    },
  });

  // Spielerbild rund, sonst Trikot mit Rückennummer
  const kit = (p: DraftPlayer, size: number, jerseyWidth: number, label = true) => {
    const c = clubById.get(p.clubId);
    return (
      <PlayerAvatar
        photoUrl={p.photoUrl}
        primary={c?.primary ?? "#2A312E"}
        secondary={c?.secondary ?? "#ECEFED"}
        number={p.number}
        size={size}
        jerseyWidth={jerseyWidth}
        label={label}
      />
    );
  };

  const cardBody = (p: DraftPlayer, owner: Manager) => {
    const c = clubById.get(p.clubId);
    return (
      <>
        <span className={`kit-circle kit-${owner}`}>
          {kit(p, 96, 62)}
        </span>
        <span className="player-card-name">{p.shortName.toUpperCase()}</span>
        <span className={`player-card-meta meta-${owner}`}>
          {c && <ClubLogo club={c} size={14} decorative fallback="dot" />} {p.position} · {c?.code} · {p.used[owner] + 1}/{limit} genutzt
        </span>
      </>
    );
  };

  const row = (m: Manager) => (
    <div className="draft-row">
      {PIECE_ORDER.map((piece) => {
        const pick = slot(m, piece);
        if (pick) {
          const p = playerById.get(pick.playerId);
          return (
            <div key={piece} className={`draft-card player-card card-${m}`}>
              {p ? cardBody(p, m) : <span className="muted">Spieler #{pick.playerId}</span>}
            </div>
          );
        }
        if (m === me && myTurn) {
          const preview = selPiece === piece && selPlayer !== null ? playerById.get(selPlayer) : null;
          const allowed = fits(selPlayer ?? dragging, piece);
          return (
            <button
              key={piece}
              type="button"
              className={`draft-empty player-empty empty-${m} is-mine ${selPiece === piece ? "is-selected" : ""} ${dragging !== null && allowed ? "is-droppable" : ""} ${dropTarget === piece ? "is-drop" : ""} ${preview ? "has-preview" : ""} ${!allowed ? "is-blocked" : ""}`}
              aria-label={`${PIECE_LABEL[piece]} wählen${piece === "turm" ? " (nur Torhüter)" : ""}`}
              aria-pressed={selPiece === piece}
              disabled={!allowed}
              title={!allowed ? "Auf den Turm dürfen nur Torhüter" : undefined}
              onClick={() => choosePiece(piece)}
              {...dropProps(piece)}
            >
              {preview ? (
                cardBody(preview, m)
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  {piece === "turm" && <span className="empty-hint">nur Torhüter</span>}
                </>
              )}
            </button>
          );
        }
        return <div key={piece} className={`draft-empty player-empty empty-${m}`} />;
      })}
    </div>
  );

  const status = done
    ? "Spieler-Draft fertig"
    : locked
      ? "Deadline vorbei, Draft gesperrt"
      : `${myTurn ? "Du bist" : `${NAME[turn!]} ist`} am Zug · ${inARow} Spieler setzen`;
  const sel = selPlayer !== null ? playerById.get(selPlayer) : null;

  return (
    <>
      <div className={`draft-status ${turn ? `status-${turn}` : ""}`} role="status" aria-live="polite">
        {turn && <span className="dot" />}
        <span style={{ fontWeight: 600 }}>{status}</span>
      </div>

      <div className="draft-order" aria-label="Reihenfolge">
        <span className="label-small muted">Reihenfolge</span>
        {Array.from({ length: 10 }, (_, i) => {
          const who = snakeTurn(first, i + 1);
          const isDone = i < picks.length;
          const isNow = !!turn && i >= picks.length && i < picks.length + inARow;
          return (
            <span key={i} className={`order-box order-${who} ${isDone ? "is-done" : ""} ${isNow ? "is-now" : ""}`} title={`Zug ${i + 1}: ${NAME[who]}`}>
              {who === "bent" ? "B" : "J"}
            </span>
          );
        })}
        <span className="muted" style={{ fontSize: 12 }}>
          Snake-Draft · {NAME[first]} beginnt, weil {NAME[otherOf(first)]} den Thesen-Draft begonnen hat
        </span>
      </div>

      <div className="draft-layout">
        <div className="draft-main">
          <div className="draft-scroll">
            <div className="draft-board">
              <div className="draft-row">
                {PIECE_ORDER.map((piece) => (
                  <div key={piece} className="draft-head">
                    <span className="draft-head-v piece-head">{PIECE_LABEL[piece]}</span>
                    <span className="label-small muted">{pieceRole(piece, knight)}</span>
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
                {selPlayer === null && selPiece === null && "Spieler aus der Liste auf eine freie Figur ziehen oder antippen."}
                {selPlayer !== null && selPiece === null && (
                  <>
                    <strong>{sel?.name}</strong> gewählt. Jetzt eine freie Figur wählen
                    {sel?.position !== "TW" ? " (nicht den Turm, der ist nur für Torhüter)." : "."}
                  </>
                )}
                {selPlayer === null && selPiece !== null && `Jetzt einen Spieler für ${PIECE_LABEL[selPiece]} wählen${selPiece === "turm" ? " (nur Torhüter)" : ""}.`}
                {selPlayer !== null && selPiece !== null && (
                  <>
                    <strong>{sel?.name}</strong> als <strong>{PIECE_LABEL[selPiece]}</strong> setzen?
                  </>
                )}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                {(selPlayer !== null || selPiece !== null) && (
                  <button type="button" className="btn btn-ghost" onClick={() => { setSelPlayer(null); setSelPiece(null); }}>
                    Abbrechen
                  </button>
                )}
                <button type="button" className={`btn btn-${me}`} disabled={pending || selPlayer === null || selPiece === null} onClick={place}>
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
              <span>Alle 10 Spieler sind gesetzt. Jetzt heißt es warten auf den Anstoß.</span>
              <Link className="btn btn-secondary" href="/">
                Zur Saisonübersicht
              </Link>
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              {me
                ? `Spieler auf eine freie Figur ziehen, oder Spieler antippen und dann die Figur. Turm nur mit Torhütern. Jeder Spieler höchstens ${limit}-mal pro Saison (pro Person). ${NAME[otherOf(me)]} sieht deine Züge live.`
                : "Nur Bent und Björn können setzen."}
            </span>
          )}
        </div>

        <aside className="draft-pool player-pool">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 className="panel-title">Spieler wählen</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              {filtered.length} Spieler
            </span>
          </div>
          <label className="field">
            Suche
            <input
              className="input"
              type="search"
              placeholder="Name oder Verein"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="filter-chips" role="group" aria-label="Position">
            <button type="button" className={`filter-chip ${position === null ? "is-active" : ""}`} aria-pressed={position === null} onClick={() => setPosition(null)}>
              Alle
            </button>
            {POSITION_ORDER.map((p) => (
              <button key={p} type="button" className={`filter-chip ${position === p ? "is-active" : ""}`} aria-pressed={position === p} onClick={() => setPosition(position === p ? null : p)}>
                {POSITION_LABEL[p]}
              </button>
            ))}
          </div>
          <div className="club-filter" role="group" aria-label="Verein">
            <span className="field-label">Verein</span>
            <div className="club-filter-grid">
              <button
                type="button"
                className={`club-chip club-chip-all ${clubFilter === null ? "is-active" : ""}`}
                aria-pressed={clubFilter === null}
                onClick={() => setClubFilter(null)}
              >
                Alle
              </button>
              {clubs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`club-chip ${clubFilter === c.id ? "is-active" : ""}`}
                  aria-pressed={clubFilter === c.id}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => setClubFilter(clubFilter === c.id ? null : c.id)}
                >
                  <ClubLogo club={c} size={22} decorative />
                </button>
              ))}
            </div>
          </div>

          <div className="pp-list">
            {shown.map((p) => {
              const c = clubById.get(p.clubId);
              const blocked = blockReason(p, me, takenBy.get(p.id), limit);
              const wrongForPiece = !fits(p.id, selPiece);
              const disabled = !myTurn || !!blocked || wrongForPiece;
              const usage = me ? `${p.used[me]}/${limit}` : "";
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`pp-item ${selPlayer === p.id ? `is-selected sel-${me}` : ""} ${dragging === p.id ? "is-dragging" : ""} ${blocked || wrongForPiece ? "is-blocked" : ""}`}
                  disabled={disabled}
                  draggable={!disabled}
                  onDragStart={(e) => onDragStart(e, p.id)}
                  onDragEnd={onDragEnd}
                  aria-pressed={selPlayer === p.id}
                  onClick={() => choosePlayer(p.id)}
                >
                  {kit(p, 30, 30, false)}
                  <span className="pp-text">
                    <span className="pp-name">{p.name}</span>
                    <span className="pp-meta with-logo">
                      {c && <ClubLogo club={c} size={14} decorative fallback="dot" />}
                      {p.position} · {c?.name} · {p.opponent}
                    </span>
                  </span>
                  <span
                    className={`pp-usage ${blocked === "gesetzt" ? `use-${me}` : blocked?.startsWith("bei ") ? `use-${otherOf(me ?? "bent")}` : blocked ? "use-limit" : ""}`}
                    title={blocked && !blocked.startsWith("bei") && blocked !== "gesetzt" ? "Saisonlimit erreicht" : me ? "So oft hast du ihn diese Saison schon eingesetzt" : undefined}
                  >
                    {blocked ?? usage}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && <span className="faint">Kein Spieler passt zur Suche.</span>}
            {filtered.length > MAX_LIST && (
              <span className="faint" style={{ fontSize: 12, paddingTop: 8 }}>
                … und {filtered.length - MAX_LIST} weitere. Suche oder Filter verfeinern.
              </span>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
