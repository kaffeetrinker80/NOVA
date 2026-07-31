-- NOVAplan – Untersuchungsanteile nachträglich zu einem bestehenden Auftrag ergänzen.
-- Die Hauptnummer bleibt bestehen. Nur der ergänzte Anteil erhält sein fachliches
-- Suffix (Mibi = -M, Chemie = -C). Es wird keine neue laufende Nummer verbraucht.

create or replace function nova_termindatenbank_data.td_unterauftrag_hinzufuegen(
  p_auftrag uuid,
  p_art nova_termindatenbank_data.td_untersuchungsart,
  p_umfang text default null,
  p_proben_geplant integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_id uuid;
  v_hauptnummer text;
  v_suffix text;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  if p_proben_geplant is not null and p_proben_geplant < 1 then
    raise exception 'Die geplante Probenzahl muss größer als 0 sein';
  end if;

  select auftragsnummer
    into v_hauptnummer
    from nova_termindatenbank_data.td_auftraege
   where id = p_auftrag
   for update;

  if v_hauptnummer is null then
    raise exception 'Auftrag nicht gefunden';
  end if;

  if exists (
    select 1
      from nova_termindatenbank_data.td_unterauftraege
     where auftrag_id = p_auftrag
       and art = p_art
  ) then
    raise exception 'Diese Untersuchungsart ist bei % bereits vorhanden', v_hauptnummer;
  end if;

  v_suffix := case p_art
    when 'legionellen' then
      case when exists (
        select 1 from nova_termindatenbank_data.td_unterauftraege
         where auftrag_id = p_auftrag and suffix = ''
      ) then 'L' else '' end
    when 'mibi' then 'M'
    when 'chemie' then 'C'
    when 'vorortparameter' then 'V'
    else 'S'
  end;

  if exists (
    select 1
      from nova_termindatenbank_data.td_unterauftraege
     where auftrag_id = p_auftrag
       and suffix = v_suffix
  ) then
    raise exception 'Das Suffix -% ist bei % bereits belegt', v_suffix, v_hauptnummer;
  end if;

  insert into nova_termindatenbank_data.td_unterauftraege (
    auftrag_id, suffix, art, umfang, proben_geplant
  )
  values (
    p_auftrag,
    v_suffix,
    p_art,
    nullif(btrim(p_umfang), ''),
    p_proben_geplant
  )
  returning id into v_id;

  insert into nova_termindatenbank_data.td_aenderungshistorie (
    tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von
  )
  values (
    'td_unterauftraege',
    v_id,
    'nachtraeglich_hinzugefuegt',
    null,
    p_art::text || case when v_suffix = '' then '' else ' / -' || v_suffix end,
    auth.uid()
  );

  return jsonb_build_object(
    'id', v_id,
    'suffix', v_suffix,
    'nummer', v_hauptnummer || case when v_suffix = '' then '' else '-' || v_suffix end
  );
end
$$;

revoke all on function nova_termindatenbank_data.td_unterauftrag_hinzufuegen(
  uuid, nova_termindatenbank_data.td_untersuchungsart, text, integer
) from public, anon;

grant execute on function nova_termindatenbank_data.td_unterauftrag_hinzufuegen(
  uuid, nova_termindatenbank_data.td_untersuchungsart, text, integer
) to authenticated;

