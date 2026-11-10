-- =====================================================================
-- Rasenschach: Münzwurf entscheidet, wer beginnt
-- Einmal komplett im SQL-Editor von Supabase ausführen.
--
-- - toss_coin: lost in der Datenbank Bent oder Björn (50:50), nur einmal pro Spieltag
-- - Startspieler lässt sich nicht mehr per Hand wählen; der Admin kann den Wurf
--   wie bisher über „Zurücksetzen“ (reset_matchday_prep 'start') aufheben
-- =====================================================================

create or replace function public.toss_coin(p_matchday_id bigint)
returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare
  v_md public.matchdays := public.lock_matchday_for_prep(p_matchday_id);
begin
  if v_md.thesis_starter is not null then raise exception 'Die Münze wurde schon geworfen'; end if;
  update public.matchdays
  set thesis_starter = (case when random() < 0.5 then 'bent' else 'bjoern' end)::public.manager_slot
  where id = p_matchday_id
  returning * into v_md;
  return v_md;
end;
$$;

revoke execute on function public.toss_coin from public, anon;
grant execute on function public.toss_coin to authenticated;

-- Startspieler nicht mehr frei wählbar (nur noch per Münzwurf)
revoke execute on function public.set_thesis_starter from authenticated;
