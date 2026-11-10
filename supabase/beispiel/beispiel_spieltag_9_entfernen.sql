-- =====================================================================
-- Rasenschach: Rechenbeispiel auf Spieltag 9 wieder entfernen
-- Löscht Thesen, Züge, Handeingaben und ligaweite Einträge von Spieltag 9
-- und setzt die Vorbereitung zurück. Tore und Ergebnisse bleiben.
-- =====================================================================

do $$
declare
  v_md bigint;
begin
  select m.id into v_md
  from public.matchdays m join public.seasons s on s.id = m.season_id
  where s.start_year = 2026 and m.number = 9;
  if v_md is null then raise exception 'Spieltag 9 nicht gefunden'; end if;

  update public.matchdays set closed_at = null where id = v_md;
  delete from public.player_picks where matchday_id = v_md;
  delete from public.thesis_picks where matchday_id = v_md;
  delete from public.theses where matchday_id = v_md;
  delete from public.stat_values where matchday_id = v_md and source = 'manual';
  delete from public.league_ranks where matchday_id = v_md;
  update public.matchdays
  set question_value = null, knight_category = null, thesis_starter = null,
      thesis_draft_started_at = null, player_draft_started_at = null
  where id = v_md;
end $$;
