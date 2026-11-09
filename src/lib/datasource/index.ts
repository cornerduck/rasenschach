import "server-only";
import { openLigaDb } from "./openligadb";
import type { FixtureSource, PlayerStatsSource } from "./types";

export * from "./types";

/** Aktive Quelle für Spielplan und Ergebnisse. */
export const fixtureSource: FixtureSource = openLigaDb;

/**
 * Quellen für Spielerwerte, in Reihenfolge der Priorität.
 * Heute leer: alle Werte außer Toren kommen per Hand.
 * Später hier z. B. `sofascore` eintragen; Handeingaben überschreiben immer.
 */
export const playerStatsSources: PlayerStatsSource[] = [];
