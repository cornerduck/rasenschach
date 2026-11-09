-- =====================================================================
-- Rasenschach: Spielvorbereitung und Thesen speichern
-- Einmal komplett im SQL-Editor von Supabase ausführen.
--
-- - Räder werden in der Datenbank gelost (nicht im Browser), jedes nur einmal
-- - Startspieler (Schnick Schnack Schnuck) setzen beide, änderbar bis zum ersten Zug
-- - Admin kann ein Rad zurücksetzen, solange der Thesen-Draft nicht begonnen hat
-- - Thesen werden als Ganzes gespeichert (nur Admin, nur vor Draftbeginn)
-- =====================================================================

drop function if exists public.set_matchday_prep(bigint, public.question_value, public.knight_category, public.manager_slot);

-- Gemeinsame Prüfung: Spieltag sperren, Konto, Archiv, Draft noch nicht begonnen, Deadline
create function public.lock_matchday_for_prep(p_matchday_id bigint)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays;
  v_deadline timestamptz;
begin
  if public.my_slot() is null then raise exception 'Kein Profil für dieses Konto'; end if;
  select * into v_md from public.matchdays where id = p_matchday_id for update;
  if v_md.id is null then raise exception 'Spieltag nicht gefunden'; end if;
  if (select is_archived from public.seasons where id = v_md.season_id) then
    raise exception 'Saison ist archiviert';
  end if;
  if exists (select 1 from public.thesis_picks where matchday_id = p_matchday_id) then
    raise exception 'Der Thesen-Draft hat schon begonnen, die Vorbereitung ist gesperrt';
  end if;
  v_deadline := public.matchday_deadline(p_matchday_id);
  if v_deadline is not null and now() >= v_deadline then
    raise exception 'Deadline vorbei';
  end if;
  return v_md;
end;
$$;

create function public.spin_question_wheel(p_matchday_id bigint)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays := public.lock_matchday_for_prep(p_matchday_id);
  v_values public.question_value[] := enum_range(null::public.question_value);
begin
  if v_md.question_value is not null then raise exception 'Das ?-Rad wurde schon gedreht'; end if;
  update public.matchdays
  set question_value = v_values[1 + floor(random() * array_length(v_values, 1))::int]
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

create function public.spin_knight_wheel(p_matchday_id bigint)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays := public.lock_matchday_for_prep(p_matchday_id);
  v_values public.knight_category[] := enum_range(null::public.knight_category);
begin
  if v_md.knight_category is not null then raise exception 'Das Springer-Rad wurde schon gedreht'; end if;
  update public.matchdays
  set knight_category = v_values[1 + floor(random() * array_length(v_values, 1))::int]
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

create function public.set_thesis_starter(p_matchday_id bigint, p_starter public.manager_slot)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays := public.lock_matchday_for_prep(p_matchday_id);
begin
  update public.matchdays set thesis_starter = p_starter where id = p_matchday_id returning * into v_md;
  return v_md;
end;
$$;

-- Nur Admin: ein Rad oder den Startspieler zurücksetzen ('frage', 'springer', 'start')
create function public.reset_matchday_prep(p_matchday_id bigint, p_what text)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays;
begin
  if not public.is_admin() then raise exception 'Nur für Admin'; end if;
  v_md := public.lock_matchday_for_prep(p_matchday_id);
  update public.matchdays set
    question_value = case when p_what = 'frage' then null else question_value end,
    knight_category = case when p_what = 'springer' then null else knight_category end,
    thesis_starter = case when p_what = 'start' then null else thesis_starter end
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

-- Nur Admin: alle Thesen eines Spieltags auf einmal speichern (ersetzt die bisherigen).
-- p_theses: [{"kind": "spieltag"|"spiel", "match_id": 123|null, "text": "..."}, ...] in Reihenfolge
create function public.save_theses(p_matchday_id bigint, p_theses jsonb)
returns setof public.theses
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_i int := 0;
  v_kind public.thesis_kind;
  v_match bigint;
  v_text text;
begin
  if not public.is_admin() then raise exception 'Nur für Admin'; end if;
  perform public.lock_matchday_for_prep(p_matchday_id);
  if jsonb_typeof(p_theses) <> 'array' or jsonb_array_length(p_theses) not between 1 and 12 then
    raise exception 'Es müssen 1 bis 12 Thesen sein';
  end if;

  delete from public.theses where matchday_id = p_matchday_id;

  for v_item in select * from jsonb_array_elements(p_theses) loop
    v_i := v_i + 1;
    v_kind := (v_item ->> 'kind')::public.thesis_kind;
    v_match := nullif(v_item ->> 'match_id', '')::bigint;
    v_text := btrim(v_item ->> 'text');
    if v_text is null or v_text = '' then raise exception 'These % ist leer', v_i; end if;
    if v_kind = 'spieltag' then v_match := null; end if;
    if v_match is not null and not exists (
      select 1 from public.matches where id = v_match and matchday_id = p_matchday_id
    ) then
      raise exception 'These %: Spiel gehört nicht zu diesem Spieltag', v_i;
    end if;
    insert into public.theses (matchday_id, sort_order, kind, match_id, text)
    values (p_matchday_id, v_i, v_kind, v_match, v_text);
  end loop;

  return query select * from public.theses where matchday_id = p_matchday_id order by sort_order;
end;
$$;

-- Gesetzte Thesen dürfen nicht gelöscht werden (sonst verschwänden Züge)
create function public.guard_thesis_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.thesis_picks where thesis_id = old.id) then
    raise exception 'Diese These ist bereits gesetzt und kann nicht gelöscht werden';
  end if;
  return old;
end;
$$;
create trigger theses_guard_delete before delete on public.theses
for each row execute function public.guard_thesis_delete();

revoke execute on function public.lock_matchday_for_prep, public.spin_question_wheel, public.spin_knight_wheel,
  public.set_thesis_starter, public.reset_matchday_prep, public.save_theses from public, anon;
grant execute on function public.spin_question_wheel, public.spin_knight_wheel,
  public.set_thesis_starter, public.reset_matchday_prep, public.save_theses to authenticated;
