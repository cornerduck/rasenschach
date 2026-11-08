# Rasenschach

Web-App für ein privates Fantasy-Duell zur Fußball-Bundesliga zwischen Bent (Admin) und Björn, nach dem Format „Rasenschach“ von Calcio Berlin. Beide spielen getrennt an ihren eigenen Laptops, Züge erscheinen live beim anderen.

- Regeln: `docs/REGELWERK.md` (verbindlich, Punkteberechnung exakt so umsetzen)
- Design: `docs/DESIGN.md` und die Entwürfe in `docs/mockups/`

## Stack

- Next.js (App Router, TypeScript) auf Vercel, Repo `cornerduck/rasenschach`
- Supabase: Postgres, Auth (E-Mail und Passwort, Registrierung aus), Realtime für die Drafts
- Datenbankänderungen als SQL-Migrationen in `supabase/migrations/`; Bent führt sie im SQL-Editor von Supabase aus, sag ihm jeweils genau, was er tun muss
- Umgebungsvariablen: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (nur serverseitig, nie im Browser). Lokal in `.env.local`, die nicht committet wird

## Daten

- **Sofascore** ist Hauptquelle (Bent hat die Erlaubnis von Sofascore): Kader mit Spieler-ID, Rückennummer, Position; Spielerfotos über die Bildadresse; Spielerstatistiken pro Spiel; Team der Woche. Abruf nur über serverseitige Route Handler, nie direkt aus dem Browser. Die Schnittstelle ist inoffiziell und kann sich ändern: Fehler sauber abfangen.
- **OpenLigaDB** (`api.openligadb.de`, ohne Schlüssel) als Ersatz für Spielplan und Ergebnisse, falls nötig
- Nicht automatisch verfügbar (vermutlich): Laufleistung, Sprints, Höchstgeschwindigkeit, Raumgewinn, Sololauf. Diese Werte trägt Bent per Hand ein. **Jeder automatisch geholte Wert muss per Hand überschreibbar sein.**
- Thesen fügt Bent per Copy-Paste ein (12 pro Spieltag)

## Regeln für die Umsetzung

- Rechte serverseitig bzw. per Row Level Security durchsetzen: nur wer am Zug ist, darf setzen; Drafts nach der Deadline (erster Anstoß) gesperrt; nur Bent darf Thesen anlegen, Werte eintragen, Kader aktualisieren; Thesenauflösung braucht Bestätigung beider
- Punkteberechnung als reine, getestete Funktionen (Unit-Tests für jede Figur, die Thesenfelder und Sonderfälle wie Turm mit 2 Gegentoren, Dreierpack, Spieler der Woche)
- Oberfläche komplett auf Deutsch
- Bent ist kein Profi-Entwickler: erkläre Schritte, die er selbst machen muss (Supabase, Vercel, Terminal), klar und einzeln
