-- Stabile Brücke für Historie nach Anlagen-Merges:
-- Wenn eine Alt-Anlage als Bereich in ein neues Objekt übernommen wird, merkt
-- sich diese Tabelle die alte Legacy-ID und den neuen Zielbereich. Spätere
-- Historie-Nachträge aus der JSON landen dadurch wieder am richtigen Bereich.

create table if not exists nova_termindatenbank_data.td_anlagen_merge_mapping (
  id uuid primary key default gen_random_uuid(),
  alte_anlage_id uuid,
  alte_legacy_id text,
  alter_name text not null,
  ziel_anlage_id uuid not null references nova_termindatenbank_data.td_anlagen(id) on delete cascade,
  ziel_bereich_id uuid not null references nova_termindatenbank_data.td_bereiche(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique nulls not distinct (alte_legacy_id, ziel_bereich_id)
);

alter table nova_termindatenbank_data.td_anlagen_merge_mapping enable row level security;

drop policy if exists anlagen_merge_mapping_read on nova_termindatenbank_data.td_anlagen_merge_mapping;
create policy anlagen_merge_mapping_read
on nova_termindatenbank_data.td_anlagen_merge_mapping
for select to authenticated
using (nova_termindatenbank_data.td_current_rolle() is not null);

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
  v_legacy text;
  v_ziel_name text;
  v_n int := 0;
  v_bereich uuid;
  v_bereich_count int;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  select name into v_ziel_name from nova_termindatenbank_data.td_anlagen where id = p_ziel;
  if v_ziel_name is null then raise exception 'Ziel-Anlage nicht gefunden.'; end if;
  if p_ziel = any(p_quellen) then raise exception 'Die Ziel-Anlage darf nicht gleichzeitig Quelle sein.'; end if;

  update nova_termindatenbank_data.td_bereiche
     set name = v_ziel_name,
         beschreibung = concat_ws(E'\n', nullif(beschreibung, ''),
           'Zielanlage beim Anlagen-Merge als eigener Untersuchungsbereich geführt: ' || v_ziel_name),
         legacy_quelle = coalesce(legacy_quelle, 'Anlagen-Zusammenführung')
   where anlage_id = p_ziel and name = 'Gesamtanlage';

  foreach q in array coalesce(p_quellen, array[]::uuid[]) loop
    select name, legacy_id into v_name, v_legacy
      from nova_termindatenbank_data.td_anlagen
     where id = q;
    if v_name is null then raise exception 'Quellanlage % nicht gefunden.', q; end if;

    select count(*) into v_bereich_count
      from nova_termindatenbank_data.td_bereiche
     where anlage_id = q;

    if v_bereich_count = 0 then
      insert into nova_termindatenbank_data.td_bereiche
        (anlage_id, name, beschreibung, legacy_id, legacy_quelle)
      values
        (p_ziel, v_name, 'Übernommen aus früherer Anlage: ' || v_name, v_legacy, 'Anlagen-Zusammenführung')
      returning id into v_bereich;
    elsif v_bereich_count = 1 then
      update nova_termindatenbank_data.td_bereiche
         set anlage_id = p_ziel,
             name = v_name,
             beschreibung = concat_ws(E'\n', nullif(beschreibung, ''),
               'Übernommen aus früherer Anlage: ' || v_name),
             legacy_id = coalesce(legacy_id, v_legacy),
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
             beschreibung = concat_ws(E'\n', nullif(beschreibung, ''),
               'Übernommen aus früherer Anlage: ' || v_name),
             legacy_id = coalesce(legacy_id, v_legacy),
             legacy_quelle = coalesce(legacy_quelle, 'Anlagen-Zusammenführung')
       where anlage_id = q;

      select id into v_bereich
        from nova_termindatenbank_data.td_bereiche
       where anlage_id = p_ziel
         and (name = v_name or name like v_name || ' – %')
       order by (name = v_name) desc, name
       limit 1;
    end if;

    insert into nova_termindatenbank_data.td_anlagen_merge_mapping
      (alte_anlage_id, alte_legacy_id, alter_name, ziel_anlage_id, ziel_bereich_id, created_by)
    values (q, v_legacy, v_name, p_ziel, v_bereich, auth.uid())
    on conflict do nothing;

    update nova_termindatenbank_data.td_termine
       set anlage_id = p_ziel,
           kunde_id = (select kunde_id from nova_termindatenbank_data.td_anlagen where id = p_ziel),
           bereich_id = coalesce(bereich_id, v_bereich)
     where anlage_id = q;

    insert into nova_termindatenbank_data.td_aenderungshistorie
      (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
    values ('td_anlagen', p_ziel, 'anlagen_zusammenfuehrung',
       v_name, 'als Untersuchungsbereich übernommen', auth.uid());

    delete from nova_termindatenbank_data.td_anlagen where id = q;
    v_n := v_n + 1;
  end loop;

  return format('%s Anlage(n) als Untersuchungsbereiche übernommen – Mapping und Historie erhalten.', v_n);
end;
$$;

create or replace function nova_termindatenbank_data.td_legacy_historie_nachtragen(
  p_termine jsonb
)
returns text
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  r jsonb;
  v_legacy text;
  v_anlage uuid;
  v_kunde uuid;
  v_bereich uuid;
  v_status nova_termindatenbank_data.td_terminstatus;
  v_ok int := 0;
  v_ohne int := 0;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  for r in select value from jsonb_array_elements(coalesce(p_termine, '[]'::jsonb)) loop
    v_legacy := r->>'anlage_legacy';

    select m.ziel_anlage_id, a.kunde_id, m.ziel_bereich_id
      into v_anlage, v_kunde, v_bereich
      from nova_termindatenbank_data.td_anlagen_merge_mapping m
      join nova_termindatenbank_data.td_anlagen a on a.id = m.ziel_anlage_id
     where m.alte_legacy_id = v_legacy
     order by m.created_at desc
     limit 1;

    if v_anlage is null then
      select a.id, a.kunde_id,
             case when count(b.id) = 1 then min(b.id) else null end
        into v_anlage, v_kunde, v_bereich
        from nova_termindatenbank_data.td_anlagen a
        left join nova_termindatenbank_data.td_bereiche b on b.anlage_id = a.id
       where a.legacy_id = v_legacy
       group by a.id, a.kunde_id
       limit 1;
    end if;

    if v_anlage is null then
      v_ohne := v_ohne + 1;
    else
      v_status := case when coalesce((r->>'geplant')::boolean, false)
        then 'geplant'::nova_termindatenbank_data.td_terminstatus
        else 'abgeschlossen'::nova_termindatenbank_data.td_terminstatus end;

      insert into nova_termindatenbank_data.td_termine
        (legacy_id, kunde_id, anlage_id, bereich_id, datum, status, notizen, legacy_quelle)
      values
        (r->>'legacy_id', v_kunde, v_anlage, v_bereich, (r->>'datum')::date, v_status,
         case when v_status = 'geplant' then 'Geplanter Termin aus Altbestand' else 'Historischer Termin aus Altbestand' end,
         'Terminverwaltung V4')
      on conflict (legacy_id) do update
        set kunde_id = excluded.kunde_id,
            anlage_id = excluded.anlage_id,
            bereich_id = coalesce(nova_termindatenbank_data.td_termine.bereich_id, excluded.bereich_id),
            datum = excluded.datum,
            status = excluded.status;
      v_ok := v_ok + 1;
    end if;
  end loop;

  return format('Historie nachgetragen: %s Termin(e). %s ohne passende Anlage/Mapping.', v_ok, v_ohne);
end;
$$;

revoke all on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) from public;
revoke all on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) from anon;
grant execute on function nova_termindatenbank_data.td_anlagen_zusammenfuehren(uuid, uuid[]) to authenticated;

revoke all on function nova_termindatenbank_data.td_legacy_historie_nachtragen(jsonb) from public;
revoke all on function nova_termindatenbank_data.td_legacy_historie_nachtragen(jsonb) from anon;
grant execute on function nova_termindatenbank_data.td_legacy_historie_nachtragen(jsonb) to authenticated;
