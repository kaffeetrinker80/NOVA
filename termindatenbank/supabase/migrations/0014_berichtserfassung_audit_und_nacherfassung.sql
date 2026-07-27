-- Berichtserfassung darf Ergebnisänderungen revisionssicher protokollieren.
--
-- Der Trigger auf td_unterauftraege schreibt in td_aenderungshistorie. Diese
-- Tabelle bleibt absichtlich nur lesbar; der Trigger bekommt deshalb die eng
-- begrenzte Berechtigung zum Schreiben. Direkte API-INSERTs bleiben durch RLS
-- weiterhin verboten.

create or replace function nova_termindatenbank_data.td_log_kritische_aenderungen()
returns trigger
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
begin
  if tg_table_name = 'td_auftraege' then
    if old.auftragsnummer is distinct from new.auftragsnummer then
      insert into nova_termindatenbank_data.td_aenderungshistorie(tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values ('td_auftraege', new.id, 'auftragsnummer', old.auftragsnummer, new.auftragsnummer, auth.uid());
    end if;
  elsif tg_table_name = 'td_termine' then
    if old.datum is distinct from new.datum or old.status is distinct from new.status then
      insert into nova_termindatenbank_data.td_aenderungshistorie(tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values ('td_termine', new.id, 'datum/status',
              old.datum::text || ' / ' || old.status::text,
              new.datum::text || ' / ' || new.status::text, auth.uid());
    end if;
  elsif tg_table_name = 'td_unterauftraege' then
    if old.ergebnis is distinct from new.ergebnis then
      insert into nova_termindatenbank_data.td_aenderungshistorie(tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values ('td_unterauftraege', new.id, 'ergebnis', old.ergebnis::text, new.ergebnis::text, auth.uid());
    end if;
  end if;
  return new;
end
$$;

-- Trigger-Funktionen sind nicht als API-Funktion gedacht.
revoke all on function nova_termindatenbank_data.td_log_kritische_aenderungen() from public;
revoke all on function nova_termindatenbank_data.td_log_kritische_aenderungen() from anon, authenticated;
