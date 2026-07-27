# NOVAplan – Testschritte für diesen Ansatz

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
