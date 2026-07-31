-- NOVAplan v3.21 – vollständiger Reset für die Alpha-/Testphase.
-- Benutzerprofile bleiben bestehen; sämtliche fachlichen und operativen Daten
-- einschließlich Auftragsnummernzähler werden auf Wunsch entfernt.

create or replace function nova_termindatenbank_data.td_reset_alle_daten(
  p_zaehler_zuruecksetzen boolean default false
)
returns text
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_kunden integer;
  v_anlagen integer;
  v_termine integer;
  v_auftraege integer;
  v_bewertungen integer;
  v_phasen integer;
begin
  if nova_termindatenbank_data.td_current_rolle() <> 'admin' then
    raise exception 'Nur Admins dürfen die Daten zurücksetzen.';
  end if;

  -- Bewertungen und Phasen verweisen gegenseitig aufeinander. Die auslösende
  -- Bewertung wird deshalb zuerst gelöst; danach können beide Tabellen sicher
  -- und vollständig geleert werden.
  update nova_termindatenbank_data.td_ueberschreitungsphasen
     set ausloesende_bewertung_id = null
   where ausloesende_bewertung_id is not null;

  delete from nova_termindatenbank_data.td_untersuchungsbewertungen where true;
  get diagnostics v_bewertungen = row_count;
  delete from nova_termindatenbank_data.td_ueberschreitungsphasen where true;
  get diagnostics v_phasen = row_count;

  delete from nova_termindatenbank_data.td_ergebnis_parameter where true;
  delete from nova_termindatenbank_data.td_proben where true;
  delete from nova_termindatenbank_data.td_unterauftraege where true;
  delete from nova_termindatenbank_data.td_auftraege where true;
  get diagnostics v_auftraege = row_count;
  delete from nova_termindatenbank_data.td_termin_probenehmer where true;
  delete from nova_termindatenbank_data.td_termine where true;
  get diagnostics v_termine = row_count;
  delete from nova_termindatenbank_data.td_bereiche where true;
  delete from nova_termindatenbank_data.td_anlagen where true;
  get diagnostics v_anlagen = row_count;
  delete from nova_termindatenbank_data.td_ansprechpartner where true;
  delete from nova_termindatenbank_data.td_kunden where true;
  get diagnostics v_kunden = row_count;
  delete from nova_termindatenbank_data.td_staging_import where true;
  delete from nova_termindatenbank_data.td_aenderungshistorie where true;

  if p_zaehler_zuruecksetzen then
    delete from nova_termindatenbank_data.td_auftragsnummern_zaehler where true;
  end if;

  return format(
    'Zurückgesetzt: %s Kunden, %s Anlagen, %s Termine, %s Aufträge, %s Berichte und %s Phasen.%s',
    v_kunden, v_anlagen, v_termine, v_auftraege, v_bewertungen, v_phasen,
    case when p_zaehler_zuruecksetzen then ' Das Auftragsbuch beginnt wieder bei 0001.' else '' end
  );
end;
$$;

revoke all on function nova_termindatenbank_data.td_reset_alle_daten(boolean) from public;
grant execute on function nova_termindatenbank_data.td_reset_alle_daten(boolean) to authenticated;
