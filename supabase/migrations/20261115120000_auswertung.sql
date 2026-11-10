-- =====================================================================
-- Rasenschach: Auswertung eines Spieltags
-- Einmal komplett im SQL-Editor von Supabase ausführen
-- (nach 20261114120000_spieler_draft.sql).
--
-- - set_stat_value (Admin): Wert eines Spielers per Hand setzen oder die Handeingabe löschen
-- - set_league_entries (Admin): ligaweite Bestwerte (z. B. Laufleistung Platz 1–3) eintragen
-- - close_matchday / reopen_matchday (Admin): Spieltag freigeben bzw. wieder öffnen
--   (abschließen geht nur, wenn alle Spiele gespielt und alle Thesen von beiden bestätigt sind)
-- - Thesen auflösen und bestätigen ist nach dem Abschluss gesperrt
-- - Live-Aktualisierung für Spielerwerte, ligaweite Werte und Ergebnisse
-- =====================================================================

-- Nur Admin, Spieltag offen, Saison aktiv
create or replace function public.lock_matchday_for_scoring(p_matchday_id bigint)
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
  if v_md.closed_at is not null then
    raise exception 'Spieltag ist abgeschlossen. Erst wieder öffnen, dann ändern.';
  end if;
  return v_md;
end;
$$;

-- Wert per Hand: p_value null = Handeingabe löschen (dann gilt wieder der automatische Wert)
create or replace function public.set_stat_value(
  p_matchday_id bigint, p_player_id bigint, p_stat_key text, p_value numeric
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_matchday_for_scoring(p_matchday_id);
  if p_value is null then
    delete from public.stat_values
    where matchday_id = p_matchday_id and player_id = p_player_id and stat_key = p_stat_key and source = 'manual';
    return;
  end if;
  if p_value < 0 then raise exception 'Werte dürfen nicht negativ sein'; end if;
  insert into public.stat_values (matchday_id, player_id, stat_key, value, source, updated_by, updated_at)
  values (p_matchday_id, p_player_id, p_stat_key, p_value, 'manual', auth.uid(), now())
  on conflict (matchday_id, player_id, stat_key, source)
  do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- Ligaweite Bestwerte eines Messwerts ersetzen.
-- p_entries: [{"player_id": 12 | null, "player_name": "…", "value": 12.4, "rank": 1}, …]
-- Die Plätze berechnet die App nach den Regeln (geteilter Platz, danach der übernächste).
-- Leere Liste = Eintrag löschen.
create or replace function public.set_league_entries(p_matchday_id bigint, p_stat_key text, p_entries jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_matchday_for_scoring(p_matchday_id);
  delete from public.league_ranks where matchday_id = p_matchday_id and stat_key = p_stat_key;
  insert into public.league_ranks (matchday_id, stat_key, rank, player_id, player_name, value, source, updated_at)
  select p_matchday_id, p_stat_key, (e ->> 'rank')::int, nullif(e ->> 'player_id', '')::bigint,
         nullif(trim(e ->> 'player_name'), ''), (e ->> 'value')::numeric, 'manual', now()
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e;
end;
$$;

-- Spieltag freigeben (Prüfungen macht der Trigger guard_matchday_close)
create or replace function public.close_matchday(p_matchday_id bigint)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays := public.lock_matchday_for_scoring(p_matchday_id);
begin
  if (select count(*) from public.player_picks where matchday_id = p_matchday_id) = 0
     and (select count(*) from public.thesis_picks where matchday_id = p_matchday_id) = 0 then
    raise exception 'An diesem Spieltag wurde nicht gespielt';
  end if;
  update public.matchdays set closed_at = now() where id = p_matchday_id returning * into v_md;
  return v_md;
end;
$$;

create or replace function public.reopen_matchday(p_matchday_id bigint)
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
  update public.matchdays set closed_at = null where id = p_matchday_id returning * into v_md;
  return v_md;
end;
$$;

-- Thesen auflösen / bestätigen: wie bisher, aber nur gesetzte Thesen und nicht nach dem Abschluss
create or replace function public.guard_thesis_resolution(p_thesis_id bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays;
begin
  select m.* into v_md from public.theses t join public.matchdays m on m.id = t.matchday_id where t.id = p_thesis_id;
  if v_md.id is null then raise exception 'These nicht gefunden'; end if;
  if v_md.closed_at is not null then raise exception 'Spieltag ist abgeschlossen'; end if;
  if not exists (select 1 from public.thesis_picks where thesis_id = p_thesis_id) then
    raise exception 'Diese These wurde nicht gesetzt und wird nicht ausgewertet';
  end if;
end;
$$;

create or replace function public.set_thesis_outcome(p_thesis_id bigint, p_outcome boolean)
returns public.theses
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.manager_slot := public.my_slot();
  v_row public.theses;
begin
  if v_me is null then raise exception 'Kein Profil für dieses Konto'; end if;
  perform public.guard_thesis_resolution(p_thesis_id);
  update public.theses set
    confirmed_bent = case when outcome is not distinct from p_outcome then confirmed_bent else false end,
    confirmed_bjoern = case when outcome is not distinct from p_outcome then confirmed_bjoern else false end,
    outcome = p_outcome
  where id = p_thesis_id;
  update public.theses set
    confirmed_bent = confirmed_bent or v_me = 'bent',
    confirmed_bjoern = confirmed_bjoern or v_me = 'bjoern'
  where id = p_thesis_id and p_outcome is not null
  returning * into v_row;
  if v_row.id is null then select * into v_row from public.theses where id = p_thesis_id; end if;
  return v_row;
end;
$$;

create or replace function public.confirm_thesis(p_thesis_id bigint)
returns public.theses
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.manager_slot := public.my_slot();
  v_row public.theses;
begin
  if v_me is null then raise exception 'Kein Profil für dieses Konto'; end if;
  perform public.guard_thesis_resolution(p_thesis_id);
  update public.theses set
    confirmed_bent = confirmed_bent or v_me = 'bent',
    confirmed_bjoern = confirmed_bjoern or v_me = 'bjoern'
  where id = p_thesis_id and outcome is not null
  returning * into v_row;
  if v_row.id is null then raise exception 'These ist noch nicht aufgelöst'; end if;
  return v_row;
end;
$$;

revoke execute on function public.lock_matchday_for_scoring, public.guard_thesis_resolution from public, anon, authenticated;
revoke execute on function public.set_stat_value, public.set_league_entries, public.close_matchday, public.reopen_matchday,
  public.set_thesis_outcome, public.confirm_thesis from public, anon;
grant execute on function public.set_stat_value, public.set_league_entries, public.close_matchday, public.reopen_matchday,
  public.set_thesis_outcome, public.confirm_thesis to authenticated;

-- Live: Spielerwerte, ligaweite Werte und Ergebnisse
do $$
declare t text;
begin
  foreach t in array array['stat_values', 'league_ranks', 'matches'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
