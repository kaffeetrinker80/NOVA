-- ============================================================
-- NOVAplan – Bereiche robust und komplette Anlagen sicher löschen
-- ============================================================

create or replace function nova_termindatenbank_data.td_bereich_sicher_loeschen(
  p_bereich uuid,
  p_bestaetigung text
)
returns jsonb
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_name text;
  v_termine integer;
  v_auftraege integer;
  v_phasen integer;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_bestaetigung <> 'BEREICH LÖSCHEN' then
    raise exception 'Löschen wurde nicht eindeutig bestätigt.';
  end if;

  select name into v_name
    from nova_termindatenbank_data.td_bereiche
   where id = p_bereich
   for update;
  if v_name is null then raise exception 'Bereich nicht gefunden.'; end if;

  select count(*) into v_termine
    from nova_termindatenbank_data.td_termine where bereich_id = p_bereich;
  select count(*) into v_auftraege
    from nova_termindatenbank_data.td_auftraege where bereich_id = p_bereich;
  select count(*) into v_phasen
    from nova_termindatenbank_data.td_ueberschreitungsphasen where bereich_id = p_bereich;

  update nova_termindatenbank_data.td_untersuchungsbewertungen
     set phase_id = null
   where phase_id in (
     select id from nova_termindatenbank_data.td_ueberschreitungsphasen
      where bereich_id = p_bereich
   );
  update nova_termindatenbank_data.td_ueberschreitungsphasen
     set ausloesende_bewertung_id = null
   where bereich_id = p_bereich;

  delete from nova_termindatenbank_data.td_untersuchungsbewertungen
   where unterauftrag_id in (
     select u.id
       from nova_termindatenbank_data.td_unterauftraege u
       join nova_termindatenbank_data.td_auftraege a on a.id = u.auftrag_id
      where a.bereich_id = p_bereich
   );
  delete from nova_termindatenbank_data.td_ueberschreitungsphasen
   where bereich_id = p_bereich;
  delete from nova_termindatenbank_data.td_auftraege
   where bereich_id = p_bereich;
  delete from nova_termindatenbank_data.td_termine
   where bereich_id = p_bereich;

  update nova_termindatenbank_data.td_bereiche
     set abgespalten_von = null
   where abgespalten_von = p_bereich;

  -- Je nach Import-/Migrationsstand kann eine Mapping-Tabelle vorhanden sein
  -- oder fehlen. Dynamisches SQL verhindert den bisherigen Relationsfehler.
  if to_regclass('nova_termindatenbank_data.td_anlagen_merge_mapping') is not null then
    execute 'delete from nova_termindatenbank_data.td_anlagen_merge_mapping
              where ziel_bereich_id = $1' using p_bereich;
  end if;
  if to_regclass('nova_termindatenbank_data.td_merge_bereich_mapping') is not null then
    execute 'delete from nova_termindatenbank_data.td_merge_bereich_mapping
              where ziel_bereich_id = $1' using p_bereich;
  end if;

  delete from nova_termindatenbank_data.td_bereiche where id = p_bereich;

  insert into nova_termindatenbank_data.td_aenderungshistorie
    (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
  values
    ('td_bereiche', p_bereich, 'bereich_geloescht',
     v_name || format(' (%s Termine, %s Aufträge, %s Phasen)',
       v_termine, v_auftraege, v_phasen),
     'dauerhaft gelöscht', auth.uid());

  return jsonb_build_object(
    'name', v_name, 'termine', v_termine,
    'auftraege', v_auftraege, 'phasen', v_phasen
  );
end;
$$;

create or replace function nova_termindatenbank_data.td_anlage_sicher_loeschen(
  p_anlage uuid,
  p_bestaetigung text
)
returns jsonb
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_name text;
  v_bereiche uuid[];
  v_bereich_anzahl integer;
  v_termine integer;
  v_auftraege integer;
  v_phasen integer;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_bestaetigung <> 'ANLAGE LÖSCHEN' then
    raise exception 'Löschen wurde nicht eindeutig bestätigt.';
  end if;

  select name into v_name
    from nova_termindatenbank_data.td_anlagen
   where id = p_anlage
   for update;
  if v_name is null then raise exception 'Anlage nicht gefunden.'; end if;

  select coalesce(array_agg(id), array[]::uuid[]), count(*)
    into v_bereiche, v_bereich_anzahl
    from nova_termindatenbank_data.td_bereiche
   where anlage_id = p_anlage;

  select count(*) into v_termine
    from nova_termindatenbank_data.td_termine
   where anlage_id = p_anlage or bereich_id = any(v_bereiche);
  select count(*) into v_auftraege
    from nova_termindatenbank_data.td_auftraege
   where bereich_id = any(v_bereiche);
  select count(*) into v_phasen
    from nova_termindatenbank_data.td_ueberschreitungsphasen
   where bereich_id = any(v_bereiche);

  update nova_termindatenbank_data.td_untersuchungsbewertungen
     set phase_id = null
   where phase_id in (
     select id from nova_termindatenbank_data.td_ueberschreitungsphasen
      where bereich_id = any(v_bereiche)
   );
  update nova_termindatenbank_data.td_ueberschreitungsphasen
     set ausloesende_bewertung_id = null
   where bereich_id = any(v_bereiche);

  delete from nova_termindatenbank_data.td_untersuchungsbewertungen
   where unterauftrag_id in (
     select u.id
       from nova_termindatenbank_data.td_unterauftraege u
       join nova_termindatenbank_data.td_auftraege a on a.id = u.auftrag_id
      where a.bereich_id = any(v_bereiche)
   );
  delete from nova_termindatenbank_data.td_ueberschreitungsphasen
   where bereich_id = any(v_bereiche);
  delete from nova_termindatenbank_data.td_auftraege
   where bereich_id = any(v_bereiche);
  delete from nova_termindatenbank_data.td_termine
   where anlage_id = p_anlage or bereich_id = any(v_bereiche);

  update nova_termindatenbank_data.td_bereiche
     set abgespalten_von = null
   where abgespalten_von = any(v_bereiche)
     and not (id = any(v_bereiche));

  if to_regclass('nova_termindatenbank_data.td_anlagen_merge_mapping') is not null then
    execute 'delete from nova_termindatenbank_data.td_anlagen_merge_mapping
              where ziel_anlage_id = $1 or ziel_bereich_id = any($2)'
      using p_anlage, v_bereiche;
  end if;
  if to_regclass('nova_termindatenbank_data.td_merge_bereich_mapping') is not null then
    execute 'delete from nova_termindatenbank_data.td_merge_bereich_mapping
              where ziel_bereich_id = any($1)' using v_bereiche;
  end if;

  delete from nova_termindatenbank_data.td_bereiche
   where anlage_id = p_anlage;
  delete from nova_termindatenbank_data.td_anlagen
   where id = p_anlage;

  insert into nova_termindatenbank_data.td_aenderungshistorie
    (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
  values
    ('td_anlagen', p_anlage, 'anlage_geloescht',
     v_name || format(' (%s Bereiche, %s Termine, %s Aufträge, %s Phasen)',
       v_bereich_anzahl, v_termine, v_auftraege, v_phasen),
     'dauerhaft gelöscht', auth.uid());

  return jsonb_build_object(
    'name', v_name, 'bereiche', v_bereich_anzahl, 'termine', v_termine,
    'auftraege', v_auftraege, 'phasen', v_phasen
  );
end;
$$;

revoke all on function nova_termindatenbank_data.td_bereich_sicher_loeschen(uuid, text) from public;
revoke all on function nova_termindatenbank_data.td_bereich_sicher_loeschen(uuid, text) from anon;
grant execute on function nova_termindatenbank_data.td_bereich_sicher_loeschen(uuid, text) to authenticated;

revoke all on function nova_termindatenbank_data.td_anlage_sicher_loeschen(uuid, text) from public;
revoke all on function nova_termindatenbank_data.td_anlage_sicher_loeschen(uuid, text) from anon;
grant execute on function nova_termindatenbank_data.td_anlage_sicher_loeschen(uuid, text) to authenticated;
