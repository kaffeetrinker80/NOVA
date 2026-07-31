# NOVAplan – Testschritte für diesen Ansatz

## Bedienkorrekturen v3.14b

1. Eine gelbe Meldung auslösen, z. B. einen Untersuchungsanteil ergänzen.
   Erwartung: Sie verschwindet nach fünf Sekunden selbstständig.
2. Im Planungsfenster `09:00–11:00` auf `13:00` ändern.
   Erwartung: Das Ende springt automatisch auf `15:00`.
3. Auf einer langen Seite nach unten scrollen.
   Erwartung: Rechts unten erscheint ein Pfeil zum Seitenanfang.
4. Im Planungsfenster Legionellen aktivieren.
   Erwartung: Das Probenfeld ist vollständig lesbar.
5. Bei der Berichtserfassung den Befund **ohne Befund (= sauber)** wählen.
   Erwartung: Der Abschluss wechselt automatisch auf **abgeschlossen**.

## Aktuelles Update v3.16: Auftragsnummer nach Untersuchungsjahr

Die Migration `0032_auftragsnummer_nach_untersuchungsjahr.sql` ist im Projekt
`kaffeetrinker80` bereits ausgeführt. Es muss kein SQL manuell gestartet werden.

Test Planung und Auftragsbuch:

1. Eine Untersuchung mit Datum im Jahr 2026 planen. Die Vorschau muss mit
   `26-` beginnen.
2. Das Datum im selben Fenster auf den 01.01.2027 oder später ändern.
   Erwartung: Die Vorschau wechselt sofort auf `27-0001`, solange 2027 noch
   keine Nummer vergeben wurde.
3. Termin und Auftrag anlegen. Die gespeicherte Nummer muss zum Jahr des
   Untersuchungsdatums passen.
4. Auftragsbuch öffnen und ein Jahr wählen. **Freie Nummern des gewählten
   Jahres anzeigen** darf weiterhin alle Lücken bis zum aktuellen Höchststand
   einblenden.
5. Eine freie niedrigere Nummer über **Belegen** nacherfassen. Eine freie höhere
   Nummer kann über **manuell eingreifen** erfasst werden. Doppelnummern müssen
   weiterhin abgewiesen werden.
6. Erwartung: Es gibt keinen sichtbaren oder einstellbaren „Blockstand“ mehr.
   Die nächste automatische Nummer wird intern je Jahr ermittelt.

Test Überschreitungsphase:

1. Eine saubere weitergehende Legionellen-Untersuchung öffnen.
2. Nur wenn das Gesundheitsamt sie anerkennt, die Option
   **vom Gesundheitsamt als saubere NU anerkannt** aktivieren.
3. In **Phase verwalten** prüfen, ob sie im Zähler erscheint.
4. Eine vorzeitige GA-Freigabe vor `3/3` mit Datum und Begründung erfassen.
5. Erwartung: Die Phase wird als durch das Gesundheitsamt beendet dokumentiert.

## Wichtig ab v3.13b: Produktions-Build mit Supabase

Die fertig gebaute Version ist wieder mit dem Projekt `kaffeetrinker80`
verbunden. Ein Produktions-Build ohne `VITE_SUPABASE_URL` und
`VITE_SUPABASE_ANON_KEY` wird künftig automatisch abgebrochen, statt unbemerkt
mit den drei Demo-Kunden ausgeliefert zu werden.

## Aktuelles Update v3.13: getrennte Prüfberichte L / M / C

Für dieses Update ist **keine neue SQL-Migration** erforderlich. Die vorhandene
Tabelle `td_untersuchungsbewertungen` speichert bereits genau eine Bewertung je
Unterauftrag.

Test:

1. Einen Auftrag mit Legionellen und Mibi oder Chemie über **Bericht** öffnen.
2. Für jeden Anteil eine andere Prüfbericht-Nr., ein anderes Berichtdatum und
   einen eigenen Befund eintragen.
3. Schließen und erneut öffnen. Erwartung: Alle Angaben bleiben je `26-xxxx`,
   `26-xxxx-M` und `26-xxxx-C` getrennt erhalten.
4. Bei Mibi oder Chemie eine Überschreitung setzen. Erwartung: Der Befund ist in
   der Historie sichtbar, verändert aber weder Legionellen-Turnus noch NU-Phase.
5. **Verlauf** öffnen und bei einem älteren echten Auftrag
   **Berichte bearbeiten** wählen. Erwartung: Auch historische Unterberichte
   lassen sich direkt korrigieren.
6. In Planung prüfen: Die Spalte **Prüfbericht** verwendet nun das zuletzt
   erfasste echte Prüfbericht-Datum, falls eines vorhanden ist.

## Aktuelles Update v3.11: Untersuchungsanteile ergänzen

Vor dem Test der neuen Schaltfläche **Auftragsbuch → Anteil** einmal den
vollständigen Inhalt von
`supabase/migrations/0028_unterauftraege_nachtraeglich_ergaenzen.sql`
im Supabase SQL-Editor ausführen.

Danach:

1. Einen bestehenden Legionellenauftrag im Auftragsbuch öffnen.
2. **Anteil** anklicken und Mibi auswählen.
3. Erwartung: Aus `26-0087` wird für den ergänzten Anteil `26-0087-M`.
   Die Hauptnummer `26-0087` bleibt unverändert und der Jahreszähler wird nicht erhöht.
4. Über **Bericht** für Legionellen und Mibi getrennte Befunde erfassen.
5. Erneut **Anteil** öffnen: Mibi wird nicht mehr angeboten und kann nicht doppelt
   angelegt werden. Chemie bleibt als `26-0087-C` ergänzbar.

## Update v3.12: Mehrfachauswahl, Storno und Löschen

Anschließend den vollständigen Inhalt von
`supabase/migrations/0029_unterauftraege_storno_loeschen_und_altinfo.sql`
im SQL-Editor ausführen.

Test:

1. Beim Nacherfassen Legionellen und Mibi gleichzeitig auswählen.
2. Erwartung: eine neue Hauptnummer für Legionellen und derselbe Auftrag mit `-M`.
3. Den Mibi-Unterbericht über das Zahnrad mit „dezentral“, „nicht möglich“ oder
   „abgesagt“ stornieren.
4. Erwartung: Der Unterbericht bleibt sichtbar, wird aber bei der Berichtserfassung
   nicht mehr als offener Befund behandelt.
5. Einen vollständig leeren `-M`- oder `-C`-Unterbericht über das Zahnrad löschen.
   Sobald Proben oder Bewertungen vorhanden sind, muss die Datenbank das Löschen ablehnen.

## 1. Git aktualisieren

1. Die ZIP-Datei entpacken.
2. Den **Inhalt** in den bestehenden Ordner der Termindatenbank im Git-Projekt kopieren und gleichnamige Dateien ersetzen.
3. Die Datei `_quellcode/.env` aus deinem bestehenden Projekt behalten. Sie ist bewusst nicht Teil dieser ZIP.
4. Vor dem Commit prüfen, dass diese beiden neuen Dateien vorhanden sind:
   - `supabase/migrations/0013_fachlogik_historie_und_sichere_umstrukturierung.sql`
   - `FACHLOGIK_ANSATZ.md`
5. Committen und pushen. Die sichtbare Website ändert sich dadurch noch nicht, weil die neuen Eingabemasken erst im nächsten Schritt entstehen.

## 2. Datenbank im Testprojekt erweitern

1. Supabase öffnen → Projekt **kaffeetrinker80** → **SQL Editor** → **New query**.
2. Den vollständigen Inhalt von
   `supabase/migrations/0013_fachlogik_historie_und_sichere_umstrukturierung.sql`
   einfügen.
3. Auf **Run** klicken.
4. Es dürfen zwei neue Tabellen erscheinen:
   - `td_untersuchungsbewertungen`
   - `td_ueberschreitungsphasen`

Die Migration legt zunächst nur Struktur an. Bestehende Kunden, Anlagen, Bereiche,
Termine und Historien werden weder gelöscht noch umsortiert.

## 3. Kurzer Funktionstest im SQL Editor

Danach diese Abfrage ausführen. Sie muss die beiden Tabellen und die neue View
zurückgeben:

```sql
select table_name
from information_schema.tables
where table_schema = 'nova_termindatenbank_data'
  and table_name in ('td_untersuchungsbewertungen', 'td_ueberschreitungsphasen');

select table_name
from information_schema.views
where table_schema = 'nova_termindatenbank_data'
  and table_name = 'td_v_bereichshistorie';
```

## 4. Berichtserfassung / Historie testen

1. In „Planung“ den Reiter „Bericht offen“ öffnen.
2. Einen Auftrag öffnen und einen Prüfbericht rückwirkend erfassen.
3. Befund fachlich wählen:
   - „ohne Befund“
   - „Überschreitung“
   - „nicht auswertbar“
4. Danach den Verlauf der Anlage öffnen und prüfen, ob Bericht, Nachuntersuchungen und Phase sichtbar sind.

## 5. Stammdaten: bisherige Einzelkunden als Anlagen übernehmen

Für Fälle wie AWO:

1. Stammdaten öffnen.
2. Links „Übernehmen“ aktivieren.
3. Den künftigen Dachkunden mit dem Stern als Ziel markieren, z. B. „AWO Schwaben“.
4. Alle bisherigen Einzelkunden anhaken, z. B. „AWO Seniorenheim Aichach - Altbau“.
5. Ausführen.

Erwartung:

- Der Zielkunde bleibt links aktiv sichtbar.
- Die angehakten Quellkunden werden nicht gelöscht, sondern inaktiv archiviert.
- Unter dem Zielkunden erscheinen die Quellkunden rechts als Anlagen/Objekte.
- Bereiche, Termine, Aufträge und Historie bleiben an den übernommenen Anlagen erhalten.
- Bei einem Quellkunden mit genau einer Anlage wird der bisherige Kundenname zum neuen Anlagenname. Der alte Anlagenname wird in den Notizen dokumentiert.

## Was danach kommt

Danach bauen wir die noch feineren praktischen Teile darauf auf:

1. Bereiche noch flexibler zwischen Anlagen verschieben.
2. Echte Dubletten bewusst von „als Anlagen übernehmen“ trennen.
3. Überschreitungsdashboard optisch weiter an das Python-Dashboard angleichen.
# v3.15 – Probenahmebericht-Freigabe im Auftragsbuch

Die Migration `0031_probenahmebericht_freigabe.sql` ist im Supabase-Projekt
**kaffeetrinker80 bereits ausgeführt**. Dafür muss kein SQL mehr manuell gestartet
werden.

Kurztest:

1. Auftragsbuch öffnen.
2. Bei einer Hauptauftragsnummer die Checkbox in der Spalte **PN-Bericht** setzen.
3. Prüfen, dass dort **freigegeben** erscheint.
4. Falls der Auftrag Unterberichte wie `-M` oder `-C` besitzt: Dort muss
   **wie [Hauptnummer]** stehen; die Freigabe wird nicht doppelt gepflegt.
5. Im Filter **PN-Bericht** den Eintrag **Freigabe fehlt** wählen. Es dürfen nur
   Hauptaufträge ohne Freigabe mit ihren Unterberichten erscheinen.
6. Checkbox wieder abwählen und prüfen, dass der Auftrag erneut unter
   **Freigabe fehlt** erscheint.

Beim Setzen speichert die Datenbank zusätzlich Zeitpunkt und angemeldeten
Benutzer. Nico Schmid besitzt als aktiver Benutzer mit Rolle **Disposition**
bereits die nötige Berechtigung.
