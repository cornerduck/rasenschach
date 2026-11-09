-- =====================================================================
-- Rasenschach: Thesen-Draft starten
-- Einmal komplett im SQL-Editor von Supabase ausführen
-- (nach 20261111120000_spieltag_zuruecksetzen.sql).
--
-- - Neues Feld matchdays.thesis_draft_started_at: wann der Thesen-Draft gestartet wurde.
--   Alle offenen Seiten wechseln dann live in den Draft.
-- - start_thesis_draft: startet den Draft, wenn die Vorbereitung komplett ist (beide Spieler dürfen das)
-- - reset_matchday setzt den Start mit zurück
-- =====================================================================

alter table public.matchdays add column if not exists thesis_draft_started_at timestamptz;

-- Spieltage, in denen schon gesetzt wurde, gelten als gestartet
update public.matchdays m
set thesis_draft_started_at = now()
where thesis_draft_started_at is null
  and exists (select 1 from public.thesis_picks p where p.matchday_id = m.id);

create or replace function public.start_thesis_draft(p_matchday_id bigint)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays;
  v_deadline timestamptz;
begin
  if public.my_slot() is null then raise exception 'Kein Profil für dieses Konto'; end if;
  select * into v_md from public.matchdays where id = p_matchday_id for update;
  if v_md.id is null then raise exception 'Spieltag nicht gefunden'; end if;
  if v_md.thesis_draft_started_at is not null then return v_md; end if; -- schon gestartet: nichts zu tun
  if (select is_archived from public.seasons where id = v_md.season_id) then
    raise exception 'Saison ist archiviert';
  end if;
  if v_md.closed_at is not null then raise exception 'Spieltag ist abgeschlossen'; end if;
  v_deadline := public.matchday_deadline(p_matchday_id);
  if v_deadline is not null and now() >= v_deadline then raise exception 'Deadline vorbei'; end if;
  if (select count(*) from public.theses where matchday_id = p_matchday_id) <> 12 then
    raise exception 'Es fehlen noch Thesen (12 nötig)';
  end if;
  if v_md.question_value is null or v_md.knight_category is null then
    raise exception 'Erst beide Räder drehen';
  end if;
  if v_md.thesis_starter is null then raise exception 'Erst festlegen, wer beginnt'; end if;

  update public.matchdays set thesis_draft_started_at = now()
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

-- Spieltag zurücksetzen: wie bisher, dazu den Start des Drafts löschen
create or replace function public.reset_matchday(p_matchday_id bigint)
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
  set question_value = null, knight_category = null, thesis_starter = null, thesis_draft_started_at = null
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

revoke execute on function public.start_thesis_draft, public.reset_matchday from public, anon;
grant execute on function public.start_thesis_draft, public.reset_matchday to authenticated;
