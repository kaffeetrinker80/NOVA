-- ============================================================
-- NOVAplan – Bereichsfachlogik, eindeutiger Legacy-Import
-- und revisionssicherer Hausverwaltungswechsel
-- ============================================================

-- Ein Bereich/WWB ist die fachlich führende Einheit. Sonderturnusse werden
-- nicht mehr in die starren Werte 12/36 Monate gezwungen.
alter table nova_termindatenbank_data.td_bereiche
  drop constraint if exists td_bereiche_turnus_monate_check;

alter table nova_termindatenbank_data.td_bereiche
  add column if not exists turnus_art text not null default 'regelturnus'
    check (turnus_art in ('regelturnus', 'sonderturnus', 'behoerdlich')),
  add column if not exists turnus_begruendung text,
  add column if not exists proben_anzahl integer
    check (proben_anzahl is null or proben_anzahl > 0);

alter table nova_termindatenbank_data.td_bereiche
  drop constraint if exists td_bereiche_turnus_monate_positiv;

alter table nova_termindatenbank_data.td_bereiche
  add constraint td_bereiche_turnus_monate_positiv
  check (turnus_monate is null or turnus_monate between 1 and 120)
  not valid;

alter table nova_termindatenbank_data.td_bereiche
  validate constraint td_bereiche_turnus_monate_positiv;

-- Die fachliche Untersuchungsart ist etwas anderes als die Labor-/Leistungsart
-- eines Unterauftrags (Legionellen, Mibi, Chemie ...).
alter table nova_termindatenbank_data.td_auftraege
  add column if not exists fachliche_untersuchungsart text
    check (fachliche_untersuchungsart in (
      'orientierend',
      'regeluntersuchung',
      'weitergehend',
      'nachuntersuchung'
    ));

-- Bericht, Befund und fachliche Folgeentscheidung bleiben getrennte Aussagen.
alter table nova_termindatenbank_data.td_untersuchungsbewertungen
  add column if not exists folgeentscheidung text
    check (folgeentscheidung in (
      'regelturnus_bleibt',
      'weitergehende_untersuchung',
      'nachuntersuchung',
      'ueberschreitungsphase_starten',
      'phase_fortfuehren',
      'regelturnus_durch_gesundheitsamt'
    ));

-- Jeder aus einer Legacy-Zeile erzeugte Bereich besitzt künftig eine stabile
-- Kennung. NULL bleibt für manuell angelegte Bereiche weiterhin erlaubt.
create unique index if not exists td_bereiche_legacy_uni
  on nova_termindatenbank_data.td_bereiche (legacy_id);

-- Sichere Bestandskorrektur: Nur wenn eine Anlage genau einen aktiven Bereich
-- hat, ist die Zuordnung alter Termine eindeutig und darf automatisch erfolgen.
update nova_termindatenbank_data.td_termine t
   set bereich_id = eindeutig.bereich_id
  from (
    select anlage_id, (array_agg(id order by id))[1] as bereich_id
      from nova_termindatenbank_data.td_bereiche
     where aktiv
     group by anlage_id
    having count(*) = 1
  ) eindeutig
 where t.anlage_id = eindeutig.anlage_id
   and t.bereich_id is null;

-- Ein Verwalterwechsel ist kein Merge. Die Anlage behält ihre ID; Bereiche,
-- Aufträge, Berichte, Phasen und Notizen bleiben deshalb automatisch
-- unverändert verbunden. Nur Anlage und direkte Termin-Kundenreferenz wechseln.
drop function if exists nova_termindatenbank_data.td_anlage_verwalter_wechseln(uuid, uuid);

create or replace function nova_termindatenbank_data.td_anlage_verwalter_wechseln(
  p_anlage uuid,
  p_neuer_kunde uuid
)
returns text
language plpgsql
security definer
set search_path = nova_termindatenbank_data, pg_catalog
as $$
declare
  v_alter_kunde uuid;
  v_anlagenname text;
  v_altname text;
  v_neuname text;
  v_termine integer;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  select kunde_id, name
    into v_alter_kunde, v_anlagenname
    from nova_termindatenbank_data.td_anlagen
   where id = p_anlage
   for update;

  if v_alter_kunde is null then
    raise exception 'Anlage nicht gefunden.';
  end if;

  select name_lang into v_neuname
    from nova_termindatenbank_data.td_kunden
   where id = p_neuer_kunde and aktiv;
  if v_neuname is null then
    raise exception 'Neuer aktiver Kunde nicht gefunden.';
  end if;

  if v_alter_kunde = p_neuer_kunde then
    return 'Die Anlage gehört bereits zu diesem Kunden.';
  end if;

  select name_lang into v_altname
    from nova_termindatenbank_data.td_kunden
   where id = v_alter_kunde;

  update nova_termindatenbank_data.td_anlagen
     set kunde_id = p_neuer_kunde
   where id = p_anlage;

  update nova_termindatenbank_data.td_termine
     set kunde_id = p_neuer_kunde
   where anlage_id = p_anlage;
  get diagnostics v_termine = row_count;

  insert into nova_termindatenbank_data.td_aenderungshistorie
    (tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
  values
    ('td_anlagen', p_anlage, 'hausverwaltungswechsel',
     v_alter_kunde::text || ' / ' || coalesce(v_altname, '–'),
     p_neuer_kunde::text || ' / ' || v_neuname,
     auth.uid());

  return format(
    'Anlage „%s“ an „%s“ übergeben. %s Termin(e), alle Bereiche, Aufträge, Berichte und Phasen bleiben erhalten.',
    v_anlagenname, v_neuname, v_termine
  );
end;
$$;

revoke all on function nova_termindatenbank_data.td_anlage_verwalter_wechseln(uuid, uuid) from public;
revoke all on function nova_termindatenbank_data.td_anlage_verwalter_wechseln(uuid, uuid) from anon;
grant execute on function nova_termindatenbank_data.td_anlage_verwalter_wechseln(uuid, uuid) to authenticated;
