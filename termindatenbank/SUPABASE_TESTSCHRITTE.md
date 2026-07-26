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

## Was danach kommt

Danach bauen wir im Frontend die drei praktischen Teile darauf auf:

1. Prüfbericht erfassen: sauber / Überschreitung / Verkeimung.
2. Überschreitungsphase starten und die Nachuntersuchungen zählen.
3. Stammdaten umbauen: Bereiche verschieben, zusammenführen oder archivieren – zuerst am AWO-Testfall.
