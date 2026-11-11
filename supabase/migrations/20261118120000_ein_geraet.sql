-- =====================================================================
-- Rasenschach: Ein-Gerät-Modus
-- Einmal komplett im SQL-Editor von Supabase ausführen
-- (nach 20261117120000_spielerbilder.sql).
--
-- Beide spielen an einem Laptop mit dem Admin-Konto. Pro Spieltag schaltbar (nur Admin).
-- - matchdays.single_device: Modus an/aus (Standard aus)
-- - Draft-Züge: Im Modus zieht der Admin automatisch für den, der laut Reihenfolge dran ist.
--   Alle übrigen Regeln (Turm, 3er-Limit, Spieler einmal pro Spieltag, Snake) bleiben.
-- - Thesen bestätigen / „Stimmt nicht“: Der Admin darf im Modus für den anderen handeln;
--   das wird mit Vermerk „am gemeinsamen Gerät bestätigt“ gespeichert.
-- - Ohne Modus darf der Admin nie für den anderen handeln (prüft acting_slot).
-- =====================================================================

alter table public.matchdays add column if not exists single_device boolean not null default false;
alter table public.theses add column if not exists confirmed_bent_shared boolean not null default false;
alter table public.theses add column if not exists confirmed_bjoern_shared boolean not null default false;

-- Für wen handelt der aktuelle Nutzer? p_as null = für sich selbst.
-- Für den anderen nur als Admin und nur bei aktivem Ein-Gerät-Modus.
create or replace function public.acting_slot(p_matchday_id bigint, p_as public.manager_slot)
returns public.manager_slot
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me public.manager_slot := public.my_slot();
begin
  if v_me is null then raise exception 'Kein Profil für dieses Konto'; end if;
  if p_as is null or p_as = v_me then return v_me; end if;
  if not public.is_admin() then raise exception 'Nur der Admin darf für den anderen handeln'; end if;
  if not coalesce((select single_device from public.matchdays where id = p_matchday_id), false) then
    raise exception 'Ohne Ein-Gerät-Modus darfst du nicht für den anderen handeln';
  end if;
  return p_as;
end;
$$;

-- Modus schalten (nur Admin, jederzeit, nicht in archivierten Saisons)
create or replace function public.set_single_device(p_matchday_id bigint, p_on boolean)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays;
begin
  if not public.is_admin() then raise exception 'Nur für Admin'; end if;
  select * into v_md from public.matchdays where id = p_matchday_id for update;
  if v_md.id is null then raise exception 'Spieltag nicht gefunden'; end if;
  if (select is_archived from public.seasons where id = v_md.season_id) then
    raise exception 'Saison ist archiviert';
  end if;
  update public.matchdays set single_device = coalesce(p_on, false) where id = p_matchday_id returning * into v_md;
  return v_md;
end;
$$;

create or replace function public.make_thesis_pick(p_matchday_id bigint, p_field public.thesis_field, p_thesis_id bigint)
returns public.thesis_picks
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays;
  v_me public.manager_slot := public.my_slot();
  v_next int;
  v_deadline timestamptz;
  v_row public.thesis_picks;
begin
  select * into v_md from public.matchdays where id = p_matchday_id for update;
  if v_md.id is null then raise exception 'Spieltag nicht gefunden'; end if;
  if v_me is null then raise exception 'Kein Profil für dieses Konto'; end if;
  if (select is_archived from public.seasons where id = v_md.season_id) then
    raise exception 'Saison ist archiviert';
  end if;
  if v_md.thesis_starter is null or v_md.question_value is null or v_md.knight_category is null then
    raise exception 'Spielvorbereitung ist noch nicht abgeschlossen';
  end if;
  if (select count(*) from public.theses where matchday_id = p_matchday_id) <> 12 then
    raise exception 'Es müssen genau 12 Thesen eingetragen sein';
  end if;
  v_deadline := public.matchday_deadline(p_matchday_id);
  if v_deadline is not null and now() >= v_deadline then
    raise exception 'Deadline vorbei: Der Draft ist gesperrt';
  end if;
  if not exists (select 1 from public.theses where id = p_thesis_id and matchday_id = p_matchday_id) then
    raise exception 'These gehört nicht zu diesem Spieltag';
  end if;

  select count(*) + 1 into v_next from public.thesis_picks where matchday_id = p_matchday_id;
  if v_next > 10 then raise exception 'Thesen-Draft ist bereits abgeschlossen'; end if;
  -- Ein-Gerät-Modus: der Admin zieht für den, der laut Reihenfolge dran ist
  if v_md.single_device and public.is_admin() then
    v_me := public.snake_turn(v_md.thesis_starter, v_next);
  end if;
  if public.snake_turn(v_md.thesis_starter, v_next) <> v_me then
    raise exception 'Du bist nicht am Zug';
  end if;

  insert into public.thesis_picks (matchday_id, manager, field, thesis_id, pick_no, created_by)
  values (p_matchday_id, v_me, p_field, p_thesis_id, v_next, auth.uid())
  returning * into v_row;
  return v_row;
exception
  when unique_violation then raise exception 'These oder Feld ist bereits vergeben';
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
  -- Ein-Gerät-Modus: der Admin zieht für den, der laut Reihenfolge dran ist
  if v_md.single_device and public.is_admin() then
    v_me := public.snake_turn(v_first, v_next);
  end if;
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

-- Thesen auflösen / bestätigen mit optionalem „für wen“ (p_as)
drop function if exists public.set_thesis_outcome(bigint, boolean);
drop function if exists public.confirm_thesis(bigint);

create or replace function public.set_thesis_outcome(p_thesis_id bigint, p_outcome boolean, p_as public.manager_slot default null)
returns public.theses
language plpgsql security definer set search_path = '' as $$
declare
  v_md_id bigint;
  v_me public.manager_slot;
  v_shared boolean;
  v_row public.theses;
begin
  select matchday_id into v_md_id from public.theses where id = p_thesis_id;
  if v_md_id is null then raise exception 'These nicht gefunden'; end if;
  v_me := public.acting_slot(v_md_id, p_as);
  v_shared := v_me is distinct from public.my_slot();
  perform public.guard_thesis_resolution(p_thesis_id);

  -- Ergebnis ändert sich: beide Bestätigungen (und Vermerke) zurücksetzen
  update public.theses set
    confirmed_bent = case when outcome is not distinct from p_outcome then confirmed_bent else false end,
    confirmed_bjoern = case when outcome is not distinct from p_outcome then confirmed_bjoern else false end,
    confirmed_bent_shared = case when outcome is not distinct from p_outcome then confirmed_bent_shared else false end,
    confirmed_bjoern_shared = case when outcome is not distinct from p_outcome then confirmed_bjoern_shared else false end,
    outcome = p_outcome
  where id = p_thesis_id;
  -- wer das Ergebnis setzt, bestätigt es
  update public.theses set
    confirmed_bent_shared = case when v_me = 'bent' and not confirmed_bent then v_shared else confirmed_bent_shared end,
    confirmed_bjoern_shared = case when v_me = 'bjoern' and not confirmed_bjoern then v_shared else confirmed_bjoern_shared end,
    confirmed_bent = confirmed_bent or v_me = 'bent',
    confirmed_bjoern = confirmed_bjoern or v_me = 'bjoern'
  where id = p_thesis_id and p_outcome is not null
  returning * into v_row;
  if v_row.id is null then select * into v_row from public.theses where id = p_thesis_id; end if;
  return v_row;
end;
$$;

create or replace function public.confirm_thesis(p_thesis_id bigint, p_as public.manager_slot default null)
returns public.theses
language plpgsql security definer set search_path = '' as $$
declare
  v_md_id bigint;
  v_me public.manager_slot;
  v_shared boolean;
  v_row public.theses;
begin
  select matchday_id into v_md_id from public.theses where id = p_thesis_id;
  if v_md_id is null then raise exception 'These nicht gefunden'; end if;
  v_me := public.acting_slot(v_md_id, p_as);
  v_shared := v_me is distinct from public.my_slot();
  perform public.guard_thesis_resolution(p_thesis_id);
  update public.theses set
    confirmed_bent_shared = case when v_me = 'bent' and not confirmed_bent then v_shared else confirmed_bent_shared end,
    confirmed_bjoern_shared = case when v_me = 'bjoern' and not confirmed_bjoern then v_shared else confirmed_bjoern_shared end,
    confirmed_bent = confirmed_bent or v_me = 'bent',
    confirmed_bjoern = confirmed_bjoern or v_me = 'bjoern'
  where id = p_thesis_id and outcome is not null
  returning * into v_row;
  if v_row.id is null then raise exception 'These ist noch nicht aufgelöst'; end if;
  return v_row;
end;
$$;

revoke execute on function public.acting_slot from public, anon, authenticated;
revoke execute on function public.set_single_device, public.make_thesis_pick, public.make_player_pick,
  public.set_thesis_outcome, public.confirm_thesis from public, anon;
grant execute on function public.set_single_device, public.make_thesis_pick, public.make_player_pick,
  public.set_thesis_outcome, public.confirm_thesis to authenticated;
