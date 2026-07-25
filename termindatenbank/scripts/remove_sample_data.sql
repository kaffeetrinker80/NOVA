-- Entfernt alle Beispieldaten (legacy_quelle = 'DEMO') vor dem Produktivbetrieb.
-- Reihenfolge beachtet Fremdschlüssel; Unteraufträge/Proben fallen per ON DELETE CASCADE.
begin;
delete from nova_termindatenbank_data.td_auftraege where legacy_quelle = 'DEMO';
delete from nova_termindatenbank_data.td_termine    where legacy_quelle = 'DEMO';
delete from nova_termindatenbank_data.td_bereiche   where legacy_quelle = 'DEMO';
delete from nova_termindatenbank_data.td_anlagen    where legacy_quelle = 'DEMO';
delete from nova_termindatenbank_data.td_kunden     where legacy_quelle = 'DEMO';
-- Zähler NICHT zurücksetzen: vergebene Nummern dürfen nie wiederverwendet werden.
commit;
