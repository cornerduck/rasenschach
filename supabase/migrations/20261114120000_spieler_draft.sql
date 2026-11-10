-- =====================================================================
-- Rasenschach: Spieler-Draft und feste Torschützen-Zuordnung
-- Einmal komplett im SQL-Editor von Supabase ausführen
-- (nach 20261113120000_muenzwurf.sql).
--
-- - players.aliases: feste Zuordnungen für Torschützen-Namen aus der Quelle
-- - matchdays.player_draft_started_at: wann der Spieler-Draft gestartet wurde
-- - start_player_draft: startet den Spieler-Draft, wenn der Thesen-Draft fertig ist
-- - make_player_pick: nur nach dem Start, nicht in abgeschlossenen Spieltagen
--   (sonst wie bisher: Snake-Draft, Turm nur Torhüter, Spieler pro Woche einmal,
--   3er-Limit pro Person)
-- - reset_player_draft (Admin): nur den Spieler-Draft zurücksetzen
-- - reset_matchday setzt den Start des Spieler-Drafts mit zurück
-- =====================================================================

alter table public.players add column if not exists aliases text[] not null default '{}';

alter table public.matchdays add column if not exists player_draft_started_at timestamptz;

-- Spieltage, in denen schon Spieler gesetzt wurden, gelten als gestartet
update public.matchdays m
set player_draft_started_at = now()
where player_draft_started_at is null
  and exists (select 1 from public.player_picks p where p.matchday_id = m.id);

create or replace function public.start_player_draft(p_matchday_id bigint)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays;
  v_deadline timestamptz;
begin
  if public.my_slot() is null then raise exception 'Kein Profil für dieses Konto'; end if;
  select * into v_md from public.matchdays where id = p_matchday_id for update;
  if v_md.id is null then raise exception 'Spieltag nicht gefunden'; end if;
  if v_md.player_draft_started_at is not null then return v_md; end if; -- schon gestartet: nichts zu tun
  if (select is_archived from public.seasons where id = v_md.season_id) then
    raise exception 'Saison ist archiviert';
  end if;
  if v_md.closed_at is not null then raise exception 'Spieltag ist abgeschlossen'; end if;
  v_deadline := public.matchday_deadline(p_matchday_id);
  if v_deadline is not null and now() >= v_deadline then raise exception 'Deadline vorbei'; end if;
  if v_md.thesis_starter is null then raise exception 'Erst festlegen, wer beginnt'; end if;
  if (select count(*) from public.thesis_picks where matchday_id = p_matchday_id) < 10 then
    raise exception 'Erst den Thesen-Draft abschließen';
  end if;

  update public.matchdays set player_draft_started_at = now()
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

create or replace function public.make_player_pick(p_matchday_id bigint, p_piece public.piece, p_player_id bigint)
returns public.player_picks
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays;
  v_season public.seasons;
  v_me public.manager_slot := public.my_slot();
  v_first public.manager_slot;
  v_next int;
  v_deadline timestamptz;
  v_pos public.player_position;
  v_used int;
  v_limit int;
  v_row public.player_picks;
begin
  select * into v_md from public.matchdays where id = p_matchday_id for update;
  if v_md.id is null then raise exception 'Spieltag nicht gefunden'; end if;
  if v_me is null then raise exception 'Kein Profil für dieses Konto'; end if;
  select * into v_season from public.seasons where id = v_md.season_id;
  if v_season.is_archived then raise exception 'Saison ist archiviert'; end if;
  if v_md.closed_at is not null then raise exception 'Spieltag ist abgeschlossen'; end if;

  v_deadline := public.matchday_deadline(p_matchday_id);
  if v_deadline is not null and now() >= v_deadline then
    raise exception 'Deadline vorbei: Der Draft ist gesperrt';
  end if;
  if (select count(*) from public.thesis_picks where matchday_id = p_matchday_id) < 10 then
    raise exception 'Erst den Thesen-Draft abschließen';
  end if;
  if v_md.player_draft_started_at is null then raise exception 'Der Spieler-Draft ist noch nicht gestartet'; end if;
  if v_md.thesis_starter is null then raise exception 'Startspieler fehlt'; end if;

  -- Spieler-Draft beginnt, wer den Thesen-Draft nicht begonnen hat
  v_first := case when v_md.thesis_starter = 'bent' then 'bjoern'::public.manager_slot else 'bent'::public.manager_slot end;
  select count(*) + 1 into v_next from public.player_picks where matchday_id = p_matchday_id;
  if v_next > 10 then raise exception 'Spieler-Draft ist bereits abgeschlossen'; end if;
  if public.snake_turn(v_first, v_next) <> v_me then
    raise exception 'Du bist nicht am Zug';
  end if;

  -- Figur schon belegt? Spieler diese Woche schon vergeben?
  if exists (select 1 from public.player_picks where matchday_id = p_matchday_id and manager = v_me and piece = p_piece) then
    raise exception 'Diese Figur ist bei dir schon besetzt';
  end if;
  if exists (select 1 from public.player_picks where matchday_id = p_matchday_id and player_id = p_player_id) then
    raise exception 'Dieser Spieler ist an diesem Spieltag schon vergeben';
  end if;

  -- Spieler muss im aktuellen Kader stehen
  select position into v_pos from public.squad_memberships
  where season_id = v_md.season_id and player_id = p_player_id and is_active;
  if v_pos is null then raise exception 'Spieler steht in keinem Bundesliga-Kader'; end if;
  if p_piece = 'turm' and v_pos <> 'TW' then raise exception 'Auf den Turm dürfen nur Torhüter'; end if;

  -- Saisonlimit pro Person (andere Spieltage dieser Saison)
  select count(*) into v_used
  from public.player_picks pp
  join public.matchdays m on m.id = pp.matchday_id
  where m.season_id = v_md.season_id and pp.manager = v_me and pp.player_id = p_player_id
    and pp.matchday_id <> p_matchday_id
    and (
      coalesce((v_season.rules ->> 'limit_zaehlt_ohne_einsatz')::boolean, true)
      or coalesce((select e.value from public.effective_stat_values e
                   where e.matchday_id = pp.matchday_id and e.player_id = pp.player_id
                     and e.stat_key = 'minutes_played'), 1) > 0
    );
  v_limit := coalesce((v_season.rules ->> 'saisonlimit')::int, 3);
  if v_used >= v_limit then
    raise exception 'Saisonlimit erreicht: Du hast diesen Spieler schon %-mal eingesetzt', v_used;
  end if;

  insert into public.player_picks (matchday_id, manager, piece, player_id, pick_no, created_by)
  values (p_matchday_id, v_me, p_piece, p_player_id, v_next, auth.uid())
  returning * into v_row;
  return v_row;
exception
  when unique_violation then raise exception 'Spieler oder Figur ist bereits vergeben';
end;
$$;

-- Admin: nur den Spieler-Draft zurücksetzen (Thesen-Draft bleibt)
create or replace function public.reset_player_draft(p_matchday_id bigint)
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
  update public.matchdays set player_draft_started_at = null
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

-- Spieltag zurücksetzen: wie bisher, dazu den Start des Spieler-Drafts löschen
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
  set question_value = null, knight_category = null, thesis_starter = null,
      thesis_draft_started_at = null, player_draft_started_at = null
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

revoke execute on function public.start_player_draft, public.make_player_pick, public.reset_player_draft,
  public.reset_matchday from public, anon;
grant execute on function public.start_player_draft, public.make_player_pick, public.reset_player_draft,
  public.reset_matchday to authenticated;
