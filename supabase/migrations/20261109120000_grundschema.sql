-- =====================================================================
-- Rasenschach: Grundschema
-- Einmal komplett im SQL-Editor von Supabase ausführen.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aufzählungen
-- ---------------------------------------------------------------------

create type public.manager_slot as enum ('bent', 'bjoern');
create type public.player_position as enum ('TW', 'AB', 'MF', 'ST');
create type public.data_source as enum ('manual', 'sofascore', 'openligadb', 'csv');
create type public.thesis_kind as enum ('spieltag', 'spiel');
create type public.thesis_field as enum ('plus_minus_3', 'minus_plus_3', 'plus_1', 'minus_1', 'frage');
create type public.question_value as enum ('plus_1', 'plus_2', 'plus_3', 'minus_3', 'plus_minus_3');
create type public.piece as enum ('turm', 'laeufer', 'springer', 'dame', 'koenig');
create type public.knight_category as enum (
  'zweikaempfer', 'tuersteher', 'dauerfeuer', 'bollwerk', 'laser',
  'ballmagnet', 'raumdeuter', 'alleingang', 'gefahrensucher', 'schallmauer'
);

-- ---------------------------------------------------------------------
-- Profile: Bent und Björn (verknüpft mit Supabase Auth)
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  slot public.manager_slot unique,          -- 'bent' oder 'bjoern'
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Profile für die bereits angelegten Konten erzeugen (Name und Rolle setzt Bent danach)
insert into public.profiles (id) select id from auth.users on conflict do nothing;

-- ---------------------------------------------------------------------
-- Saisons, Vereine, Spieler, Kader
-- ---------------------------------------------------------------------

create table public.seasons (
  id bigint generated always as identity primary key,
  start_year int not null unique,           -- 2026 = Saison 2026/27
  name text not null,                       -- "2026/27"
  is_archived boolean not null default false,
  -- Offene Regelfragen, bis zur Klärung konfigurierbar
  rules jsonb not null default '{
    "saisonlimit": 3,
    "limit_zaehlt_ohne_einsatz": true,
    "springer_mindestminuten": 0
  }'::jsonb,
  created_at timestamptz not null default now()
);

create table public.clubs (
  id bigint generated always as identity primary key,
  name text not null,
  short_name text not null,                 -- "Bremen"
  code text not null unique,                -- Kürzel für Badge: "SVW"
  logo_url text,
  color_primary text not null default '#444444',   -- Trikot
  color_secondary text not null default '#FFFFFF', -- Rückennummer / Absetzung
  external_ids jsonb not null default '{}'::jsonb, -- {"openligadb": "134", "sofascore": "2534"}
  created_at timestamptz not null default now()
);
create unique index clubs_openligadb_id on public.clubs ((external_ids ->> 'openligadb'));
create unique index clubs_sofascore_id on public.clubs ((external_ids ->> 'sofascore'));

create table public.season_clubs (
  season_id bigint not null references public.seasons (id) on delete cascade,
  club_id bigint not null references public.clubs (id) on delete restrict,
  primary key (season_id, club_id)
);

create table public.players (
  id bigint generated always as identity primary key,
  full_name text not null,
  short_name text not null,                 -- Name auf der Karte, z. B. "Demirović"
  photo_url text,                           -- leer = Trikot-Grafik
  external_ids jsonb not null default '{}'::jsonb, -- {"openligadb": "18339", "sofascore": "..."}
  created_at timestamptz not null default now()
);
create unique index players_openligadb_id on public.players ((external_ids ->> 'openligadb'));
create unique index players_sofascore_id on public.players ((external_ids ->> 'sofascore'));

-- Kader pro Saison (aus CSV-Import). Wechsel innerhalb der Liga: club_id ändern.
create table public.squad_memberships (
  season_id bigint not null references public.seasons (id) on delete cascade,
  player_id bigint not null references public.players (id) on delete cascade,
  club_id bigint not null references public.clubs (id) on delete restrict,
  position public.player_position not null,
  shirt_number int check (shirt_number between 1 and 99),
  is_active boolean not null default true,  -- false = nicht mehr im Kader, bleibt für Historie
  source public.data_source not null default 'csv',
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id)
);
create index squad_memberships_club on public.squad_memberships (season_id, club_id);

-- ---------------------------------------------------------------------
-- Spieltage, Spiele, Tore
-- ---------------------------------------------------------------------

create table public.matchdays (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons (id) on delete cascade,
  number int not null check (number between 1 and 34),
  -- Spielvorbereitung (gilt für beide)
  question_value public.question_value,
  knight_category public.knight_category,
  thesis_starter public.manager_slot,       -- hat Schnick Schnack Schnuck gewonnen
  closed_at timestamptz,                    -- Spieltag abgeschlossen (alle Spiele gespielt, alles gewertet)
  created_at timestamptz not null default now(),
  unique (season_id, number)
);

create table public.matches (
  id bigint generated always as identity primary key,
  matchday_id bigint not null references public.matchdays (id) on delete cascade,
  home_club_id bigint not null references public.clubs (id),
  away_club_id bigint not null references public.clubs (id),
  kickoff timestamptz not null,
  -- Erster angesetzter Anstoß; bleibt bei Verlegungen stehen, damit sich die Deadline nicht verschiebt
  original_kickoff timestamptz,
  is_finished boolean not null default false,
  home_goals_ht int, away_goals_ht int,
  home_goals int, away_goals int,
  external_ids jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  fetched_at timestamptz
);
create unique index matches_openligadb_id on public.matches ((external_ids ->> 'openligadb'));
create unique index matches_sofascore_id on public.matches ((external_ids ->> 'sofascore'));
create index matches_matchday on public.matches (matchday_id);

create table public.goals (
  id bigint generated always as identity primary key,
  match_id bigint not null references public.matches (id) on delete cascade,
  minute int,
  scoring_club_id bigint not null references public.clubs (id), -- Team, das den Treffer bekommt
  player_id bigint references public.players (id),              -- null = noch nicht zugeordnet
  scorer_name_raw text not null,           -- so wie die Quelle ihn schreibt ("F. Nmecha")
  scorer_external_id text,                 -- ID des Schützen bei der Quelle
  is_penalty boolean not null default false,
  is_own_goal boolean not null default false,
  is_stoppage_time boolean not null default false,
  source public.data_source not null default 'openligadb',
  external_id text,
  unique (source, external_id)
);
create index goals_match on public.goals (match_id);
create index goals_player on public.goals (player_id);

create function public.set_original_kickoff()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.original_kickoff := coalesce(new.original_kickoff, new.kickoff);
  else
    new.original_kickoff := coalesce(old.original_kickoff, new.original_kickoff, new.kickoff);
  end if;
  return new;
end;
$$;
create trigger matches_original_kickoff before insert or update on public.matches
for each row execute function public.set_original_kickoff();

-- Deadline = erster Anstoß des Spieltags. Ein verlegtes Spiel zählt mit seinem ursprünglichen
-- Termin, damit sich die Deadline durch eine Verlegung nie nach hinten verschiebt.
create function public.matchday_deadline(p_matchday_id bigint)
returns timestamptz language sql stable as $$
  select min(least(kickoff, coalesce(original_kickoff, kickoff)))
  from public.matches where matchday_id = p_matchday_id
$$;

-- Spieltag erst abschließen, wenn alle Spiele (inkl. Nachholspiele) beendet und alle
-- gesetzten Thesen aufgelöst und von beiden bestätigt sind
create function public.guard_matchday_close()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.closed_at is not null and old.closed_at is null then
    if not exists (select 1 from public.matches where matchday_id = new.id) then
      raise exception 'Spieltag hat keine Spiele';
    end if;
    if exists (select 1 from public.matches where matchday_id = new.id and not is_finished) then
      raise exception 'Noch nicht alle Spiele gespielt (Nachholspiel abwarten)';
    end if;
    if exists (
      select 1 from public.thesis_picks tp join public.theses t on t.id = tp.thesis_id
      where tp.matchday_id = new.id
        and (t.outcome is null or not t.confirmed_bent or not t.confirmed_bjoern)
    ) then
      raise exception 'Noch nicht alle Thesen von beiden bestätigt';
    end if;
  end if;
  return new;
end;
$$;
create trigger matchdays_guard_close before update of closed_at on public.matchdays
for each row execute function public.guard_matchday_close();

-- Archiv: archivierte Saisons können nicht gelöscht werden
create function public.guard_season_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_archived then
    raise exception 'Archivierte Saisons können nicht gelöscht werden';
  end if;
  return old;
end;
$$;
create trigger seasons_guard_delete before delete on public.seasons
for each row execute function public.guard_season_delete();

-- ---------------------------------------------------------------------
-- Thesen
-- ---------------------------------------------------------------------

create table public.theses (
  id bigint generated always as identity primary key,
  matchday_id bigint not null references public.matchdays (id) on delete cascade,
  sort_order int not null check (sort_order between 1 and 12),
  kind public.thesis_kind not null,
  match_id bigint references public.matches (id) on delete set null, -- bei kind = 'spiel'
  text text not null,
  -- Auflösung: zählt erst, wenn beide bestätigt haben
  outcome boolean,                         -- true = eingetroffen
  confirmed_bent boolean not null default false,
  confirmed_bjoern boolean not null default false,
  created_at timestamptz not null default now(),
  unique (matchday_id, sort_order)
);

-- ---------------------------------------------------------------------
-- Drafts
-- ---------------------------------------------------------------------

create table public.thesis_picks (
  id bigint generated always as identity primary key,
  matchday_id bigint not null references public.matchdays (id) on delete cascade,
  manager public.manager_slot not null,
  field public.thesis_field not null,
  thesis_id bigint not null references public.theses (id) on delete cascade,
  pick_no int not null check (pick_no between 1 and 10),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (matchday_id, thesis_id),         -- jede These nur einmal
  unique (matchday_id, manager, field),    -- jedes Feld nur einmal pro Person
  unique (matchday_id, pick_no)
);

create table public.player_picks (
  id bigint generated always as identity primary key,
  matchday_id bigint not null references public.matchdays (id) on delete cascade,
  manager public.manager_slot not null,
  piece public.piece not null,
  player_id bigint not null references public.players (id),
  pick_no int not null check (pick_no between 1 and 10),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (matchday_id, player_id),         -- pro Woche nur einmal vergeben
  unique (matchday_id, manager, piece),    -- jede Figur nur einmal pro Person
  unique (matchday_id, pick_no)
);
create index player_picks_player on public.player_picks (player_id, manager);

-- ---------------------------------------------------------------------
-- Spielerwerte: jeder Wert mit Herkunft, Handeingabe schlägt alles
-- ---------------------------------------------------------------------

create table public.stat_values (
  id bigint generated always as identity primary key,
  matchday_id bigint not null references public.matchdays (id) on delete cascade,
  player_id bigint not null references public.players (id) on delete cascade,
  match_id bigint references public.matches (id) on delete set null,
  stat_key text not null check (stat_key in (
    'minutes_played', 'goals', 'assists',
    'goals_conceded_on_pitch', 'saves', 'penalties_saved', 'goals_prevented',
    'distance_km', 'sprints',
    'duels_won', 'defensive_actions', 'offensive_actions', 'duel_success_pct',
    'pass_accuracy_pct', 'touches', 'progressive_distance_m', 'longest_solo_run_m',
    'expected_goals', 'top_speed_kmh',
    'team_of_week', 'player_of_week'         -- 1 = ja, 0 = nein
  )),
  value numeric not null,
  source public.data_source not null,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (matchday_id, player_id, stat_key, source)
);
create index stat_values_lookup on public.stat_values (matchday_id, player_id);

-- Gültiger Wert pro Spieler und Messwert: Hand > Sofascore > OpenLigaDB > CSV
create view public.effective_stat_values
with (security_invoker = true) as
select distinct on (matchday_id, player_id, stat_key)
  matchday_id, player_id, match_id, stat_key, value, source, updated_at
from public.stat_values
order by matchday_id, player_id, stat_key,
  case source when 'manual' then 0 when 'sofascore' then 1 when 'openligadb' then 2 else 3 end;

-- Ligaweite Plätze (z. B. Laufleistung Platz 1–3, meiste Sprints).
-- Mehrere Einträge mit gleichem Platz = geteilter Platz.
create table public.league_ranks (
  id bigint generated always as identity primary key,
  matchday_id bigint not null references public.matchdays (id) on delete cascade,
  stat_key text not null,                  -- gleiche Schlüssel wie stat_values, plus 'scorer_points'
  rank int not null check (rank between 1 and 3),
  player_id bigint references public.players (id), -- null, wenn Spieler (noch) nicht im Kader
  player_name text,
  value numeric,
  source public.data_source not null default 'manual',
  updated_at timestamptz not null default now()
);
create index league_ranks_lookup on public.league_ranks (matchday_id, stat_key);

-- Protokoll der Abrufe ("Zuletzt abgerufen …")
create table public.sync_runs (
  id bigint generated always as identity primary key,
  source public.data_source not null,
  kind text not null,                      -- 'spielplan', 'ergebnisse', 'kader', 'spielerwerte'
  season_id bigint references public.seasons (id) on delete cascade,
  matchday_id bigint references public.matchdays (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  message text
);

-- ---------------------------------------------------------------------
-- Hilfsfunktionen für Rechte
-- ---------------------------------------------------------------------

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create function public.my_slot()
returns public.manager_slot language sql stable security definer set search_path = '' as $$
  select slot from public.profiles where id = auth.uid()
$$;

-- Wer ist bei Zug Nummer n (1–10) dran? Snake: 1,2,2,2,2,1 → A B B A A B B A A B
create function public.snake_turn(p_first public.manager_slot, p_pick_no int)
returns public.manager_slot language sql immutable as $$
  select case
    when (array[1,2,2,1,1,2,2,1,1,2])[p_pick_no] = 1 then p_first
    when p_first = 'bent' then 'bjoern'::public.manager_slot
    else 'bent'::public.manager_slot
  end
$$;

-- ---------------------------------------------------------------------
-- Züge setzen (einzige Schreibwege für Drafts, alle Regeln serverseitig)
-- ---------------------------------------------------------------------

create function public.make_thesis_pick(p_matchday_id bigint, p_field public.thesis_field, p_thesis_id bigint)
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

create function public.make_player_pick(p_matchday_id bigint, p_piece public.piece, p_player_id bigint)
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
  v_row public.player_picks;
begin
  select * into v_md from public.matchdays where id = p_matchday_id for update;
  if v_md.id is null then raise exception 'Spieltag nicht gefunden'; end if;
  if v_me is null then raise exception 'Kein Profil für dieses Konto'; end if;
  if (select is_archived from public.seasons where id = v_md.season_id) then
    raise exception 'Saison ist archiviert';
  end if;
  select * into v_season from public.seasons where id = v_md.season_id;

  v_deadline := public.matchday_deadline(p_matchday_id);
  if v_deadline is not null and now() >= v_deadline then
    raise exception 'Deadline vorbei: Der Draft ist gesperrt';
  end if;
  if (select count(*) from public.thesis_picks where matchday_id = p_matchday_id) < 10 then
    raise exception 'Erst den Thesen-Draft abschließen';
  end if;

  -- Spieler-Draft beginnt, wer den Thesen-Draft nicht begonnen hat
  v_first := case when v_md.thesis_starter = 'bent' then 'bjoern'::public.manager_slot else 'bent'::public.manager_slot end;
  select count(*) + 1 into v_next from public.player_picks where matchday_id = p_matchday_id;
  if v_next > 10 then raise exception 'Spieler-Draft ist bereits abgeschlossen'; end if;
  if public.snake_turn(v_first, v_next) <> v_me then
    raise exception 'Du bist nicht am Zug';
  end if;

  -- Spieler muss im aktuellen Kader stehen
  select position into v_pos from public.squad_memberships
  where season_id = v_md.season_id and player_id = p_player_id and is_active;
  if v_pos is null then raise exception 'Spieler steht in keinem Bundesliga-Kader'; end if;
  if p_piece = 'turm' and v_pos <> 'TW' then raise exception 'Auf den Turm dürfen nur Torhüter'; end if;

  -- Saisonlimit pro Person
  select count(*) into v_used
  from public.player_picks pp
  join public.matchdays m on m.id = pp.matchday_id
  where m.season_id = v_md.season_id and pp.manager = v_me and pp.player_id = p_player_id
    and (
      coalesce((v_season.rules ->> 'limit_zaehlt_ohne_einsatz')::boolean, true)
      or coalesce((select e.value from public.effective_stat_values e
                   where e.matchday_id = pp.matchday_id and e.player_id = pp.player_id
                     and e.stat_key = 'minutes_played'), 1) > 0
    );
  if v_used >= coalesce((v_season.rules ->> 'saisonlimit')::int, 3) then
    raise exception 'Saisonlimit erreicht: Spieler schon % Mal eingesetzt', v_used;
  end if;

  insert into public.player_picks (matchday_id, manager, piece, player_id, pick_no, created_by)
  values (p_matchday_id, v_me, p_piece, p_player_id, v_next, auth.uid())
  returning * into v_row;
  return v_row;
exception
  when unique_violation then raise exception 'Spieler oder Figur ist bereits vergeben';
end;
$$;

-- Spielvorbereitung (Räder, Startspieler): beide dürfen, aber nur solange noch kein Zug gesetzt ist
create function public.set_matchday_prep(
  p_matchday_id bigint,
  p_question_value public.question_value,
  p_knight_category public.knight_category,
  p_thesis_starter public.manager_slot
) returns public.matchdays
language plpgsql security definer set search_path = '' as $$
declare v_row public.matchdays;
begin
  if public.my_slot() is null then raise exception 'Kein Profil für dieses Konto'; end if;
  if exists (select 1 from public.thesis_picks where matchday_id = p_matchday_id) then
    raise exception 'Der Draft hat schon begonnen, die Vorbereitung ist gesperrt';
  end if;
  update public.matchdays set
    question_value = coalesce(p_question_value, question_value),
    knight_category = coalesce(p_knight_category, knight_category),
    thesis_starter = coalesce(p_thesis_starter, thesis_starter)
  where id = p_matchday_id
  returning * into v_row;
  if v_row.id is null then raise exception 'Spieltag nicht gefunden'; end if;
  return v_row;
end;
$$;

-- Thesen auflösen: wer das Ergebnis setzt, bestätigt es automatisch; der andere muss noch bestätigen.
-- Ändert sich das Ergebnis, werden beide Bestätigungen zurückgesetzt.
create function public.set_thesis_outcome(p_thesis_id bigint, p_outcome boolean)
returns public.theses
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.manager_slot := public.my_slot();
  v_row public.theses;
begin
  if v_me is null then raise exception 'Kein Profil für dieses Konto'; end if;
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

create function public.confirm_thesis(p_thesis_id bigint)
returns public.theses
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.manager_slot := public.my_slot();
  v_row public.theses;
begin
  if v_me is null then raise exception 'Kein Profil für dieses Konto'; end if;
  update public.theses set
    confirmed_bent = confirmed_bent or v_me = 'bent',
    confirmed_bjoern = confirmed_bjoern or v_me = 'bjoern'
  where id = p_thesis_id and outcome is not null
  returning * into v_row;
  if v_row.id is null then raise exception 'These nicht gefunden oder noch nicht aufgelöst'; end if;
  return v_row;
end;
$$;

-- Thesentext darf nach Draftbeginn nur noch geändert werden, solange er nicht gesetzt ist (Schutz vor Verwechslung)
create function public.guard_thesis_edit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.thesis_picks where thesis_id = old.id)
     and (new.text is distinct from old.text or new.match_id is distinct from old.match_id) then
    raise exception 'Diese These ist bereits gesetzt und kann nicht mehr geändert werden';
  end if;
  return new;
end;
$$;
create trigger theses_guard before update on public.theses
for each row execute function public.guard_thesis_edit();

-- Funktionen nur für eingeloggte Nutzer
revoke execute on function public.make_thesis_pick, public.make_player_pick, public.set_matchday_prep,
  public.set_thesis_outcome, public.confirm_thesis from public, anon;
grant execute on function public.make_thesis_pick, public.make_player_pick, public.set_matchday_prep,
  public.set_thesis_outcome, public.confirm_thesis to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- Lesen: beide eingeloggten Nutzer alles. Schreiben: nur Bent (Admin),
-- Drafts und Thesenauflösung ausschließlich über die Funktionen oben.
-- Serverseitige Abrufe (Sync) nutzen den geheimen Schlüssel und umgehen RLS.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'seasons', 'clubs', 'season_clubs', 'players', 'squad_memberships',
    'matchdays', 'matches', 'goals', 'theses', 'thesis_picks', 'player_picks',
    'stat_values', 'league_ranks', 'sync_runs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy "Eingeloggte lesen" on public.%I for select to authenticated using (true)', t);
  end loop;

  -- Admin darf schreiben (nicht in Drafts, nicht in Profilen)
  foreach t in array array[
    'seasons', 'clubs', 'season_clubs', 'players', 'squad_memberships',
    'matchdays', 'matches', 'goals', 'theses', 'stat_values', 'league_ranks', 'sync_runs'
  ] loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy "Admin schreibt" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Thesenauflösung nur über set_thesis_outcome / confirm_thesis: Admin darf Thesen anlegen und
-- Text, Reihenfolge und Spiel ändern, aber Ergebnis und Bestätigungen nicht direkt
revoke insert, update on public.theses from authenticated;
grant insert (matchday_id, sort_order, kind, match_id, text) on public.theses to authenticated;
grant update (sort_order, kind, match_id, text) on public.theses to authenticated;

revoke all on public.effective_stat_values from anon;
grant select on public.effective_stat_values to authenticated;

-- ---------------------------------------------------------------------
-- Realtime für die Live-Drafts
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table
  public.thesis_picks, public.player_picks, public.matchdays, public.theses;
