-- ============================================================
-- NOVAplan – editierbare Bereichshistorie, Standardleistungen
-- und bewusst bestätigtes Löschen eines Bereichs
-- ============================================================

-- Die fachliche Fälligkeit und der Standardumfang gehören zum WWB/Bereich.
alter table nova_termindatenbank_data.td_bereiche
  add column if not exists standard_legionellen boolean not null default true,
  add column if not exists standard_mibi boolean not null default false,
  add column if not exists standard_mibi_umfang text not null default 'Standard'
    check (standard_mibi_umfang in ('Standard', 'Komplett', 'inklusive Enterokokken')),
  add column if not exists standard_chemie boolean not null default false;

-- Alte Excel-Termine haben oft keinen Auftrag. Diese Felder bilden deshalb
-- eine bearbeitbare fachliche Kurzbewertung direkt am Historieneintrag ab.
alter table nova_termindatenbank_data.td_termine
  add column if not exists fachliche_untersuchungsart text
    check (fachliche_untersuchungsart in (
      'orientierend', 'regeluntersuchung', 'weitergehend', 'nachuntersuchung'
    )),
  add column if not exists historie_einordnung text not null default 'unbekannt'
    check (historie_einordnung in (
      'unbekannt', 'regulaer',
      'als_weitergehend_uebernommen', 'als_nu_uebernommen'
    )),
  add column if not exists befund text
    check (befund in ('offen', 'sauber', 'ueberschreitung', 'verkeimung', 'nicht_bewertbar')),
  add column if not exists pruefbericht_nummer text,
  add column if not exists pruefbericht_datum date,
  add column if not exists historie_bemerkung text;

-- Beim Neuimport wird jede historische Untersuchung zunächst ausdrücklich
-- als fachlich ungeklärt markiert. Danach kann sie im Historien-Dialog
-- zugeordnet werden, ohne einen künstlichen Auftrag anlegen zu müssen.
update nova_termindatenbank_data.td_termine
   set historie_einordnung = 'unbekannt'
 where status = 'abgeschlossen'
   and historie_einordnung is null;

-- Löschen ist absichtlich eine eigene, bestätigungspflichtige Aktion.
-- Alle nur zu diesem Bereich gehörenden Fachdaten werden in einer Transaktion
-- entfernt. Die Auftragsnummer bleibt im Jahreszähler verbraucht.
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

  select count(*) into v_termine from nova_termindatenbank_data.td_termine where bereich_id = p_bereich;
  select count(*) into v_auftraege from nova_termindatenbank_data.td_auftraege where bereich_id = p_bereich;
  select count(*) into v_phasen from nova_termindatenbank_data.td_ueberschreitungsphasen where bereich_id = p_bereich;

  update nova_termindatenbank_data.td_untersuchungsbewertungen b
     set phase_id = null
   where phase_id in (
     select id from nova_termindatenbank_data.td_ueberschreitungsphasen where bereich_id = p_bereich
   );
  update nova_termindatenbank_data.td_ueberschreitungsphasen
     set ausloesende_bewertung_id = null
   where bereich_id = p_bereich;

  delete from nova_termindatenbank_data.td_untersuchungsbewertungen b
   where b.unterauftrag_id in (
     select u.id
       from nova_termindatenbank_data.td_unterauftraege u
       join nova_termindatenbank_data.td_auftraege a on a.id = u.auftrag_id
      where a.bereich_id = p_bereich
   );
  delete from nova_termindatenbank_data.td_ueberschreitungsphasen where bereich_id = p_bereich;
  delete from nova_termindatenbank_data.td_auftraege where bereich_id = p_bereich;
  delete from nova_termindatenbank_data.td_termine where bereich_id = p_bereich;
  update nova_termindatenbank_data.td_bereiche set abgespalten_von = null where abgespalten_von = p_bereich;
  delete from nova_termindatenbank_data.td_merge_bereich_mapping where ziel_bereich_id = p_bereich;
  delete from nova_termindatenbank_data.td_bereiche where id = p_bereich;

  insert into nova_termindatenbank_data.td_aenderungshistorie
    (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
  values
    ('td_bereiche', p_bereich, 'bereich_geloescht',
     v_name || format(' (%s Termine, %s Aufträge, %s Phasen)', v_termine, v_auftraege, v_phasen),
     'dauerhaft gelöscht', auth.uid());

  return jsonb_build_object(
    'name', v_name, 'termine', v_termine, 'auftraege', v_auftraege, 'phasen', v_phasen
  );
end;
$$;

revoke all on function nova_termindatenbank_data.td_bereich_sicher_loeschen(uuid, text) from public;
revoke all on function nova_termindatenbank_data.td_bereich_sicher_loeschen(uuid, text) from anon;
grant execute on function nova_termindatenbank_data.td_bereich_sicher_loeschen(uuid, text) to authenticated;
