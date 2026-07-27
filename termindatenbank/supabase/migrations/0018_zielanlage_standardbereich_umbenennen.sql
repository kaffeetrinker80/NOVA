-- Ergänzung zur Anlagen-Zusammenführung:
-- Wenn die Zielanlage noch einen Standardbereich "Gesamtanlage" hat, wird dieser
-- beim Merge auf den Namen der Zielanlage umbenannt. So stehen nach Altbau/Neubau-
-- Zusammenführungen rechts direkt die bisherigen Anlagennamen als Bereiche.

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
  v_ziel_name text;
  v_n int := 0;
  v_bereich uuid;
  v_bereich_count int;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  select name into v_ziel_name
    from nova_termindatenbank_data.td_anlagen
   where id = p_ziel;

  if v_ziel_name is null then
    raise exception 'Ziel-Anlage nicht gefunden.';
  end if;

  if p_ziel = any(p_quellen) then
    raise exception 'Die Ziel-Anlage darf nicht gleichzeitig Quelle sein.';
  end if;

  update nova_termindatenbank_data.td_bereiche
     set name = v_ziel_name,
         beschreibung = concat_ws(E'\n',
           nullif(beschreibung, ''),
           'Zielanlage beim Anlagen-Merge als eigener Untersuchungsbereich geführt: ' || v_ziel_name
         ),
         legacy_quelle = coalesce(legacy_quelle, 'Anlagen-Zusammenführung')
   where anlage_id = p_ziel
     and name = 'Gesamtanlage';

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

-- Bereits entstandene Mehrbereich-Anlagen bereinigen:
-- Sobald es neben "Gesamtanlage" noch einen übernommenen Bereich gibt, bekommt
-- der Standardbereich den Namen der mittleren Zielanlage.
update nova_termindatenbank_data.td_bereiche b
   set name = a.name,
       beschreibung = concat_ws(E'\n',
         nullif(b.beschreibung, ''),
         'Zielanlage beim Anlagen-Merge als eigener Untersuchungsbereich geführt: ' || a.name
       ),
       legacy_quelle = coalesce(b.legacy_quelle, 'Anlagen-Zusammenführung')
  from nova_termindatenbank_data.td_anlagen a
 where b.anlage_id = a.id
   and b.name = 'Gesamtanlage'
   and exists (
     select 1
       from nova_termindatenbank_data.td_bereiche bx
      where bx.anlage_id = b.anlage_id
        and bx.id <> b.id
        and coalesce(bx.beschreibung, '') like '%Übernommen aus früherer Anlage:%'
   );

revoke all on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) from public;
revoke all on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) from anon;
grant execute on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) to authenticated;
