-- ============================================================
-- NOVAplan – Anlage, Bereiche und bekannte Historie atomar anlegen
-- ============================================================

create or replace function nova_termindatenbank_data.td_anlage_mit_bereichen_anlegen(
  p_kunde uuid,
  p_anlage jsonb,
  p_bereiche jsonb
)
returns uuid
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_anlage uuid;
  v_bereich uuid;
  v_zeile jsonb;
  v_letzte_untersuchung date;
  v_naechste_untersuchung date;
  v_turnus integer;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;
  if nullif(trim(p_anlage->>'name'), '') is null then
    raise exception 'Der Anlagen-/Objektname fehlt.';
  end if;
  if not exists (
    select 1 from nova_termindatenbank_data.td_kunden where id = p_kunde and aktiv
  ) then
    raise exception 'Der gewählte Kunde ist nicht aktiv oder nicht vorhanden.';
  end if;
  if jsonb_typeof(p_bereiche) <> 'array' or jsonb_array_length(p_bereiche) < 1 then
    raise exception 'Mindestens ein Bereich/WWB ist erforderlich.';
  end if;

  insert into nova_termindatenbank_data.td_anlagen
    (kunde_id, name, strasse, plz, ort, notizen)
  values
    (p_kunde, trim(p_anlage->>'name'), nullif(trim(p_anlage->>'strasse'), ''),
     nullif(trim(p_anlage->>'plz'), ''), nullif(trim(p_anlage->>'ort'), ''),
     nullif(trim(p_anlage->>'notizen'), ''))
  returning id into v_anlage;

  for v_zeile in select value from jsonb_array_elements(p_bereiche)
  loop
    if nullif(trim(v_zeile->>'name'), '') is null then
      raise exception 'Ein Bereichsname fehlt.';
    end if;

    v_turnus := nullif(v_zeile->>'turnus_monate', '')::integer;
    v_letzte_untersuchung := coalesce(
      nullif(v_zeile->>'letzte_untersuchung', '')::date,
      nullif(v_zeile->>'pruefbericht_datum', '')::date - 14
    );
    v_naechste_untersuchung := coalesce(
      nullif(v_zeile->>'naechste_untersuchung', '')::date,
      case when v_letzte_untersuchung is not null and v_turnus is not null
        then (v_letzte_untersuchung + make_interval(months => v_turnus))::date
      end
    );

    insert into nova_termindatenbank_data.td_bereiche
      (anlage_id, name, turnus_monate, turnus_art, naechste_untersuchung,
       proben_anzahl, standard_legionellen, standard_mibi,
       standard_mibi_umfang, standard_chemie, notizen)
    values
      (v_anlage, trim(v_zeile->>'name'), v_turnus, 'regelturnus',
       v_naechste_untersuchung, nullif(v_zeile->>'proben_anzahl', '')::integer,
       coalesce((v_zeile->>'standard_legionellen')::boolean, true),
       coalesce((v_zeile->>'standard_mibi')::boolean, false),
       coalesce(nullif(v_zeile->>'standard_mibi_umfang', ''), 'Standard'),
       coalesce((v_zeile->>'standard_chemie')::boolean, false),
       nullif(trim(v_zeile->>'notizen'), ''))
    returning id into v_bereich;

    if v_letzte_untersuchung is not null then
      insert into nova_termindatenbank_data.td_termine
        (kunde_id, anlage_id, bereich_id, datum, status, notizen,
         fachliche_untersuchungsart, historie_einordnung, befund,
         pruefbericht_nummer, pruefbericht_datum, historie_bemerkung)
      values
        (p_kunde, v_anlage, v_bereich, v_letzte_untersuchung, 'abgeschlossen',
         'Bei Neuanlage als bekannte Historie erfasst',
         coalesce(nullif(v_zeile->>'fachliche_untersuchungsart', ''), 'orientierend'),
         'regulaer',
         coalesce(nullif(v_zeile->>'befund', ''), 'offen'),
         nullif(trim(v_zeile->>'pruefbericht_nummer'), ''),
         nullif(v_zeile->>'pruefbericht_datum', '')::date,
         case
           when nullif(v_zeile->>'pruefbericht_datum', '') is not null
             and nullif(v_zeile->>'letzte_untersuchung', '') is null
           then 'Untersuchungsdatum aus Prüfberichtdatum minus 14 Tage geschätzt'
           else null
         end);
    end if;
  end loop;

  return v_anlage;
end;
$$;

revoke all on function nova_termindatenbank_data.td_anlage_mit_bereichen_anlegen(uuid, jsonb, jsonb) from public;
revoke all on function nova_termindatenbank_data.td_anlage_mit_bereichen_anlegen(uuid, jsonb, jsonb) from anon;
grant execute on function nova_termindatenbank_data.td_anlage_mit_bereichen_anlegen(uuid, jsonb, jsonb) to authenticated;
