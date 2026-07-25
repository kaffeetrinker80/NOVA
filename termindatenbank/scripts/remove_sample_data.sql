-- Entfernt alle Beispieldaten (legacy_quelle = 'DEMO') vor dem Produktivbetrieb.
-- Reihenfolge beachtet Fremdschlüssel; Unteraufträge/Proben fallen per ON DELETE CASCADE.
begin;
delete from public.auftraege  where legacy_quelle = 'DEMO';
delete from public.termine    where legacy_quelle = 'DEMO';
delete from public.bereiche   where legacy_quelle = 'DEMO';
delete from public.anlagen    where legacy_quelle = 'DEMO';
delete from public.kunden     where legacy_quelle = 'DEMO';
-- Zähler NICHT zurücksetzen: vergebene Nummern dürfen nie wiederverwendet werden.
commit;
