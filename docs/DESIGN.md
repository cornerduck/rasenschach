# Rasenschach Design

Dunkles Design, Bent in Werder-Grün, Björn in Bayern-Rot. Die HTML-Entwürfe aller Seiten liegen in `docs/mockups/` (Format des Claude-Design-Canvas; Aufbau, Farben und Texte direkt ablesbar, die Daten darin sind Beispieldaten).

## Farben

| Zweck | Wert |
|---|---|
| Hintergrund | `#0B0D0C` |
| Fläche (Karten, Panels) | `#141816` |
| Fläche erhöht / Buttons sekundär | `#1A1F1C` |
| Linien | `#222826`, Eingabefelder `#2A312E` |
| Text | `#ECEFED` |
| Text gedämpft | `#9AA39E`, sehr gedämpft `#6F7873` |
| **Bent** Grundfarbe | `#1D9053` |
| Bent hell (Schrift auf Dunkel) | `#3DD68C` |
| Bent Kartenhintergrund | `#0F2419`, Thesenkarte `#121816` mit Rand `#1F4A33` |
| Bent Nebentext auf Karte | `#A9C9B6` |
| **Björn** Grundfarbe | `#DC052D` |
| Björn hell (Schrift auf Dunkel) | `#FF6B84` |
| Björn Kartenhintergrund | `#2A0C13`, Thesenkarte `#1A1214` mit Rand `#5A1A27` |
| Björn Nebentext auf Karte | `#D4A9B1` |
| Minuspunkte und Admin-Hinweise | `#F2A93B` (Bernstein, bewusst kein Rot, sonst sieht es aus wie Björn) |
| Felder zur Handeingabe | Rahmen `#F2A93B` |

## Schrift

- Überschriften, Zahlen, Namen auf Karten: **Barlow Condensed** 700/800 (Google Fonts), oft in Großbuchstaben mit leichtem Buchstabenabstand
- Fließtext und Bedienelemente: **Inter** 400 bis 700
- Kleine Labels (Feldnamen auf Karten): 11 px, 700, Großbuchstaben, `letter-spacing: 0.1em`

## Formen

- Karten: Radius 14 px, Panels 16 px, Buttons 10 px, Chips 999 px
- Primärbutton: weißer Hintergrund `#ECEFED`, dunkle Schrift. Aktionsbutton für Bent: grün `#1D9053`
- Leere Draft-Felder: gestrichelter Rahmen in der Spielerfarbe mit Plus-Symbol

## Spielerbild

- Foto von Sofascore über die Bildadresse anhand der Sofascore-Spieler-ID, in einem Kreis
- Fehlt das Foto oder lädt es nicht: **Trikot-Grafik** (SVG) in den Vereinsfarben mit Rückennummer
- Vereinslogos von Sofascore bzw. OpenLigaDB, Ersatz: Kürzel-Badge (SVW, FCB …) in Vereinsfarben

## Seiten

1. **Login** (zwei feste Konten, keine Registrierung)
2. **Saisonübersicht:** 34 Spieltage als Kacheln (gewertet mit Ergebnis und Sieger, laufender Spieltag orange markiert, Rest ausgegraut), Saisonauswahl, Archiv vergangener Saisons
3. **Spielvorbereitung:** Schnick-Schnack-Schnuck-Gewinner antippen, Rad ?-Feld (±3, +1, +2, +3, −3), Rad Springer (10 Kategorien), jeweils Ergebnis mit Erklärung darunter
4. **Thesen-Draft live:** Leiste mit Snake-Reihenfolge (10 Kästchen B/J, erledigte gefüllt, aktueller Zug umrandet), Statusanzeige „X ist am Zug, N Thesen setzen“, oben Bents 5 Felder, Mitte Balken BENT vs BJÖRN, unten Björns Felder, rechts Thesenpool
5. **Spieler-Draft live:** wie Thesen-Draft, Figuren Turm/Läufer/Springer/Dame/König (Springer zeigt die geloste Kategorie), Karte mit Foto bzw. Trikot, Name, Position, Verein, „x/3 genutzt“; rechts Pool mit Suche, Positionsfilter, gesperrte Spieler ausgegraut mit Grund (3/3, beim Gegner, gesetzt)
6. **Spielfeld eines Spieltags:** links Spieltag, Punkte beider, Gesamtstand mit Balken, Spiele mit Ergebnissen; rechts 4 Reihen à 5 Karten (Bent Spieler, Bent Thesen, Balken, Björn Thesen, Björn Spieler), jede Karte mit Feld, Inhalt, Ergebnis und Punkten
7. **Auswertung eintragen (nur Admin Bent):** Buttons „Kader aktualisieren“ und „Spieltag von Sofascore abrufen“ mit Zeitpunkt des letzten Abrufs; links Thesen auflösen (Eingetroffen / Nicht eingetroffen, Bestätigung Bent und Björn); rechts Tabelle Spielerwerte (automatisch grau, Handeingabe mit orangem Rahmen, jeder Wert überschreibbar); darunter ligaweite Plätze, Team und Spieler der Woche
8. **Statistik:** Gesamtpunkte beider, Punkte pro Spieltag (gruppierte Balken), Punkte nach Feld, Rangliste beste Spieler mit Filter nach Figur

Alle Seiten müssen auch auf dem Handy nutzbar sein (Reihen scrollen horizontal, Seitenleisten rutschen unter den Inhalt).
