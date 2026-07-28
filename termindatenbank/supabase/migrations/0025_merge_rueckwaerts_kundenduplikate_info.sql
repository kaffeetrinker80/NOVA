-- ============================================================
-- NOVAplan – Merge rückwärts, leere Kunden löschen,
-- Kundenduplikate verhindern und Infofeld von Merge-Texten trennen
-- ============================================================

create or replace function nova_termindatenbank_data.td_text_ohne_merge_hinweise(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(string_agg(btrim(z.zeile), E'\n' order by z.nr), '')
  from regexp_split_to_table(coalesce(p_text, ''), E'\\r?\\n') with ordinality as z(zeile, nr)
  where btrim(z.zeile) <> ''
    and btrim(z.zeile) !~ '^(Früherer Anlagenname vor Übernahme:|Aus bisherigem Einzelkunden übernommen:|Aus Anlagen-Merge erstellt:)'
$$;

alter table nova_termindatenbank_data.td_anlagen
  add column if not exists info text;

-- Bereits erzeugte technische Hinweise aus dem sichtbaren Infofeld entfernen.
-- Eigene Texte wie "Umzug Frühjahr 2026" bleiben erhalten.
update nova_termindatenbank_data.td_anlagen
   set notizen = nova_termindatenbank_data.td_text_ohne_merge_hinweise(notizen)
 where coalesce(notizen, '') ~
   '(^|\\n)(Früherer Anlagenname vor Übernahme:|Aus bisherigem Einzelkunden übernommen:|Aus Anlagen-Merge erstellt:)';

-- Der bislang in der Planung sichtbare freie Objekttext wird einmalig in das
-- neue gemeinsame Infofeld übernommen. Zugang/Notizen bleiben separat erhalten.
update nova_termindatenbank_data.td_anlagen
   set info = nova_termindatenbank_data.td_text_ohne_merge_hinweise(notizen)
 where info is null
   and nova_termindatenbank_data.td_text_ohne_merge_hinweise(notizen) is not null;

-- Neue aktive Kunden mit demselben Namen künftig verhindern, ohne die bereits
-- vorhandenen Dubletten beim Einspielen dieser Migration zu blockieren.
create or replace function nova_termindatenbank_data.td_kundenname_duplikat_sperren()
returns trigger
language plpgsql
set search_path = nova_termindatenbank_data, pg_catalog
as $$
begin
  if new.aktiv and exists (
    select 1
      from nova_termindatenbank_data.td_kunden k
     where k.id <> new.id
       and k.aktiv
       and lower(regexp_replace(btrim(k.name_lang), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(new.name_lang), '\s+', ' ', 'g'))
  ) then
    raise exception 'Ein aktiver Kunde mit diesem Namen ist bereits vorhanden.';
  end if;
  return new;
end;
$$;

drop trigger if exists td_kundenname_duplikat_sperren_trigger
  on nova_termindatenbank_data.td_kunden;
create trigger td_kundenname_duplikat_sperren_trigger
before insert or update of name_lang, aktiv
on nova_termindatenbank_data.td_kunden
for each row execute function nova_termindatenbank_data.td_kundenname_duplikat_sperren();

create or replace function nova_termindatenbank_data.td_kunde_sicher_loeschen(
  p_kunde uuid,
  p_bestaetigung text
)
returns jsonb
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_name text;
  v_anlagen integer;
  v_termine integer;
  v_ansprechpartner integer;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_bestaetigung <> 'KUNDE LÖSCHEN' then
    raise exception 'Löschen wurde nicht eindeutig bestätigt.';
  end if;

  select name_lang into v_name
    from nova_termindatenbank_data.td_kunden
   where id = p_kunde
   for update;
  if v_name is null then raise exception 'Kunde nicht gefunden.'; end if;

  select count(*) into v_anlagen
    from nova_termindatenbank_data.td_anlagen where kunde_id = p_kunde;
  select count(*) into v_termine
    from nova_termindatenbank_data.td_termine where kunde_id = p_kunde;
  select count(*) into v_ansprechpartner
    from nova_termindatenbank_data.td_ansprechpartner where kunde_id = p_kunde;

  if v_anlagen > 0 or v_termine > 0 then
    raise exception
      'Kunde kann noch nicht gelöscht werden: % Anlage(n), % Termin(e). Anlagen zuerst verschieben oder löschen.',
      v_anlagen, v_termine;
  end if;

  delete from nova_termindatenbank_data.td_kunden where id = p_kunde;

  insert into nova_termindatenbank_data.td_aenderungshistorie
    (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
  values ('td_kunden', p_kunde, 'kunde_geloescht', v_name,
          'dauerhaft gelöscht; ' || v_ansprechpartner || ' Ansprechpartner mitgelöscht', auth.uid());

  return jsonb_build_object(
    'name', v_name, 'ansprechpartner', v_ansprechpartner
  );
end;
$$;

-- Eine beim Kunden-Merge verschobene Anlage wieder als eigener Kunde führen.
-- Wenn der archivierte Ursprungskunde aus der Änderungshistorie noch existiert,
-- wird genau dieser reaktiviert; andernfalls wird ein neuer Kunde angelegt.
create or replace function nova_termindatenbank_data.td_anlage_als_kunde_herausloesen(
  p_anlage uuid,
  p_name_lang text,
  p_name_kurz text default null
)
returns jsonb
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_anlage_name text;
  v_aktueller_kunde uuid;
  v_zielkunde uuid;
  v_zielname text;
  v_reaktiviert boolean := false;
  v_treffer integer;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;
  if nullif(btrim(p_name_lang), '') is null then
    raise exception 'Der Name des herausgelösten Kunden fehlt.';
  end if;

  select name, kunde_id into v_anlage_name, v_aktueller_kunde
    from nova_termindatenbank_data.td_anlagen
   where id = p_anlage
   for update;
  if v_anlage_name is null then raise exception 'Anlage nicht gefunden.'; end if;

  -- Zuerst den echten archivierten Ursprung aus dem Kunden-Merge verwenden.
  select substring(h.alter_wert from
      '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})')::uuid
    into v_zielkunde
    from nova_termindatenbank_data.td_aenderungshistorie h
   where h.tabelle = 'td_anlagen'
     and h.datensatz_id = p_anlage
     and h.feld = 'kunde_als_anlage_uebernommen'
   order by h.geaendert_am desc
   limit 1;

  if v_zielkunde is not null
     and exists (select 1 from nova_termindatenbank_data.td_kunden where id = v_zielkunde)
  then
    update nova_termindatenbank_data.td_kunden
       set aktiv = true,
           name_lang = btrim(p_name_lang),
           name_kurz = coalesce(nullif(btrim(p_name_kurz), ''), name_kurz)
     where id = v_zielkunde;
    v_reaktiviert := true;
  else
    v_zielkunde := null;

    select count(*)
      into v_treffer
      from nova_termindatenbank_data.td_kunden
     where aktiv
       and lower(regexp_replace(btrim(name_lang), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(p_name_lang), '\s+', ' ', 'g'));

    if v_treffer > 1 then
      raise exception 'Mehrere aktive Kunden mit diesem Namen vorhanden. Bitte zuerst die Dublette bereinigen.';
    elsif v_treffer = 1 then
      select id, name_lang into v_zielkunde, v_zielname
        from nova_termindatenbank_data.td_kunden
       where aktiv
         and lower(regexp_replace(btrim(name_lang), '\s+', ' ', 'g'))
           = lower(regexp_replace(btrim(p_name_lang), '\s+', ' ', 'g'))
       limit 1;
    elsif v_treffer = 0 then
      select id into v_zielkunde
        from nova_termindatenbank_data.td_kunden
       where not aktiv
         and lower(regexp_replace(btrim(name_lang), '\s+', ' ', 'g'))
           = lower(regexp_replace(btrim(p_name_lang), '\s+', ' ', 'g'))
       order by created_at desc
       limit 1;
      if v_zielkunde is not null then
        update nova_termindatenbank_data.td_kunden
           set aktiv = true, name_kurz = coalesce(nullif(btrim(p_name_kurz), ''), name_kurz)
         where id = v_zielkunde;
        v_reaktiviert := true;
      else
        insert into nova_termindatenbank_data.td_kunden
          (name_lang, name_kurz, typ)
        values
          (btrim(p_name_lang), coalesce(btrim(p_name_kurz), ''), 'sonstige')
        returning id into v_zielkunde;
      end if;
    end if;
  end if;

  if v_zielkunde = v_aktueller_kunde then
    raise exception 'Die Anlage gehört bereits zu diesem Kunden.';
  end if;

  update nova_termindatenbank_data.td_anlagen
     set kunde_id = v_zielkunde,
         notizen = nova_termindatenbank_data.td_text_ohne_merge_hinweise(notizen)
   where id = p_anlage;
  update nova_termindatenbank_data.td_termine
     set kunde_id = v_zielkunde
   where anlage_id = p_anlage;

  select name_lang into v_zielname
    from nova_termindatenbank_data.td_kunden where id = v_zielkunde;

  insert into nova_termindatenbank_data.td_aenderungshistorie
    (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
  values ('td_anlagen', p_anlage, 'anlage_als_kunde_herausgeloest',
          v_aktueller_kunde::text, v_zielkunde::text || ' / ' || v_zielname, auth.uid());

  return jsonb_build_object(
    'kunde_id', v_zielkunde, 'kunde_name', v_zielname,
    'anlage_name', v_anlage_name, 'reaktiviert', v_reaktiviert
  );
end;
$$;

-- Gegenstück zum Anlagen-Merge: einen Bereich samt kompletter Historie
-- wieder als eigenständige Anlage unter demselben Kunden führen.
create or replace function nova_termindatenbank_data.td_bereich_als_anlage_herausloesen(
  p_bereich uuid,
  p_anlagenname text
)
returns jsonb
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_altanlage uuid;
  v_neuanlage uuid;
  v_kunde uuid;
  v_bereichname text;
  v_strasse text;
  v_plz text;
  v_ort text;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;
  if nullif(btrim(p_anlagenname), '') is null then
    raise exception 'Der Name der neuen Anlage fehlt.';
  end if;

  select b.anlage_id, b.name, a.kunde_id, a.strasse, a.plz, a.ort
    into v_altanlage, v_bereichname, v_kunde, v_strasse, v_plz, v_ort
    from nova_termindatenbank_data.td_bereiche b
    join nova_termindatenbank_data.td_anlagen a on a.id = b.anlage_id
   where b.id = p_bereich
   for update of b;
  if v_altanlage is null then raise exception 'Bereich nicht gefunden.'; end if;

  insert into nova_termindatenbank_data.td_anlagen
    (kunde_id, name, strasse, plz, ort)
  values
    (v_kunde, btrim(p_anlagenname), v_strasse, v_plz, v_ort)
  returning id into v_neuanlage;

  update nova_termindatenbank_data.td_bereiche
     set anlage_id = v_neuanlage
   where id = p_bereich;
  update nova_termindatenbank_data.td_termine
     set anlage_id = v_neuanlage
   where bereich_id = p_bereich;

  insert into nova_termindatenbank_data.td_aenderungshistorie
    (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
  values ('td_bereiche', p_bereich, 'bereich_als_anlage_herausgeloest',
          v_altanlage::text, v_neuanlage::text || ' / ' || btrim(p_anlagenname), auth.uid());

  return jsonb_build_object(
    'anlage_id', v_neuanlage, 'anlage_name', btrim(p_anlagenname),
    'bereich_name', v_bereichname
  );
end;
$$;

-- Kunden-Merge künftig ohne technische Herkunftstexte im sichtbaren Infofeld.
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
  if p_ziel is null or not exists (
    select 1 from nova_termindatenbank_data.td_kunden where id = p_ziel
  ) then raise exception 'Zielkunde nicht gefunden.'; end if;
  if p_ziel = any(p_quellen) then
    raise exception 'Der Zielkunde darf nicht gleichzeitig Quelle sein.';
  end if;

  foreach q in array coalesce(p_quellen, array[]::uuid[]) loop
    select name_lang, nullif(name_kurz, '')
      into v_quellname, v_quellkurz
      from nova_termindatenbank_data.td_kunden where id = q;
    if v_quellname is null then raise exception 'Quellkunde % nicht gefunden.', q; end if;

    select count(*) into v_anlagen_je_quelle
      from nova_termindatenbank_data.td_anlagen where kunde_id = q;

    if v_anlagen_je_quelle = 0 then
      insert into nova_termindatenbank_data.td_anlagen
        (kunde_id, name, legacy_quelle)
      values (p_ziel, v_quellname, 'Kunden-als-Anlagen-Übernahme');
      v_anlagen := v_anlagen + 1;
    end if;

    for v_anlage in
      select * from nova_termindatenbank_data.td_anlagen
       where kunde_id = q order by name
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
             notizen = nova_termindatenbank_data.td_text_ohne_merge_hinweise(v_anlage.notizen),
             legacy_quelle = coalesce(v_anlage.legacy_quelle, 'Kunden-als-Anlagen-Übernahme')
       where id = v_anlage.id;
      update nova_termindatenbank_data.td_termine
         set kunde_id = p_ziel where anlage_id = v_anlage.id;

      insert into nova_termindatenbank_data.td_aenderungshistorie
        (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values ('td_anlagen', v_anlage.id, 'kunde_als_anlage_uebernommen',
              q::text || ' / ' || v_quellname || ' / Anlage: ' || coalesce(v_altname, '–'),
              p_ziel::text || ' / Anlage: ' || v_neuer_name, auth.uid());
      v_anlagen := v_anlagen + 1;
    end loop;

    update nova_termindatenbank_data.td_ansprechpartner set kunde_id = p_ziel where kunde_id = q;
    update nova_termindatenbank_data.td_kunden
       set aktiv = false where id = q;

    insert into nova_termindatenbank_data.td_aenderungshistorie
      (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
    values ('td_kunden', p_ziel, 'kunden_als_anlagen_uebernommen',
            coalesce(v_quellkurz || ' / ', '') || v_quellname,
            'als Anlage(n) unter Zielkunde übernommen; Quellkunde archiviert', auth.uid());
    v_quellen := v_quellen + 1;
  end loop;

  return format('%s bisherige Kunde(n) als %s Anlage(n)/Objekt(e) übernommen. Quellkunden wurden nur inaktiv archiviert.',
    v_quellen, v_anlagen);
end;
$$;

revoke all on function nova_termindatenbank_data.td_text_ohne_merge_hinweise(text) from public;
revoke all on function nova_termindatenbank_data.td_text_ohne_merge_hinweise(text) from anon;
revoke all on function nova_termindatenbank_data.td_kunde_sicher_loeschen(uuid, text) from public;
revoke all on function nova_termindatenbank_data.td_kunde_sicher_loeschen(uuid, text) from anon;
grant execute on function nova_termindatenbank_data.td_kunde_sicher_loeschen(uuid, text) to authenticated;
revoke all on function nova_termindatenbank_data.td_anlage_als_kunde_herausloesen(uuid, text, text) from public;
revoke all on function nova_termindatenbank_data.td_anlage_als_kunde_herausloesen(uuid, text, text) from anon;
grant execute on function nova_termindatenbank_data.td_anlage_als_kunde_herausloesen(uuid, text, text) to authenticated;
revoke all on function nova_termindatenbank_data.td_bereich_als_anlage_herausloesen(uuid, text) from public;
revoke all on function nova_termindatenbank_data.td_bereich_als_anlage_herausloesen(uuid, text) from anon;
grant execute on function nova_termindatenbank_data.td_bereich_als_anlage_herausloesen(uuid, text) to authenticated;
revoke all on function nova_termindatenbank_data.td_kunden_als_anlagen_uebernehmen(uuid, uuid[]) from public;
revoke all on function nova_termindatenbank_data.td_kunden_als_anlagen_uebernehmen(uuid, uuid[]) from anon;
grant execute on function nova_termindatenbank_data.td_kunden_als_anlagen_uebernehmen(uuid, uuid[]) to authenticated;
