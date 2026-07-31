# NOVA Wasser – Trinkwasser-Untersuchungsverwaltung

Zentrale Anwendung für Terminplanung, Auftragsnummern, Auftragsbuch, Kalenderexport und Datenmigration der Trinkwasseruntersuchungen. Langfristiger Ersatz der bestehenden Einzeltools (Terminverwaltung V4, Überschreitungs-Dashboard).

## Stack

- **Frontend:** React + TypeScript + Vite (deutsch, Desktop-first, mobilfähig)
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security)
- Keine Passwörter oder Nutzer im Frontend-Code – Anmeldung ausschließlich über Supabase Auth.

## Schnellstart

```bash
npm install
npm run dev        # startet im Demo-Modus (ohne Supabase, In-Memory-Beispieldaten)
```

## Supabase verbinden

Bereits erledigt für das Projekt **kaffeetrinker80** (`avuimpwjslrgpdahyloa`):
Alle vier Migrationen sind live, `.env` ist mit den echten Zugangsdaten befüllt.
Alle Tabellen/Views/Funktionen liegen in einem **eigenen Schema `nova_termindatenbank_data`**
(nicht in `public`) und tragen zusätzlich das Präfix **`td_`**
(z. B. `nova_termindatenbank_data.td_kunden`, `…td_termine`, `…td_auftraege`).
In der Tabellenübersicht von Supabase Studio erscheint das als eigener Baum
„nova_termindatenbank_data" mit den `td_`-Tabellen darunter – sauber getrennt von
euren anderen NOVA-Tools. Migration `0003` schaltet dieses Schema zusätzlich für die
Programmierschnittstelle (Data API) frei; normalerweise ein manueller Dashboard-Schritt,
hier per SQL erledigt (`alter role authenticator set pgrst.db_schemas = '…'`).

Für ein neues/anderes Projekt so vorgehen:
1. Supabase-Projekt anlegen (EU-Region empfohlen).
2. Migrationen ausführen (Supabase CLI oder SQL-Editor, in dieser Reihenfolge):
   - `supabase/migrations/0001_init.sql` – Schema, Datenmodell, Auftragsnummern-Vergabe, RLS, Audit, Historie
   - `supabase/migrations/0002_security_hardening.sql` – View-/Funktions-Härtung
   - `supabase/migrations/0003_grants_und_api_freischaltung.sql` – Rechte + Schema-Freischaltung für die API
   - `supabase/migrations/0004_sample_data.sql` – Beispieldaten (optional)
3. `.env` anlegen (siehe `.env.example`) mit `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`
   (den **publishable/anon**-Key verwenden – der ist fürs Frontend gedacht, nie den `service_role`-Key hier eintragen).
   Der Supabase-Client im Code ist fest auf das Schema `nova_termindatenbank_data` eingestellt
   (`src/lib/data.ts`, `db: { schema: 'nova_termindatenbank_data' }`) – bei einem anderen Schemanamen dort anpassen.
4. Ersten Benutzer über Supabase Auth registrieren, danach in der Tabelle
   `nova_termindatenbank_data.td_profile` die Rolle auf `admin` setzen.

**Beispieldaten entfernen** vor Produktivbetrieb: `scripts/remove_sample_data.sql` (alle Demo-Datensätze sind mit `legacy_quelle = 'DEMO'` markiert; der Nummernzähler wird bewusst nicht zurückgesetzt).

## Datenmodell (Kette)

```
Kunde → Anlage/Objekt → Untersuchungsbereich (WWB) → Auftrag (26-0897) → Unterauftrag (26-0897-M) → Probe → Ergebnisparameter
                                    ↘ Termin (mehrere Bereiche/Aufträge je Termin)
```

- **Auftragsnummern** im Format `YY-NNNN`, jahresweise ab 0001, zentral über die
  Postgres-Funktion `naechste_auftragsnummer()` vergeben – niemals wiederverwendet.
- **Ein Auftrag = genau ein Untersuchungsbereich.** Mehrere WW-Systeme einer Anlage
  erhalten eigene Hauptnummern (z. B. Haus 3–5 = 26-0897, Haus 7 = 26-0898).
- **Fälligkeit, Turnus, Probenumfang und Historie werden je Bereich/WWB geführt.**
  Bei mehreren Bereichen gibt es bewusst keine fachlich irreführende Gesamt-Historie
  und keine Anlagen-Fälligkeit.
- **Unteraufträge** je Untersuchungsart mit eigenem Status, Umfang (Mibi: Standard /
  Komplett / inklusive Enterokokken / Freitext), Probenzahlen und Ergebnisstatus –
  eine Überschreitung betrifft nur den jeweiligen Unterauftrag.
- **Bereiche können aufgeteilt werden** (`abgespalten_von`), falls sich vor Ort zeigt,
  dass ein Objekt mehrere Systeme hat.

## Live-Betrieb über GitHub Pages

Ziel-Adresse: **https://kaffeetrinker80.github.io/NOVA/termindatenbank/**

Euer Repo liefert GitHub Pages direkt aus dem `main`-Branch aus (Settings → Pages →
„Deploy from a branch" → `main` / `root`) — genau wie bei den anderen NOVA-Tools.
Deshalb liegt im Ordner `termindatenbank/` direkt die **fertig gebaute** Version
(`index.html`, `assets/`, `nova_logo.png`), kein Build-Schritt und kein
GitHub-Actions-Workflow nötig. Der Quellcode zum Weiterentwickeln liegt daneben in
`termindatenbank/_quellcode/` (siehe `_quellcode/LIESMICH.md` für den Ablauf bei
künftigen Änderungen).

Einfach den kompletten Inhalt dieses Ordners hochladen/committen, fertig.

## Anmeldung

Anmeldung läuft per **E-Mail + Passwort** über Supabase Auth (wie beim Sondertermine-Tool).
Neue Nutzer bekommen beim ersten Anlegen in Supabase Auth automatisch ein Profil mit der
Rolle „Lesend" und müssen von einem Admin in der Tabelle `td_profile` hochgestuft werden
(Feld `rolle`: `admin` / `disposition` / `probenehmer` / `lesend`). Bereits vor dieser App
angelegte Auth-Nutzer brauchen ein einmaliges manuelles Nachziehen des Profils
(siehe `scripts/backfill_profiles.sql`).

## Rollen & Sicherheit

| Rolle | Rechte |
|---|---|
| admin | alles inkl. Benutzerverwaltung und Löschen |
| disposition | Kunden, Termine, Aufträge, Exporte, Importe anlegen/bearbeiten |
| probenehmer | zugewiesene Termine sehen, Proben/Ist-Zahlen der eigenen Aufträge erfassen |
| lesend | nur lesen |

Durchgesetzt per Row Level Security in `0001_init.sql`. Audit-Felder (`created_/updated_ at/by`) auf allen Kerntabellen; kritische Änderungen (Auftragsnummer, Termin, Ergebnis) zusätzlich in `aenderungshistorie`.

## Migration

- Legacy-JSON (z. B. `Terminverwaltung_V4.json`) wird über **Import & Migration** in die
  Tabelle `staging_import` geladen, dort geprüft und erst dann übernommen.
- `legacy_id` / `legacy_quelle` bleiben auf allen Zieltabellen erhalten.
- Übernahme je Datensatz, inkrementell und über die Staging-Referenz rückholbar.
- Historische Daten werden nie gelöscht oder stillschweigend verändert.

## Kalenderexport

Titel-Format: `Probenahme Nr. 26-0616 – 09:30 Uhr bis 14:00 Uhr – Straßbergerstr. 11–47, München, Augusta`.
Beschreibung enthält Kunde (lang/kurz), Adresse, alle Bereiche mit Auftragsnummern, geplante Untersuchungsarten inkl. Umfangshinweis (z. B. „MIBI inklusive Enterokokken“), Probenzahlen und Hinweise. Ausgabe als kopierbarer Text und ICS-Download für Outlook.

## Projektstruktur

```
supabase/migrations/   SQL-Migrationen (Schema, RLS, Beispieldaten)
scripts/               Wartungsskripte (Demo-Daten entfernen)
src/lib/               Datenzugriff (Supabase + Demo-Fallback), Typen, ICS-Erzeugung
src/pages/             Dashboard, Termine, Auftragsbuch, Kunden, Anlagen,
                       Bereiche, Kalenderexport, Auswertungen, Import, Administration
```

## Nächste Schritte (vorbereitet, noch nicht ausgebaut)

- Ergebnisparameter/Grenzwerte je Probe (`ergebnis_parameter` vorhanden)
- Übernahme-Assistent Staging → Live mit Feld-Mapping
- Auswertungen der Überschreitungsphasen wie im bisherigen Dashboard
- Probenehmer-Ansicht für mobil (Terminliste + Ist-Erfassung)

## Fachlogik-Ansatz (neu)

Der erste umsetzbare Stand für Prüfberichte, Überschreitungen,
Nachuntersuchungen und sichere Bereichs-Umstrukturierungen liegt in
[`FACHLOGIK_ANSATZ.md`](FACHLOGIK_ANSATZ.md). Die zugehörige Migration
`supabase/migrations/0013_fachlogik_historie_und_sichere_umstrukturierung.sql`
ist im Testprojekt bereits ausgeführt.
Die darauf folgende Korrektur
`supabase/migrations/0014_berichtserfassung_audit_und_nacherfassung.sql`
ist ebenfalls bereits ausgeführt; sie erlaubt die revisionssichere
Berichtserfassung, ohne Schreibzugriff auf die Änderungshistorie freizugeben.
Die Erweiterung
`supabase/migrations/0020_fachlogik_bereich_bericht_import.sql`
ergänzt die fachliche Untersuchungsart, Folgeentscheidung, Sonderturnus-Felder,
den eindeutigen Bereichsimport und den eigenen Hausverwaltungswechsel. Sie ist
im verbundenen Testprojekt ebenfalls ausgeführt.
Migration
`supabase/migrations/0021_bereichshistorie_standardleistungen_loeschen.sql`
ergänzt die direkt bearbeitbare Alt-Historie, Standard-Leistungsarten je Bereich
und das doppelt bestätigte, transaktionale Löschen eines Bereichs. Sie ist im
verbundenen Testprojekt ebenfalls ausgeführt.

Migration
`supabase/migrations/0028_unterauftraege_nachtraeglich_ergaenzen.sql`
ergänzt bestehende Hauptaufträge nachträglich um Legionellen, Mibi oder Chemie,
ohne eine neue laufende Auftragsnummer zu verbrauchen. Vor dem Einsatz der
zugehörigen Schaltfläche **Anteil** muss diese Migration einmal im Supabase
SQL-Editor ausgeführt werden.

Migration
`supabase/migrations/0029_unterauftraege_storno_loeschen_und_altinfo.sql`
ergänzt nachvollziehbare Stornogründe, das geschützte Löschen noch leerer
Unterberichte sowie die Bereinigung des rein technischen Hinweises
„Aus Altbestand eindeutig übernommen“.

Im Frontend ist damit folgender Ablauf vorbereitet:

- Nach einem vergangenen Termin erscheint ein Auftrag automatisch unter
  **Planung → Bericht offen**, solange mindestens ein Unterauftrag noch offen ist.
- Bereits vorhandene Termine – auch historische Übernahmen ohne Nummer – können
  über **Auftragsbuch → Auftrag / Auftragsnummer nacherfassen** einem Bereich
  zugeordnet werden. Danach steht die Berichtserfassung unmittelbar bereit.
- Im Prüfbericht kann der Befund **sauber**, **Überschreitung** oder
  **Verkeimung** fachlich getrennt erfasst werden.
- Eine Überschreitungsphase wird bewusst eröffnet. Nach Maßnahmenabschluss zählen
  nur ausdrücklich markierte saubere Nachuntersuchungen; drei davon schließen die
  Phase regulär. Eine dokumentierte Freigabe des Gesundheitsamts kann den
  Regelturnus früher wiederherstellen.
- Ein bereits geplanter Termin nimmt den zugehörigen Bereich aus der Fälligkeitenliste. Das
  Ausblenden einer Anlage setzt dagegen ausschließlich den Betreuungsstatus
  **inaktiv** – für Objekte, die nicht mehr von euch untersucht werden.

Für die sichere Ausführung im bestehenden Testprojekt siehe
[`SUPABASE_TESTSCHRITTE.md`](SUPABASE_TESTSCHRITTE.md).
