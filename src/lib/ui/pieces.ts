import { KNIGHT_CATEGORIES } from "@/lib/scoring/players";
import type { KnightCategory, Piece } from "@/lib/scoring/types";

/** Reihenfolge der Figuren auf dem Spielfeld (wie im Entwurf) */
export const PIECE_ORDER: Piece[] = ["turm", "laeufer", "springer", "dame", "koenig"];

export const PIECE_LABEL: Record<Piece, string> = {
  turm: "TURM",
  laeufer: "LÄUFER",
  springer: "SPRINGER",
  dame: "DAME",
  koenig: "KÖNIG",
};

const PIECE_ROLE: Record<Exclude<Piece, "springer">, string> = {
  turm: "WEISSE WESTE",
  laeufer: "MOTOR",
  dame: "SPIELMACHER",
  koenig: "TORJÄGER",
};

/** Untertitel der Figur; beim Springer die geloste Kategorie dieses Spieltags */
export function pieceRole(piece: Piece, knight: KnightCategory | null): string {
  if (piece === "springer") return knight ? KNIGHT_CATEGORIES[knight].label.toUpperCase() : "GELOST";
  return PIECE_ROLE[piece];
}

export type Position = "TW" | "AB" | "MF" | "ST";
export const POSITION_ORDER: Position[] = ["TW", "AB", "MF", "ST"];
export const POSITION_LABEL: Record<Position, string> = { TW: "Tor", AB: "Abwehr", MF: "Mittelfeld", ST: "Sturm" };
