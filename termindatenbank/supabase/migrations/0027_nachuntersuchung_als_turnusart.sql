-- NOVAplan – Nachuntersuchung als eigener, bearbeitbarer Bereichsturnus.
-- Die UI setzt beim Wechsel zunächst drei Monate; Datum und Monate bleiben
-- anschließend für Maßnahmen oder behördliche Vorgaben frei anpassbar.

alter table nova_termindatenbank_data.td_bereiche
  drop constraint if exists td_bereiche_turnus_art_check;

alter table nova_termindatenbank_data.td_bereiche
  add constraint td_bereiche_turnus_art_check
  check (turnus_art in ('regelturnus', 'nachuntersuchung', 'sonderturnus', 'behoerdlich'));
