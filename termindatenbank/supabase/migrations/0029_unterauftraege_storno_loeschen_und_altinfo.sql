-- NOVAplan – Unteraufträge stornieren/löschen und technischen Importhinweis bereinigen.

-- Der technische Satz hat keinen fachlichen Informationswert und soll weder
-- bei der Planung noch in den Stammdaten erscheinen.
update nova_termindatenbank_data.td_bereiche
   set beschreibung = null
 where btrim(beschreibung) = 'Aus Altbestand eindeutig übernommen';

alter table nova_termindatenbank_data.td_unterauftraege
  add column if not exists storno_grund text,
  add column if not exists storniert_am timestamptz,
  add column if not exists storniert_von uuid references auth.users(id);

alter table nova_termindatenbank_data.td_unterauftraege
  drop constraint if exists td_unterauftraege_storno_grund_check;

alter table nova_termindatenbank_data.td_unterauftraege
  add constraint td_unterauftraege_storno_grund_check
  check (storno_grund is null or storno_grund in ('dezentral', 'nicht_moeglich', 'absage'));

-- Änderungen an Status, Umfang und Probenzahlen ebenfalls revisionssicher erfassen.
create or replace function nova_termindatenbank_data.td_log_kritische_aenderungen()
returns trigger
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
begin
  if tg_table_name = 'td_auftraege' then
    if old.auftragsnummer is distinct from new.auftragsnummer then
      insert into nova_termindatenbank_data.td_aenderungshistorie
        (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values
        ('td_auftraege', new.id, 'auftragsnummer', old.auftragsnummer, new.auftragsnummer, auth.uid());
    end if;
  elsif tg_table_name = 'td_termine' then
    if old.datum is distinct from new.datum or old.status is distinct from new.status then
      insert into nova_termindatenbank_data.td_aenderungshistorie
        (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values
        ('td_termine', new.id, 'datum/status',
         old.datum::text || ' / ' || old.status::text,
         new.datum::text || ' / ' || new.status::text, auth.uid());
    end if;
  elsif tg_table_name = 'td_unterauftraege' then
    if old.ergebnis is distinct from new.ergebnis then
      insert into nova_termindatenbank_data.td_aenderungshistorie
        (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values
        ('td_unterauftraege', new.id, 'ergebnis',
         old.ergebnis::text, new.ergebnis::text, auth.uid());
    end if;
    if old.status is distinct from new.status
       or old.storno_grund is distinct from new.storno_grund then
      insert into nova_termindatenbank_data.td_aenderungshistorie
        (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values
        ('td_unterauftraege', new.id, 'status/stornogrund',
         old.status::text || coalesce(' / ' || old.storno_grund, ''),
         new.status::text || coalesce(' / ' || new.storno_grund, ''), auth.uid());
    end if;
    if old.umfang is distinct from new.umfang
       or old.proben_geplant is distinct from new.proben_geplant
       or old.proben_ist is distinct from new.proben_ist then
      insert into nova_termindatenbank_data.td_aenderungshistorie
        (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
      values
        ('td_unterauftraege', new.id, 'umfang/proben',
         coalesce(old.umfang, '') || ' / ' || coalesce(old.proben_geplant::text, '–') || ' / ' || coalesce(old.proben_ist::text, '–'),
         coalesce(new.umfang, '') || ' / ' || coalesce(new.proben_geplant::text, '–') || ' / ' || coalesce(new.proben_ist::text, '–'),
         auth.uid());
    end if;
  end if;
  return new;
end
$$;

revoke all on function nova_termindatenbank_data.td_log_kritische_aenderungen()
  from public, anon, authenticated;

create or replace function nova_termindatenbank_data.td_unterauftrag_stornieren(
  p_unterauftrag uuid,
  p_grund text
)
returns text
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_nummer text;
  v_ergebnis nova_termindatenbank_data.td_ergebnisstatus;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_grund is null or p_grund not in ('dezentral', 'nicht_moeglich', 'absage') then
    raise exception 'Ungültiger Stornogrund';
  end if;

  select a.auftragsnummer || case when u.suffix = '' then '' else '-' || u.suffix end,
         u.ergebnis
    into v_nummer, v_ergebnis
    from nova_termindatenbank_data.td_unterauftraege u
    join nova_termindatenbank_data.td_auftraege a on a.id = u.auftrag_id
   where u.id = p_unterauftrag
   for update of u;

  if v_nummer is null then
    raise exception 'Unterauftrag nicht gefunden';
  end if;
  if v_ergebnis <> 'offen'
     or exists (
       select 1 from nova_termindatenbank_data.td_untersuchungsbewertungen
        where unterauftrag_id = p_unterauftrag
     ) then
    raise exception 'Ein bereits bewerteter Unterauftrag kann nicht storniert werden';
  end if;

  update nova_termindatenbank_data.td_unterauftraege
     set status = 'storniert',
         storno_grund = p_grund,
         storniert_am = now(),
         storniert_von = auth.uid()
   where id = p_unterauftrag;

  return v_nummer || ' wurde storniert';
end
$$;

create or replace function nova_termindatenbank_data.td_unterauftrag_sicher_loeschen(
  p_unterauftrag uuid,
  p_bestaetigung text
)
returns text
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_u nova_termindatenbank_data.td_unterauftraege%rowtype;
  v_nummer text;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_bestaetigung <> 'UNTERBERICHT LÖSCHEN' then
    raise exception 'Bestätigungstext stimmt nicht';
  end if;

  select u,
         a.auftragsnummer || case when u.suffix = '' then '' else '-' || u.suffix end
    into v_u, v_nummer
    from nova_termindatenbank_data.td_unterauftraege u
    join nova_termindatenbank_data.td_auftraege a on a.id = u.auftrag_id
   where u.id = p_unterauftrag
   for update of u;

  if v_u.id is null then
    raise exception 'Unterauftrag nicht gefunden';
  end if;
  if v_u.suffix = '' then
    raise exception 'Die Hauptnummer kann hier nicht gelöscht werden';
  end if;
  if v_u.ergebnis <> 'offen'
     or v_u.status not in ('offen', 'storniert')
     or coalesce(v_u.proben_ist, 0) <> 0
     or exists (
       select 1 from nova_termindatenbank_data.td_untersuchungsbewertungen
        where unterauftrag_id = p_unterauftrag
     )
     or exists (
       select 1 from nova_termindatenbank_data.td_proben
        where unterauftrag_id = p_unterauftrag
     )
     or exists (
       select 1 from nova_termindatenbank_data.td_ergebnis_parameter
        where unterauftrag_id = p_unterauftrag
     ) then
    raise exception 'Nur ein leerer, unbewerteter Unterbericht kann gelöscht werden';
  end if;

  insert into nova_termindatenbank_data.td_aenderungshistorie
    (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
  values
    ('td_unterauftraege', v_u.id, 'unterbericht_geloescht',
     v_nummer || ' / ' || v_u.art::text, 'gelöscht', auth.uid());

  delete from nova_termindatenbank_data.td_unterauftraege
   where id = p_unterauftrag;

  return v_nummer || ' wurde gelöscht';
end
$$;

revoke all on function nova_termindatenbank_data.td_unterauftrag_stornieren(uuid, text)
  from public, anon;
revoke all on function nova_termindatenbank_data.td_unterauftrag_sicher_loeschen(uuid, text)
  from public, anon;

grant execute on function nova_termindatenbank_data.td_unterauftrag_stornieren(uuid, text)
  to authenticated;
grant execute on function nova_termindatenbank_data.td_unterauftrag_sicher_loeschen(uuid, text)
  to authenticated;
