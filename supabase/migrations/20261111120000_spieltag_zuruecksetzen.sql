-- =====================================================================
-- Rasenschach: Spieltag zurücksetzen (nur Admin)
-- Einmal komplett im SQL-Editor von Supabase ausführen.
--
-- Stellt einen Spieltag auf Anfang: löscht Spieler-Draft, Thesen-Draft und Thesen
-- und leert Räder und Startspieler. Spiele, Tore und Spielerwerte bleiben erhalten.
-- Nicht möglich bei abgeschlossenen Spieltagen und archivierten Saisons.
-- =====================================================================

create function public.reset_matchday(p_matchday_id bigint)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays;
begin
  if not public.is_admin() then raise exception 'Nur für Admin'; end if;
  select * into v_md from public.matchdays where id = p_matchday_id for update;
  if v_md.id is null then raise exception 'Spieltag nicht gefunden'; end if;
  if v_md.closed_at is not null then raise exception 'Spieltag ist abgeschlossen und kann nicht zurückgesetzt werden'; end if;
  if (select is_archived from public.seasons where id = v_md.season_id) then
    raise exception 'Saison ist archiviert';
  end if;

  delete from public.player_picks where matchday_id = p_matchday_id;
  delete from public.thesis_picks where matchday_id = p_matchday_id; -- zuerst, sonst schützt der Trigger die Thesen
  delete from public.theses where matchday_id = p_matchday_id;

  update public.matchdays
  set question_value = null, knight_category = null, thesis_starter = null
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

revoke execute on function public.reset_matchday from public, anon;
grant execute on function public.reset_matchday to authenticated;
