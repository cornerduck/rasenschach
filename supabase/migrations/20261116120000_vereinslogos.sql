-- =====================================================================
-- Rasenschach: Vereinslogos im eigenen Speicher
-- Einmal komplett im SQL-Editor von Supabase ausführen
-- (nach 20261115120000_auswertung.sql).
--
-- - Storage Bucket "vereinslogos": öffentlich lesbar (Logos sind keine geheimen Daten),
--   nur PNG/JPG/WebP bis 1 MB. Schreiben nur serverseitig mit dem geheimen Schlüssel
--   (Import-Skript, Upload des Admins nach Prüfung im Server).
-- - clubs.logo_url zeigt ab jetzt nur noch auf den eigenen Speicher.
--   Die Adresse bei OpenLigaDB steht in clubs.logo_source_url.
-- - clubs.logo_is_manual: Logo wurde vom Admin hochgeladen (Import überschreibt es nicht).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vereinslogos', 'vereinslogos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.clubs add column if not exists logo_source_url text;
alter table public.clubs add column if not exists logo_is_manual boolean not null default false;

-- Bisherige fremde Adressen als Quelle merken und nicht mehr direkt anzeigen
-- (bis zum Import erscheint das Vereinskürzel in Vereinsfarbe)
update public.clubs
set logo_source_url = coalesce(logo_source_url, logo_url),
    logo_url = null
where logo_url is not null
  and logo_url not like '%/storage/v1/object/public/vereinslogos/%';
