-- Korrektur zur Anlagen-Zusammenführung:
-- Eine Quell-Anlage wird als genau ein Untersuchungsbereich übernommen und
-- behält zuerst ihren bisherigen Anlagen-Namen. "Gesamtanlage" wird dabei nicht
-- mehr als zusätzlicher Bereichstitel erzeugt, wenn die Quelle nur einen
-- Standardbereich hatte.

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
  v_bereich_count int;
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

    select count(*) into v_bereich_count
      from nova_termindatenbank_data.td_bereiche
     where anlage_id = q;

    if v_bereich_count = 0 then
      insert into nova_termindatenbank_data.td_bereiche
        (anlage_id, name, beschreibung, legacy_quelle)
      values
        (p_ziel, v_name, 'Übernommen aus früherer Anlage: ' || v_name, 'Anlagen-Zusammenführung')
      returning id into v_bereich;
    elsif v_bereich_count = 1 then
      update nova_termindatenbank_data.td_bereiche
         set anlage_id = p_ziel,
             name = v_name,
             beschreibung = concat_ws(E'\n',
               nullif(beschreibung, ''),
               'Übernommen aus früherer Anlage: ' || v_name
             ),
             legacy_quelle = coalesce(legacy_quelle, 'Anlagen-Zusammenführung')
       where anlage_id = q
       returning id into v_bereich;
    else
      update nova_termindatenbank_data.td_bereiche
         set anlage_id = p_ziel,
             name = case
               when name = 'Gesamtanlage' then v_name
               when name like v_name || ' – %' then name
               else v_name || ' – ' || name
             end,
             beschreibung = concat_ws(E'\n',
               nullif(beschreibung, ''),
               'Übernommen aus früherer Anlage: ' || v_name
             ),
             legacy_quelle = coalesce(legacy_quelle, 'Anlagen-Zusammenführung')
       where anlage_id = q;

      select id into v_bereich
        from nova_termindatenbank_data.td_bereiche
       where anlage_id = p_ziel
         and (name = v_name or name like v_name || ' – %')
       order by (name = v_name) desc, name
       limit 1;
    end if;

    update nova_termindatenbank_data.td_termine
       set anlage_id = p_ziel,
           bereich_id = coalesce(bereich_id, v_bereich)
     where anlage_id = q;

    insert into nova_termindatenbank_data.td_aenderungshistorie
      (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
    values
      ('td_anlagen', p_ziel, 'anlagen_zusammenfuehrung',
       v_name, 'als Untersuchungsbereich übernommen', auth.uid());

    delete from nova_termindatenbank_data.td_anlagen where id = q;
    v_n := v_n + 1;
  end loop;

  return format('%s Anlage(n) als Untersuchungsbereiche übernommen – bisherige Anlagennamen und Historie erhalten.', v_n);
end;
$$;

-- Bereits mit der Zwischenversion entstandene Titel bereinigen.
update nova_termindatenbank_data.td_bereiche
   set name = regexp_replace(name, ' – Gesamtanlage$', '')
 where name like '% – Gesamtanlage'
   and (
     legacy_quelle = 'Anlagen-Zusammenführung'
     or coalesce(beschreibung, '') like '%Übernommen aus früherer Anlage:%'
   );

revoke all on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) from public;
revoke all on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) from anon;
grant execute on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) to authenticated;
