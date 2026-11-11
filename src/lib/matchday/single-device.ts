/**
 * Ein-Gerät-Modus: Rechteprüfung (rein, getestet). Spiegelt die Prüfung in der Datenbank
 * (acting_slot, make_thesis_pick, make_player_pick); die Datenbank entscheidet verbindlich,
 * die Oberfläche zeigt damit nur erlaubte Knöpfe.
 */
export type Manager = "bent" | "bjoern";

export interface Viewer {
  mySlot: Manager | null;
  isAdmin: boolean;
  /** Ein-Gerät-Modus für diesen Spieltag an */
  singleDevice: boolean;
}

export type ActingResult = { ok: true; slot: Manager; shared: boolean } | { ok: false; error: string };

/** Für wen darf der Nutzer handeln? requested leer = für sich selbst. */
export function actingSlot(v: Viewer, requested?: Manager | null): ActingResult {
  if (!v.mySlot) return { ok: false, error: "Kein Profil für dieses Konto" };
  if (!requested || requested === v.mySlot) return { ok: true, slot: v.mySlot, shared: false };
  if (!v.isAdmin) return { ok: false, error: "Nur der Admin darf für den anderen handeln" };
  if (!v.singleDevice) return { ok: false, error: "Ohne Ein-Gerät-Modus darfst du nicht für den anderen handeln" };
  return { ok: true, slot: requested, shared: true };
}

/** Wer zieht im Draft, wenn dieser Nutzer setzt? Im Modus zieht der Admin für den, der dran ist. */
export function draftActor(v: Viewer, turn: Manager | null): Manager | null {
  if (v.singleDevice && v.isAdmin) return turn;
  return v.mySlot;
}

/** Für wen darf der Nutzer eine These bestätigen? (aus denen, die noch fehlen) */
export function confirmableFor(v: Viewer, waiting: Manager[]): Manager[] {
  return waiting.filter((m) => actingSlot(v, m).ok);
}

/** Nach einem Zug: Gerät übergeben, wenn jetzt der andere dran ist (sonst null) */
export function handoverTo(before: Manager | null, after: Manager | null): Manager | null {
  return before && after && before !== after ? after : null;
}
