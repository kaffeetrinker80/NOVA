-- ============================================================
-- Migration 0002: Beispieldaten (vor Produktivbetrieb entfernbar)
-- Alle Datensätze sind mit legacy_quelle = 'DEMO' markiert.
-- Entfernen: scripts/remove_sample_data.sql
-- ============================================================

insert into public.kunden (id, name_lang, name_kurz, typ, strasse, plz, ort, telefon, email, legacy_quelle) values
  ('a0000000-0000-0000-0000-000000000001','Augusta Hausverwaltung GmbH & Co. KG','Augusta','hausverwaltung','Maximilianstr. 12','86150','Augsburg','0821 123456','info@augusta-hv.de','DEMO'),
  ('a0000000-0000-0000-0000-000000000002','AIC-Hausverwaltung GmbH','AIC','hausverwaltung','Ludwigstr. 3','86551','Aichach','08251 998877','kontakt@aic-hv.de','DEMO'),
  ('a0000000-0000-0000-0000-000000000003','Familie Weber','Weber','privatkunde','Am Kirchberg 7','86453','Dasing',null,'weber@example.de','DEMO');

insert into public.anlagen (id, kunde_id, name, strasse, plz, ort, turnus_monate, naechste_untersuchung, legacy_quelle) values
  ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Straßbergerstr. 11–47','Straßbergerstr. 11–47','80809','München',36,'2026-08-15','DEMO'),
  ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','Auf dem Kreuz 4–8, 6a–c','Auf dem Kreuz 4–8','86152','Augsburg',36,'2027-08-12','DEMO'),
  ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000003','Einfamilienhaus Weber','Am Kirchberg 7','86453','Dasing',36,'2026-10-01','DEMO');

insert into public.bereiche (id, anlage_id, name, beschreibung, legacy_quelle) values
  ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Haus 3–5','WW-System Häuser 3 bis 5','DEMO'),
  ('c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','Haus 7','Eigenständiges WW-System Haus 7','DEMO'),
  ('c0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000002','Hauptgebäude',null,'DEMO'),
  ('c0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000003','Wohnhaus','Privatkunde, ein WW-System','DEMO');

insert into public.termine (id, kunde_id, anlage_id, datum, beginn, ende, status, legacy_quelle) values
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','2026-08-04','09:30','14:00','bestaetigt','DEMO'),
  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','2026-08-11','08:00','09:30','geplant','DEMO');

-- Zähler so setzen, dass Demo-Nummern zur Historie passen
insert into public.auftragsnummern_zaehler (jahr, letzter_wert) values (2026, 898)
  on conflict (jahr) do update set letzter_wert = greatest(public.auftragsnummern_zaehler.letzter_wert, 898);

insert into public.auftraege (id, auftragsnummer, jahr, bereich_id, termin_id, legacy_quelle) values
  ('e0000000-0000-0000-0000-000000000001','26-0897',2026,'c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','DEMO'),
  ('e0000000-0000-0000-0000-000000000002','26-0898',2026,'c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001','DEMO');

insert into public.unterauftraege (auftrag_id, suffix, art, umfang, proben_geplant) values
  ('e0000000-0000-0000-0000-000000000001','','legionellen',null,14),
  ('e0000000-0000-0000-0000-000000000001','M','mibi','inklusive Enterokokken',3),
  ('e0000000-0000-0000-0000-000000000002','','legionellen',null,6);
