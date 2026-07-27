-- Fachlicher Stammdaten-Move:
-- Mehrere bisher einzeln importierte "Kunden" werden unter einem Dachkunden
-- als Anlagen/Objekte sichtbar weitergeführt. Historie bleibt an Anlage/Bereich/
-- Termin/Auftrag erhalten; Quellkunden werden nur inaktiv archiviert.

create or replace function nova_termindatenbank_data.td_kunden_als_anlagen_uebernehmen(
  p_ziel uuid,
  p_quellen uuid[]
)
returns text
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  q uuid;
  v_quellname text;
  v_quellkurz text;
  v_anlage record;
  v_anlagen_je_quelle int;
  v_quellen int := 0;
  v_anlagen int := 0;
  v_altname text;
  v_neuer_name text;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  if p_ziel is null or not exists (select 1 from nova_termindatenbank_data.td_kunden where id = p_ziel) then
    raise exception 'Zielkunde nicht gefunden.';
  end if;

  if p_ziel = any(p_quellen) then
    raise exception 'Der Zielkunde darf nicht gleichzeitig Quelle sein.';
  end if;

  foreach q in array coalesce(p_quellen, array[]::uuid[]) loop
    select name_lang, nullif(name_kurz, '')
      into v_quellname, v_quellkurz
      from nova_termindatenbank_data.td_kunden
     where id = q;

    if v_quellname is null then
      raise exception 'Quellkunde % nicht gefunden.', q;
    end if;

    select count(*) into v_anlagen_je_quelle
      from nova_termindatenbank_data.td_anlagen
     where kunde_id = q;

    -- Falls ein Quellkunde versehentlich ohne Anlage existiert, wird ein leeres
    -- Objekt angelegt, damit der Name nicht verloren geht.
    if v_anlagen_je_quelle = 0 then
      insert into nova_termindatenbank_data.td_anlagen
        (kunde_id, name, notizen, legacy_quelle)
      values
        (p_ziel, v_quellname, 'Aus bisherigem Einzelkunden übernommen: ' || v_quellname, 'Kunden-als-Anlagen-Übernahme');
      v_anlagen := v_anlagen + 1;
    end if;

    for v_anlage in
      select *
        from nova_termindatenbank_data.td_anlagen
       where kunde_id = q
       order by name
    loop
      v_altname := v_anlage.name;
      v_neuer_name := case
        when v_anlagen_je_quelle <= 1 then v_quellname
        when v_anlage.name is null or btrim(v_anlage.name) = '' then v_quellname
        when v_anlage.name = v_quellname then v_quellname
        else v_quellname || ' – ' || v_anlage.name
      end;

      update nova_termindatenbank_data.td_anlagen
         set kunde_id = p_ziel,
             name = v_neuer_name,
             notizen = concat_ws(E'\n',
               nullif(v_anlage.notizen, ''),
               case when v_altname is distinct from v_neuer_name
                    then 'Früherer Anlagenname vor Übernahme: ' || coalesce(v_altname, '–')
                    else null end,
               'Aus bisherigem Einzelkunden übernommen: ' || v_quellname
             ),
             legacy_quelle = coalesce(v_anlage.legacy_quelle, 'Kunden-als-Anlagen-Übernahme')
       where id = v_anlage.id;

      update nova_termindatenbank_data.td_termine
         set kunde_id = p_ziel
       where anlage_id = v_anlage.id;

      insert into nova_termindatenbank_data.td_aenderungshistorie
        (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values
        ('td_anlagen', v_anlage.id, 'kunde_als_anlage_uebernommen',
         q::text || ' / ' || v_quellname || ' / Anlage: ' || coalesce(v_altname, '–'),
         p_ziel::text || ' / Anlage: ' || v_neuer_name,
         auth.uid());

      v_anlagen := v_anlagen + 1;
    end loop;

    update nova_termindatenbank_data.td_ansprechpartner
       set kunde_id = p_ziel,
           notizen = concat_ws(E'\n', nullif(notizen, ''), 'Übernommen aus bisherigem Einzelkunden: ' || v_quellname)
     where kunde_id = q;

    update nova_termindatenbank_data.td_kunden
       set aktiv = false,
           notizen = concat_ws(E'\n',
             nullif(notizen, ''),
             'Archiviert: als Anlage/Objekt unter Zielkunde übernommen am ' || current_date::text
           )
     where id = q;

    insert into nova_termindatenbank_data.td_aenderungshistorie
      (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
    values
      ('td_kunden', p_ziel, 'kunden_als_anlagen_uebernommen',
       coalesce(v_quellkurz || ' / ', '') || v_quellname,
       'als Anlage(n) unter Zielkunde übernommen; Quellkunde archiviert',
       auth.uid());

    v_quellen := v_quellen + 1;
  end loop;

  return format('%s bisherige Kunde(n) als %s Anlage(n)/Objekt(e) übernommen. Quellkunden wurden nur inaktiv archiviert.', v_quellen, v_anlagen);
end;
$$;

revoke all on function nova_termindatenbank_data.td_kunden_als_anlagen_uebernehmen(uuid, uuid[]) from public;
revoke all on function nova_termindatenbank_data.td_kunden_als_anlagen_uebernehmen(uuid, uuid[]) from anon;
grant execute on function nova_termindatenbank_data.td_kunden_als_anlagen_uebernehmen(uuid, uuid[]) to authenticated;
