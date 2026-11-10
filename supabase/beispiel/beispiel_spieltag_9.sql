-- =====================================================================
-- Rasenschach: Rechenbeispiel auf Spieltag 9 (nur zum Testen der Auswertung)
-- Im SQL-Editor von Supabase ausführen. Legt für den bereits gespielten Spieltag 9
-- 12 Beispiel-Thesen, die Spielvorbereitung und beide Drafts an.
-- Danach auf /spieltag/9/werte die Werte aus der Testanleitung eintragen.
-- Wieder entfernen: beispiel_spieltag_9_entfernen.sql
-- =====================================================================

do $$
declare
  v_md bigint;
  v_season bigint;
  v_names text[] := array[
    'Moritz Nicolas', 'Mio Backhaus', 'Felix Nmecha', 'Jonathan Burkardt', 'Christoph Baumgartner',
    'Christopher Nkunku', 'David Raum', 'Uchenna Ogundu', 'Miro Muheim', 'Rômulo'];
  v_who text[] := array['bjoern','bent','bent','bjoern','bjoern','bent','bent','bjoern','bjoern','bent'];
  v_piece text[] := array['turm','turm','koenig','koenig','dame','dame','laeufer','laeufer','springer','springer'];
  v_tfield text[] := array['plus_minus_3','plus_minus_3','minus_plus_3','minus_plus_3','plus_1','plus_1','minus_1','minus_1','frage','frage'];
  v_tmgr text[] := array['bent','bjoern','bjoern','bent','bent','bjoern','bjoern','bent','bent','bjoern'];
  v_ttext text[] := array[
    'Beispiel 1 · Bent +/−3 · bitte EINGETROFFEN',
    'Beispiel 2 · Björn +/−3 · bitte NICHT EINGETROFFEN',
    'Beispiel 3 · Björn −/+3 · bitte NICHT EINGETROFFEN',
    'Beispiel 4 · Bent −/+3 · bitte EINGETROFFEN',
    'Beispiel 5 · Bent +1 · bitte NICHT EINGETROFFEN',
    'Beispiel 6 · Björn +1 · bitte EINGETROFFEN',
    'Beispiel 7 · Björn −1 · bitte EINGETROFFEN',
    'Beispiel 8 · Bent −1 · bitte NICHT EINGETROFFEN',
    'Beispiel 9 · Bent ?-Feld (+2) · bitte EINGETROFFEN',
    'Beispiel 10 · Björn ?-Feld (+2) · bitte NICHT EINGETROFFEN',
    'Beispiel 11 · nicht gesetzt',
    'Beispiel 12 · nicht gesetzt'];
  v_pid bigint;
  i int;
begin
  select m.id, m.season_id into v_md, v_season
  from public.matchdays m join public.seasons s on s.id = m.season_id
  where s.start_year = 2026 and m.number = 9;
  if v_md is null then raise exception 'Spieltag 9 nicht gefunden'; end if;
  if exists (select 1 from public.theses where matchday_id = v_md) then
    raise exception 'Spieltag 9 hat schon Thesen. Erst beispiel_spieltag_9_entfernen.sql ausführen.';
  end if;

  update public.matchdays
  set question_value = 'plus_2', knight_category = 'dauerfeuer', thesis_starter = 'bent',
      thesis_draft_started_at = now(), player_draft_started_at = now(), closed_at = null
  where id = v_md;

  for i in 1..12 loop
    insert into public.theses (matchday_id, sort_order, kind, text) values (v_md, i, 'spieltag', v_ttext[i]);
  end loop;
  for i in 1..10 loop
    insert into public.thesis_picks (matchday_id, manager, field, thesis_id, pick_no)
    select v_md, v_tmgr[i]::public.manager_slot, v_tfield[i]::public.thesis_field, t.id, i
    from public.theses t where t.matchday_id = v_md and t.sort_order = i;
  end loop;

  for i in 1..10 loop
    select sm.player_id into v_pid
    from public.squad_memberships sm join public.players p on p.id = sm.player_id
    where sm.season_id = v_season and p.full_name = v_names[i];
    if v_pid is null then raise exception 'Spieler % nicht im Kader', v_names[i]; end if;
    insert into public.player_picks (matchday_id, manager, piece, player_id, pick_no)
    values (v_md, v_who[i]::public.manager_slot, v_piece[i]::public.piece, v_pid, i);
  end loop;
end $$;
