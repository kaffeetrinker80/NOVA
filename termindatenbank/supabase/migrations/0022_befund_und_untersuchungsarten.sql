-- ============================================================
-- NOVAplan – eindeutige Befunde und fachliche Untersuchungsarten
-- ============================================================

-- "Regeluntersuchung" war fachlich die orientierende Untersuchung.
-- Bestehende Werte werden deshalb verlustfrei vereinheitlicht.
alter table nova_termindatenbank_data.td_auftraege
  drop constraint if exists td_auftraege_fachliche_untersuchungsart_check;
alter table nova_termindatenbank_data.td_termine
  drop constraint if exists td_termine_fachliche_untersuchungsart_check;

update nova_termindatenbank_data.td_auftraege
   set fachliche_untersuchungsart = 'orientierend'
 where fachliche_untersuchungsart = 'regeluntersuchung';
update nova_termindatenbank_data.td_termine
   set fachliche_untersuchungsart = 'orientierend'
 where fachliche_untersuchungsart = 'regeluntersuchung';

alter table nova_termindatenbank_data.td_auftraege
  add constraint td_auftraege_fachliche_untersuchungsart_check
  check (fachliche_untersuchungsart in (
    'orientierend', 'weitergehend', 'nachuntersuchung', 'nichtamtliche_eigenprobe'
  ));
alter table nova_termindatenbank_data.td_termine
  add constraint td_termine_fachliche_untersuchungsart_check
  check (fachliche_untersuchungsart in (
    'orientierend', 'weitergehend', 'nachuntersuchung', 'nichtamtliche_eigenprobe'
  ));

-- In der Arbeitsoberfläche gibt es nur drei eindeutige Befundzustände.
-- Frühere Verkeimungen sind fachlich Überschreitungen; "nicht bewertbar"
-- wird wieder als ungeklärt/nicht erfasst geführt.
alter table nova_termindatenbank_data.td_termine
  drop constraint if exists td_termine_befund_check;
alter table nova_termindatenbank_data.td_untersuchungsbewertungen
  drop constraint if exists td_untersuchungsbewertungen_befund_check;

update nova_termindatenbank_data.td_termine
   set befund = case
     when befund = 'verkeimung' then 'ueberschreitung'
     when befund = 'nicht_bewertbar' then 'offen'
     else befund
   end
 where befund in ('verkeimung', 'nicht_bewertbar');
update nova_termindatenbank_data.td_untersuchungsbewertungen
   set befund = case
     when befund = 'verkeimung' then 'ueberschreitung'
     when befund = 'nicht_bewertbar' then 'offen'
     else befund
   end
 where befund in ('verkeimung', 'nicht_bewertbar');

alter table nova_termindatenbank_data.td_termine
  add constraint td_termine_befund_check
  check (befund in ('offen', 'sauber', 'ueberschreitung'));
alter table nova_termindatenbank_data.td_untersuchungsbewertungen
  add constraint td_untersuchungsbewertungen_befund_check
  check (befund in ('offen', 'sauber', 'ueberschreitung'));
