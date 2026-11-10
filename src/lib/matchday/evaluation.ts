import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchdayResult } from "@/lib/scoring/assemble";
import { getSeasonStandings } from "@/lib/scoring/repository";
import type { ClubLogoData } from "@/components/ClubLogo";
import { ownPhotoUrl } from "@/lib/photos/files";
import { clubLogo } from "@/lib/ui/club";
import type { Position } from "@/lib/ui/pieces";
import type { MatchdayContext } from "./load";

export interface EvalClub {
  id: number;
  code: string;
  name: string;
  primary: string;
  secondary: string;
  logo: ClubLogoData;
}

export interface EvalPlayer {
  id: number;
  name: string;
  shortName: string;
  photoUrl: string | null;
  position: Position | null;
  number: number | null;
  club: EvalClub | null;
}

export interface EvalThesis {
  text: string;
  /** "SPIELTAG" oder "SVW · RBL" */
  label: string;
}

export interface Evaluation {
  result: MatchdayResult;
  players: Map<number, EvalPlayer>;
  theses: Map<number, EvalThesis>;
  season: { bent: number; bjoern: number; played: number };
}

/** Ergebnis eines Spieltags mit allem, was Spielfeld und Eingabeseite anzeigen. */
export async function loadEvaluation(db: SupabaseClient, ctx: MatchdayContext): Promise<Evaluation | null> {
  const standings = await getSeasonStandings(db, ctx.season.startYear);
  const result = standings?.matchdays.find((m) => m.number === ctx.matchday.number);
  if (!standings || !result) return null;

  const ids = [...result.bent.players, ...result.bjoern.players].map((p) => p.playerId);
  const players = new Map<number, EvalPlayer>();
  if (ids.length) {
    type Row = {
      player_id: number;
      position: Position;
      shirt_number: number | null;
      players: { full_name: string; short_name: string; photo_url: string | null };
      clubs: { id: number; code: string; short_name: string; color_primary: string; color_secondary: string; logo_url: string | null };
    };
    const { data, error } = await db
      .from("squad_memberships")
      .select("player_id, position, shirt_number, players(full_name, short_name, photo_url), clubs(id, code, short_name, color_primary, color_secondary, logo_url)")
      .eq("season_id", ctx.season.id)
      .in("player_id", ids);
    if (error) throw new Error(`Datenbank: ${error.message}`);
    for (const r of (data ?? []) as unknown as Row[]) {
      players.set(r.player_id, {
        id: r.player_id,
        name: r.players.full_name,
        shortName: r.players.short_name,
        photoUrl: ownPhotoUrl(r.players.photo_url),
        position: r.position,
        number: r.shirt_number,
        club: {
          id: r.clubs.id,
          code: r.clubs.code,
          name: r.clubs.short_name,
          primary: r.clubs.color_primary,
          secondary: r.clubs.color_secondary,
          logo: clubLogo(r.clubs),
        },
      });
    }
  }

  const matchById = new Map(ctx.matches.map((m) => [m.id, m]));
  const theses = new Map<number, EvalThesis>(
    ctx.theses.map((t) => {
      const m = t.match_id ? matchById.get(t.match_id) : null;
      return [t.id, { text: t.text, label: m ? `${m.home.code} · ${m.away.code}` : "SPIELTAG" }];
    }),
  );

  // Gesamtstand bis einschließlich dieses Spieltags
  const upTo = standings.matchdays.filter((m) => m.number <= ctx.matchday.number);
  return {
    result,
    players,
    theses,
    season: {
      bent: upTo.reduce((s, m) => s + m.bent.total, 0),
      bjoern: upTo.reduce((s, m) => s + m.bjoern.total, 0),
      played: upTo.filter((m) => m.played).length,
    },
  };
}
