-- ============================================================
-- Migration 0004: Umzug in eigenes Schema nova_termindatenbank_data
-- ============================================================

create schema if not exists nova_termindatenbank_data;

-- ============================================================
-- NOVA Wasser – Trinkwasser-Untersuchungsverwaltung
-- Migration 0001: Kern-Datenmodell, Auftragsnummern, RLS
-- ============================================================

-- ---------- Enums ----------
create type nova_termindatenbank_data.td_kundentyp as enum ('hausverwaltung','pflegetraeger','wohnungsbau','privatkunde','sonstige');
create type nova_termindatenbank_data.td_terminstatus as enum ('geplant','bestaetigt','abgeschlossen','abgesagt','verschoben');
create type nova_termindatenbank_data.td_untersuchungsart as enum ('legionellen','mibi','chemie','vorortparameter','sonstiges');
create type nova_termindatenbank_data.td_auftragsstatus as enum ('offen','beprobt','im_labor','abgeschlossen','storniert');
create type nova_termindatenbank_data.td_ergebnisstatus as enum ('offen','unauffaellig','ueberschritten','nachuntersuchung_erforderlich');
create type nova_termindatenbank_data.td_app_rolle as enum ('admin','disposition','probenehmer','lesend');

-- ---------- Benutzerprofile (Supabase Auth) ----------
-- Passwörter liegen ausschließlich in Supabase Auth. Diese Tabelle hält nur Rolle + Anzeigename.
create table nova_termindatenbank_data.td_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  anzeigename text not null,
  kuerzel text,                              -- z.B. "MH" für Kalender/Auftragsbuch
  rolle nova_termindatenbank_data.td_app_rolle not null default 'lesend',
  aktiv boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function nova_termindatenbank_data.td_current_rolle() returns nova_termindatenbank_data.td_app_rolle
language sql stable security definer set search_path = nova_termindatenbank_data, public as
$$ select rolle from nova_termindatenbank_data.td_profile where id = auth.uid() and aktiv $$;

create or replace function nova_termindatenbank_data.td_ist_mind_disposition() returns boolean
language sql stable as
$$ select nova_termindatenbank_data.td_current_rolle() in ('admin','disposition') $$;

-- ---------- Audit-Helfer ----------
create or replace function nova_termindatenbank_data.td_set_audit_fields() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- Änderungshistorie für kritische Änderungen
create table nova_termindatenbank_data.td_aenderungshistorie (
  id bigint generated always as identity primary key,
  tabelle text not null,
  datensatz_id uuid not null,
  feld text not null,
  alter_wert text,
  neuer_wert text,
  geaendert_von uuid references auth.users(id),
  geaendert_am timestamptz not null default now()
);

-- ---------- 1. Kunden ----------
create table nova_termindatenbank_data.td_kunden (
  id uuid primary key default gen_random_uuid(),
  name_lang text not null,                   -- volle Firmierung
  name_kurz text not null,                   -- Kalender-Kurzname, z.B. "Augusta"
  typ nova_termindatenbank_data.td_kundentyp not null default 'hausverwaltung',
  strasse text, plz text, ort text,
  telefon text, email text,
  notizen text,
  aktiv boolean not null default true,
  -- Migration / Legacy
  legacy_id text, legacy_quelle text,
  created_at timestamptz, created_by uuid, updated_at timestamptz, updated_by uuid
);

create table nova_termindatenbank_data.td_ansprechpartner (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references nova_termindatenbank_data.td_kunden(id) on delete cascade,
  name text not null, funktion text, telefon text, email text, notizen text,
  created_at timestamptz, created_by uuid, updated_at timestamptz, updated_by uuid
);

-- ---------- 2. Anlagen (Objekte) ----------
create table nova_termindatenbank_data.td_anlagen (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references nova_termindatenbank_data.td_kunden(id),
  name text not null,                        -- z.B. "Straßbergerstr. 11–47"
  strasse text, plz text, ort text,
  objekt_referenz text,                      -- Kunden-/Objektnummer der Verwaltung
  turnus_monate int,                          -- z.B. 36 (3 Jahre) / 12 (jährlich)
  naechste_untersuchung date,
  notizen text,
  aktiv boolean not null default true,
  legacy_id text, legacy_quelle text,
  created_at timestamptz, created_by uuid, updated_at timestamptz, updated_by uuid
);

-- ---------- 3. Untersuchungsbereiche (WWB) ----------
create table nova_termindatenbank_data.td_bereiche (
  id uuid primary key default gen_random_uuid(),
  anlage_id uuid not null references nova_termindatenbank_data.td_anlagen(id),
  name text not null,                        -- z.B. "Haus 3–5"
  beschreibung text,                          -- Gebäude, Hausnummernbereich …
  wwb_details text,                           -- Warmwassersystem-Details
  notizen text,
  aktiv boolean not null default true,
  abgespalten_von uuid references nova_termindatenbank_data.td_bereiche(id),  -- Aufteilung während des Prozesses
  legacy_id text, legacy_quelle text,
  created_at timestamptz, created_by uuid, updated_at timestamptz, updated_by uuid
);

-- ---------- 4. Termine ----------
create table nova_termindatenbank_data.td_termine (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references nova_termindatenbank_data.td_kunden(id),
  anlage_id uuid not null references nova_termindatenbank_data.td_anlagen(id),
  datum date not null,
  beginn time, ende time,
  status nova_termindatenbank_data.td_terminstatus not null default 'geplant',
  frist date,                                -- gesetzlicher Untersuchungszeitraum / Fälligkeit
  notizen text,
  kalender_exportiert boolean not null default false,
  kalender_exportiert_am timestamptz,
  legacy_id text, legacy_quelle text,
  created_at timestamptz, created_by uuid, updated_at timestamptz, updated_by uuid
);

create table nova_termindatenbank_data.td_termin_probenehmer (
  termin_id uuid not null references nova_termindatenbank_data.td_termine(id) on delete cascade,
  profil_id uuid not null references nova_termindatenbank_data.td_profile(id),
  primary key (termin_id, profil_id)
);

-- ---------- 5. Auftragsnummern ----------
-- Zentrale, jahresweise Vergabe. Nummern werden NIE wiederverwendet.
create table nova_termindatenbank_data.td_auftragsnummern_zaehler (
  jahr int primary key,
  letzter_wert int not null default 0
);

create or replace function nova_termindatenbank_data.td_naechste_auftragsnummer(p_jahr int default null)
returns text language plpgsql security definer set search_path = nova_termindatenbank_data, public as $$
declare v_jahr int := coalesce(p_jahr, extract(year from now())::int);
        v_wert int;
begin
  insert into nova_termindatenbank_data.td_auftragsnummern_zaehler(jahr, letzter_wert)
  values (v_jahr, 1)
  on conflict (jahr) do update set letzter_wert = td_auftragsnummern_zaehler.letzter_wert + 1
  returning letzter_wert into v_wert;
  return to_char(v_jahr % 100, 'FM00') || '-' || to_char(v_wert, 'FM0000');
end $$;

-- ---------- 6. Aufträge (Hauptauftrag = 1 Untersuchungsbereich) ----------
create table nova_termindatenbank_data.td_auftraege (
  id uuid primary key default gen_random_uuid(),
  auftragsnummer text not null unique,       -- Format YY-NNNN, z.B. 26-0897
  jahr int not null,
  bereich_id uuid not null references nova_termindatenbank_data.td_bereiche(id),
  termin_id uuid references nova_termindatenbank_data.td_termine(id),
  status nova_termindatenbank_data.td_auftragsstatus not null default 'offen',
  notizen text,
  legacy_id text, legacy_quelle text,
  created_at timestamptz, created_by uuid, updated_at timestamptz, updated_by uuid
);

-- Unteraufträge: je Untersuchungsart eigener Status / Umfang / Ergebnis
create table nova_termindatenbank_data.td_unterauftraege (
  id uuid primary key default gen_random_uuid(),
  auftrag_id uuid not null references nova_termindatenbank_data.td_auftraege(id) on delete cascade,
  suffix text not null default '',           -- '' = Hauptart, 'M', 'C', …
  art nova_termindatenbank_data.td_untersuchungsart not null,
  umfang text,                               -- Mibi: Standard | Komplett | inklusive Enterokokken | Freitext
  proben_geplant int,
  proben_ist int,
  status nova_termindatenbank_data.td_auftragsstatus not null default 'offen',
  ergebnis nova_termindatenbank_data.td_ergebnisstatus not null default 'offen',
  notizen text,
  created_at timestamptz, created_by uuid, updated_at timestamptz, updated_by uuid,
  unique (auftrag_id, suffix)
);

-- Vollständige Auftragsnummer inkl. Suffix
create or replace view nova_termindatenbank_data.td_v_auftragsnummern as
select u.id as unterauftrag_id,
       a.auftragsnummer || case when u.suffix = '' then '' else '-' || u.suffix end as nummer_voll,
       a.id as auftrag_id, u.art, u.status, u.ergebnis
from nova_termindatenbank_data.td_unterauftraege u join nova_termindatenbank_data.td_auftraege a on a.id = u.auftrag_id;

-- ---------- 7. Proben (zukunftsfähig, Einzelproben) ----------
create table nova_termindatenbank_data.td_proben (
  id uuid primary key default gen_random_uuid(),
  unterauftrag_id uuid not null references nova_termindatenbank_data.td_unterauftraege(id) on delete cascade,
  proben_nr text,                            -- individuelle Probenkennung
  entnahmestelle text,
  entnommen_am timestamptz,
  notizen text,
  created_at timestamptz, created_by uuid, updated_at timestamptz, updated_by uuid
);

-- Ergebnis-Parameter (später befüllbar, Struktur vorhanden)
create table nova_termindatenbank_data.td_ergebnis_parameter (
  id uuid primary key default gen_random_uuid(),
  probe_id uuid references nova_termindatenbank_data.td_proben(id) on delete cascade,
  unterauftrag_id uuid references nova_termindatenbank_data.td_unterauftraege(id) on delete cascade,
  parameter text not null,                   -- z.B. "Legionella spec."
  wert numeric, einheit text,
  grenzwert numeric,
  ueberschritten boolean,
  notizen text,
  created_at timestamptz, created_by uuid, updated_at timestamptz, updated_by uuid
);

-- ---------- 12. Migration / Staging ----------
create table nova_termindatenbank_data.td_staging_import (
  id uuid primary key default gen_random_uuid(),
  quelle text not null,                      -- Dateiname / Systemname
  typ text not null,                         -- 'terminverwaltung_v4' | 'ueberschreitungen' | …
  rohdaten jsonb not null,
  status text not null default 'neu',        -- neu | geprueft | uebernommen | verworfen
  uebernommen_als uuid,                      -- Ziel-Datensatz nach Übernahme
  fehler text,
  importiert_am timestamptz not null default now(),
  importiert_von uuid references auth.users(id)
);

-- ---------- Audit-Trigger ----------
do $$ declare t text;
begin
  foreach t in array array['td_kunden','td_ansprechpartner','td_anlagen','td_bereiche','td_termine','td_auftraege','td_unterauftraege','td_proben','td_ergebnis_parameter']
  loop
    execute format('create trigger trg_audit_%s before insert or update on nova_termindatenbank_data.%I
                    for each row execute function nova_termindatenbank_data.td_set_audit_fields()', t, t);
  end loop;
end $$;

-- Historie für kritische Felder
create or replace function nova_termindatenbank_data.td_log_kritische_aenderungen() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'td_auftraege' and old.auftragsnummer is distinct from new.auftragsnummer then
    insert into nova_termindatenbank_data.td_aenderungshistorie(tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
    values ('td_auftraege', new.id, 'auftragsnummer', old.auftragsnummer, new.auftragsnummer, auth.uid());
  end if;
  if tg_table_name = 'td_termine' and (old.datum is distinct from new.datum or old.status is distinct from new.status) then
    insert into nova_termindatenbank_data.td_aenderungshistorie(tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
    values ('td_termine', new.id, 'datum/status',
            old.datum::text || ' / ' || old.status::text,
            new.datum::text || ' / ' || new.status::text, auth.uid());
  end if;
  if tg_table_name = 'td_unterauftraege' and old.ergebnis is distinct from new.ergebnis then
    insert into nova_termindatenbank_data.td_aenderungshistorie(tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
    values ('td_unterauftraege', new.id, 'ergebnis', old.ergebnis::text, new.ergebnis::text, auth.uid());
  end if;
  return new;
end $$;

create trigger trg_hist_auftraege after update on nova_termindatenbank_data.td_auftraege
  for each row execute function nova_termindatenbank_data.td_log_kritische_aenderungen();
create trigger trg_hist_termine after update on nova_termindatenbank_data.td_termine
  for each row execute function nova_termindatenbank_data.td_log_kritische_aenderungen();
create trigger trg_hist_unterauftraege after update on nova_termindatenbank_data.td_unterauftraege
  for each row execute function nova_termindatenbank_data.td_log_kritische_aenderungen();

-- ---------- Row Level Security ----------
alter table nova_termindatenbank_data.td_profile enable row level security;
alter table nova_termindatenbank_data.td_kunden enable row level security;
alter table nova_termindatenbank_data.td_ansprechpartner enable row level security;
alter table nova_termindatenbank_data.td_anlagen enable row level security;
alter table nova_termindatenbank_data.td_bereiche enable row level security;
alter table nova_termindatenbank_data.td_termine enable row level security;
alter table nova_termindatenbank_data.td_termin_probenehmer enable row level security;
alter table nova_termindatenbank_data.td_auftraege enable row level security;
alter table nova_termindatenbank_data.td_unterauftraege enable row level security;
alter table nova_termindatenbank_data.td_proben enable row level security;
alter table nova_termindatenbank_data.td_ergebnis_parameter enable row level security;
alter table nova_termindatenbank_data.td_staging_import enable row level security;
alter table nova_termindatenbank_data.td_aenderungshistorie enable row level security;
alter table nova_termindatenbank_data.td_auftragsnummern_zaehler enable row level security;

-- Profile: eigenes Profil lesen; Admin verwaltet alle
create policy profile_self_read on nova_termindatenbank_data.td_profile for select using (id = auth.uid() or nova_termindatenbank_data.td_current_rolle() = 'admin');
create policy profile_admin_write on nova_termindatenbank_data.td_profile for all using (nova_termindatenbank_data.td_current_rolle() = 'admin');

-- Stammdaten: alle angemeldeten Rollen lesen, Schreiben ab Disposition
do $$ declare t text;
begin
  foreach t in array array['td_kunden','td_ansprechpartner','td_anlagen','td_bereiche','td_termine','td_auftraege','td_unterauftraege'] loop
    execute format('create policy %I_read on nova_termindatenbank_data.%I for select using (nova_termindatenbank_data.td_current_rolle() is not null)', t, t);
    execute format('create policy %I_write on nova_termindatenbank_data.%I for insert with check (nova_termindatenbank_data.td_ist_mind_disposition())', t, t);
    execute format('create policy %I_update on nova_termindatenbank_data.%I for update using (nova_termindatenbank_data.td_ist_mind_disposition())', t, t);
    execute format('create policy %I_delete on nova_termindatenbank_data.%I for delete using (nova_termindatenbank_data.td_current_rolle() = ''admin'')', t, t);
  end loop;
end $$;

-- Probenehmer dürfen probenbezogene Daten ihrer Termine erfassen
create policy tp_read on nova_termindatenbank_data.td_termin_probenehmer for select using (nova_termindatenbank_data.td_current_rolle() is not null);
create policy tp_write on nova_termindatenbank_data.td_termin_probenehmer for all using (nova_termindatenbank_data.td_ist_mind_disposition());

create policy proben_read on nova_termindatenbank_data.td_proben for select using (nova_termindatenbank_data.td_current_rolle() is not null);
create policy proben_write on nova_termindatenbank_data.td_proben for insert with check (
  nova_termindatenbank_data.td_ist_mind_disposition() or (
    nova_termindatenbank_data.td_current_rolle() = 'probenehmer' and exists (
      select 1 from nova_termindatenbank_data.td_unterauftraege u
      join nova_termindatenbank_data.td_auftraege a on a.id = u.auftrag_id
      join nova_termindatenbank_data.td_termin_probenehmer tp on tp.termin_id = a.termin_id
      where u.id = unterauftrag_id and tp.profil_id = auth.uid())));
create policy proben_update on nova_termindatenbank_data.td_proben for update using (
  nova_termindatenbank_data.td_ist_mind_disposition() or (
    nova_termindatenbank_data.td_current_rolle() = 'probenehmer' and exists (
      select 1 from nova_termindatenbank_data.td_unterauftraege u
      join nova_termindatenbank_data.td_auftraege a on a.id = u.auftrag_id
      join nova_termindatenbank_data.td_termin_probenehmer tp on tp.termin_id = a.termin_id
      where u.id = td_proben.unterauftrag_id and tp.profil_id = auth.uid())));

-- Probenehmer dürfen Ist-Probenzahlen/Status ihrer Unteraufträge aktualisieren
create policy ua_probenehmer_update on nova_termindatenbank_data.td_unterauftraege for update using (
  nova_termindatenbank_data.td_current_rolle() = 'probenehmer' and exists (
    select 1 from nova_termindatenbank_data.td_auftraege a
    join nova_termindatenbank_data.td_termin_probenehmer tp on tp.termin_id = a.termin_id
    where a.id = td_unterauftraege.auftrag_id and tp.profil_id = auth.uid()));

create policy ep_read on nova_termindatenbank_data.td_ergebnis_parameter for select using (nova_termindatenbank_data.td_current_rolle() is not null);
create policy ep_write on nova_termindatenbank_data.td_ergebnis_parameter for all using (nova_termindatenbank_data.td_ist_mind_disposition());

create policy staging_all on nova_termindatenbank_data.td_staging_import for all using (nova_termindatenbank_data.td_current_rolle() in ('admin','disposition'));
create policy hist_read on nova_termindatenbank_data.td_aenderungshistorie for select using (nova_termindatenbank_data.td_current_rolle() in ('admin','disposition'));
create policy zaehler_read on nova_termindatenbank_data.td_auftragsnummern_zaehler for select using (nova_termindatenbank_data.td_current_rolle() is not null);
-- Zähler wird nur über security-definer-Funktion verändert; keine direkte Schreib-Policy.

-- Neuer Auth-Nutzer -> Profil mit Rolle 'lesend' (Admin stuft hoch)
create or replace function nova_termindatenbank_data.td_handle_new_user() returns trigger
language plpgsql security definer set search_path = nova_termindatenbank_data, public as $$
begin
  insert into nova_termindatenbank_data.td_profile (id, anzeigename)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function nova_termindatenbank_data.td_handle_new_user();

-- ---------- Auftragsanlage als Komplettvorgang ----------
-- Legt für einen Bereich einen Hauptauftrag mit frischer Nummer und die gewünschten Arten an.
create or replace function nova_termindatenbank_data.td_auftrag_anlegen(
  p_bereich uuid,
  p_termin uuid,
  p_arten jsonb   -- [{"art":"legionellen","suffix":"","umfang":null,"proben_geplant":12}, {"art":"mibi","suffix":"M","umfang":"inklusive Enterokokken","proben_geplant":3}]
) returns uuid language plpgsql security definer set search_path = nova_termindatenbank_data, public as $$
declare v_id uuid; v_nr text; v_jahr int; e jsonb;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;
  v_nr := nova_termindatenbank_data.td_naechste_auftragsnummer();
  v_jahr := 2000 + split_part(v_nr,'-',1)::int;
  insert into nova_termindatenbank_data.td_auftraege (auftragsnummer, jahr, bereich_id, termin_id)
  values (v_nr, v_jahr, p_bereich, p_termin) returning id into v_id;
  for e in select * from jsonb_array_elements(p_arten) loop
    insert into nova_termindatenbank_data.td_unterauftraege (auftrag_id, suffix, art, umfang, proben_geplant)
    values (v_id, coalesce(e->>'suffix',''), (e->>'art')::nova_termindatenbank_data.td_untersuchungsart,
            e->>'umfang', nullif(e->>'proben_geplant','')::int);
  end loop;
  return v_id;
end $$;

-- ---------- Auftragsbuch-View ----------
create or replace view nova_termindatenbank_data.td_v_auftragsbuch as
select
  a.jahr,
  a.auftragsnummer || case when u.suffix = '' then '' else '-' || u.suffix end as nummer,
  a.auftragsnummer as hauptnummer,
  u.suffix, u.art, u.umfang,
  u.proben_geplant, u.proben_ist,
  u.status, u.ergebnis, u.notizen as unterauftrag_notizen,
  k.id as kunde_id, k.name_lang as kunde, k.name_kurz as kunde_kurz,
  an.id as anlage_id, an.name as anlage, an.ort,
  b.id as bereich_id, b.name as bereich,
  t.id as termin_id, t.datum as termin_datum, t.beginn, t.ende, t.status as termin_status,
  a.id as auftrag_id, u.id as unterauftrag_id
from nova_termindatenbank_data.td_unterauftraege u
join nova_termindatenbank_data.td_auftraege a on a.id = u.auftrag_id
join nova_termindatenbank_data.td_bereiche b on b.id = a.bereich_id
join nova_termindatenbank_data.td_anlagen an on an.id = b.anlage_id
join nova_termindatenbank_data.td_kunden k on k.id = an.kunde_id
left join nova_termindatenbank_data.td_termine t on t.id = a.termin_id;
