# NOVAplan – erster Fachlogik-Ansatz

## Was dieser Ansatz konkret ergänzt

Die Migration `0013_fachlogik_historie_und_sichere_umstrukturierung.sql` ist ein **Aufbau** auf der bestehenden Datenbank. Sie entfernt keine historischen Daten und verändert keine vorhandenen Auftragsnummern.

### 1. Untersuchungsbereich wird fachlich führend

Ein Bereich/WWB erhält künftig seinen eigenen Regelturnus (1 oder 3 Jahre), seine nächste Untersuchung, einen Planungsvermerk und einen Betreuungsstatus.

`nicht_mehr_unser_kunde` ist dabei etwas völlig anderes als geplant oder pausiert:

| Zustand | Wirkung in der Planung |
|---|---|
| Aktiv | erscheint nach Fälligkeit |
| Aktiv + konkreter Termin / Planungsvermerk | erscheint unter „Geplant“, nicht als offen |
| Pausiert | vorübergehend aus der normalen Fälligkeit |
| Nicht mehr unser Kunde | dauerhaft ausgeblendet, aber vollständig erhalten |

### 2. Prüfbericht und Befund sind ausdrücklich gespeichert

Für jeden Unterauftrag gibt es eine Bewertung mit Prüfbericht-Status, Berichtnummer, Datum und Befund:

- offen
- sauber
- Überschreitung
- Verkeimung
- nicht bewertbar

Damit wird ein grüner Haken in der Übersicht später aus einem echten Befund gebildet – nicht aus einem geschätzten Abstand.

### 3. Überschreitungsphase als eigener Vorgang

Eine Phase wird bei Überschreitung/Verkeimung/bördlicher Anordnung eröffnet. Darin stehen Maßnahmenabschluss, Standard „3 saubere Nachuntersuchungen“, Gesundheitsamt-Freigabe und der Abschluss.

Der Regelturnus darf erst zurückkehren, wenn entweder die geforderte Zahl sauberer NUs erreicht ist oder das Gesundheitsamt ihn ausdrücklich bestätigt. Das alte Intervall-Dashboard bleibt für Altbestände nützlich, wird aber nicht mehr zur einzigen fachlichen Wahrheit.

### 4. Zentrale Bereichshistorie

Die View `td_v_bereichshistorie` kombiniert abgeschlossene Untersuchungen, Ergebnisse und Phasen in einer Zeitlinie. Geplante Termine zählen bewusst nicht als Untersuchung und verfälschen daher weder Historie noch Jahresstatistik.

### 5. AWO und andere Umstrukturierungen

Bereiche können künftig verschoben oder zusammengeführt werden. Quellbereiche werden dabei archiviert statt gelöscht. Aufträge, Unteraufträge, Prüfberichte, Bewertungen und Phasen behalten ihre IDs.

Beispiel:

1. Einzelne AWO-„Kunden“ zuerst in `AWO Schwaben` zusammenführen.
2. Die daraus entstehenden Objekte als Anlagen führen.
3. Altbau und Neubau, die zum selben Objekt gehören, als Bereiche unter einer Anlage zusammenführen oder verschieben.
4. Erst danach den jeweiligen Bereichsturnus und die historische Zuordnung prüfen.

## Bewusste Übergangsregel

Die bestehenden Felder an `td_anlagen` bleiben zunächst aktiv. Erst wenn die alten Daten sorgfältig auf Bereiche aufgeteilt sind, sollte die Planung schrittweise ausschließlich aus den Bereichsfeldern arbeiten. So wird keine alte Historie „automatisch geraten“ oder überschrieben.

## Noch nicht in diesem ersten Ansatz

- Maßnahmenabschluss und GA-Freigabe als eigene Eingabemasken
- geführter Assistent für die Zuordnung alter Termine zu Altbau/Neubau
- Bereichsbasierte Planungsansicht und neue Jahresstatistik
- Testdaten und Migration der produktiven Daten

## Bereits als erste Bedienoberfläche umgesetzt

Im Auftragsbuch öffnet der Button **„Bericht“** jetzt die erweiterte Maske
„Prüfbericht & Befund". Dort werden Prüfberichtnummer, Berichtdatum, Befund und
Ist-Proben je Unterauftrag erfasst. Bei **sauber** kann der Befund ausdrücklich
als saubere Nachuntersuchung einer offenen Phase zugeordnet werden. Bei
**Überschreitung** oder **Verkeimung** kann gezielt eine neue Phase für genau
diesen Untersuchungsbereich eröffnet werden.

Diese Schritte sollten erst nach einer Testausführung der neuen Migration auf einer Kopie erfolgen.

## Erweiterung 0020

Die Migration `0020_fachlogik_bereich_bericht_import.sql` und der zugehörige
Frontend-Stand ergänzen:

- fachliche Untersuchungsart je Auftrag: orientierend, Regeluntersuchung,
  weitergehende Untersuchung oder Nachuntersuchung
- Folgeentscheidung getrennt vom Befund
- Verkeimung als eigener auswählbarer Befund
- Turnus, Sonderturnus/behördliche Grundlage, nächste Untersuchung und
  Probenanzahl direkt am Bereich/WWB
- direkte Berichtserfassung und Phasenverwaltung aus der geöffneten
  Bereichskachel
- Hausverwaltungswechsel als eigene transaktionale Aktion; die Anlage behält
  ihre ID und damit alle Bereiche, Aufträge, Berichte und Phasen

Der Legacy-Import enthält die Verwaltung nun bewusst in der stabilen
Anlagenkennung. Gleich adressierte Zeilen wie „AWO Seniorenheim Aichach –
Altbau“ und „… – Neubau“ werden dadurch nicht mehr vorzeitig zusammengeworfen.
Jeder importierte Termin erhält sofort eine eindeutige Bereichs-ID.

Wichtig: Ein mit einem älteren Frontend bereits zusammengeworfener Altbestand
kann ohne die ursprüngliche JSON-Zeilenherkunft nicht sicher wieder getrennt
werden. Dafür ist nach Bereitstellung dieses Stands ein erneuter Reset/Neuimport
mit derselben Original-JSON erforderlich.
