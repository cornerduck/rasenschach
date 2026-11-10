-- =====================================================================
-- Rasenschach: Spielerbilder im eigenen Speicher
-- Einmal komplett im SQL-Editor von Supabase ausführen
-- (nach 20261116120000_vereinslogos.sql).
--
-- - Storage Bucket "spielerbilder": öffentlich lesbar, nur PNG/JPG/WebP bis 1 MB.
--   Schreiben nur serverseitig mit dem geheimen Schlüssel (Import-Skript, Upload des
--   Admins nach Prüfung im Server). Keine Schreibrechte für eingeloggte Nutzer.
-- - Das Bild steht in players.photo_url (Spalte gibt es schon). Angezeigt werden nur
--   Bilder aus diesem Bucket, sonst das Trikot mit Rückennummer.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spielerbilder', 'spielerbilder', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
