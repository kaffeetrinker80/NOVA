-- Anlagen zusammenführen, ohne die fachliche Herkunft der Untersuchungsbereiche
-- optisch/inhaltlich zu verlieren. Quellen werden weiterhin gelöscht, aber ihre
-- bisherigen Anlagennamen bleiben als Präfix im Bereichstitel erhalten.

create or replace function nova_termindatenbank_data.td_anlagen_zusammenfuehren(
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
  v_name text;
  v_n int := 0;
  v_bereich uuid;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  if p_ziel = any(p_quellen) then
    raise exception 'Die Ziel-Anlage darf nicht gleichzeitig Quelle sein.';
  end if;

  foreach q in array coalesce(p_quellen, array[]::uuid[]) loop
    select name into v_name
      from nova_termindatenbank_data.td_anlagen
     where id = q;

    if v_name is null then
      raise exception 'Quellanlage % nicht gefunden.', q;
    end if;

    -- Vorhandene Bereiche der Quelle wandern zum Ziel.
    -- Der bisherige Anlagenname bleibt als sichtbare Herkunft erhalten.
    update nova_termindatenbank_data.td_bereiche
       set anlage_id = p_ziel,
           name = case
             when name = 'Gesamtanlage' then v_name || ' – Gesamtanlage'
             when name like v_name || ' – %' then name
             else v_name || ' – ' || name
           end,
           beschreibung = concat_ws(E'\n',
             nullif(beschreibung, ''),
             'Übernommen aus früherer Anlage: ' || v_name
           ),
           legacy_quelle = coalesce(legacy_quelle, 'Anlagen-Zusammenführung')
     where anlage_id = q;

    -- Einen Herkunftsbereich ermitteln, dem alte Termine ohne Bereich zugeordnet werden.
    select id into v_bereich
      from nova_termindatenbank_data.td_bereiche
     where anlage_id = p_ziel
       and name like v_name || ' – %'
     order by (name = v_name || ' – Gesamtanlage') desc, name
     limit 1;

    if v_bereich is null then
      insert into nova_termindatenbank_data.td_bereiche
        (anlage_id, name, beschreibung, legacy_quelle)
      values
        (p_ziel, v_name || ' – Gesamtanlage', 'Übernommen aus früherer Anlage: ' || v_name, 'Anlagen-Zusammenführung')
      returning id into v_bereich;
    end if;

    update nova_termindatenbank_data.td_termine
       set anlage_id = p_ziel,
           bereich_id = coalesce(bereich_id, v_bereich)
     where anlage_id = q;

    insert into nova_termindatenbank_data.td_aenderungshistorie
      (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
    values
      ('td_anlagen', p_ziel, 'anlagen_zusammenfuehrung',
       v_name, 'als Untersuchungsbereich(e) übernommen', auth.uid());

    delete from nova_termindatenbank_data.td_anlagen where id = q;
    v_n := v_n + 1;
  end loop;

  return format('%s Anlage(n) als Untersuchungsbereiche übernommen – Herkunftstitel und Historie erhalten.', v_n);
end;
$$;

revoke all on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) from public;
revoke all on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) from anon;
grant execute on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) to authenticated;
