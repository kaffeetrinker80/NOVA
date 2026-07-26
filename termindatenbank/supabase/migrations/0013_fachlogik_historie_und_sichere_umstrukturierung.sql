-- ============================================================
-- NOVAplan – Fachlogik statt Abstandsschätzung
--
-- Diese Migration ergänzt das bisherige Modell. Sie löscht und verändert
-- keine Alt-Historie. Bitte erst in einer Supabase-Testkopie ausführen.
-- ============================================================

-- Der Untersuchungsbereich (WWB) wird die fachlich führende Einheit für
-- Regelturnus und Fälligkeit. Die bisherigen Felder an td_anlagen bleiben
-- für die Übergangszeit erhalten.
alter table nova_termindatenbank_data.td_bereiche
  add column if not exists turnus_monate int check (turnus_monate in (12, 36)),
  add column if not exists naechste_untersuchung date,
  add column if not exists planungsnotiz text,
  add column if not exists betreuungsstatus text not null default 'aktiv'
    check (betreuungsstatus in ('aktiv', 'pausiert', 'nicht_mehr_unser_kunde'));

-- Ein Unterauftrag erhält genau eine fachliche Bewertung, sobald der
-- Prüfbericht vorliegt. "sauber" ist bewusst etwas anderes als "Bericht da".
create table if not exists nova_termindatenbank_data.td_untersuchungsbewertungen (
  id uuid primary key default gen_random_uuid(),
  unterauftrag_id uuid not null unique references nova_termindatenbank_data.td_unterauftraege(id),
  bericht_status text not null default 'ausstehend'
    check (bericht_status in ('ausstehend', 'eingegangen', 'geprueft')),
  pruefbericht_nummer text,
  pruefbericht_datum date,
  befund text not null default 'offen'
    check (befund in ('offen', 'sauber', 'ueberschreitung', 'verkeimung', 'nicht_bewertbar')),
  bewertungsdatum date,
  zaehlt_als_saubere_nachuntersuchung boolean not null default false,
  bemerkung text,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  constraint td_bewertung_saubere_nu_nur_sauber check
    (not zaehlt_als_saubere_nachuntersuchung or befund = 'sauber')
);

-- Eine Überschreitungsphase wird ausdrücklich eröffnet und abgeschlossen.
-- Der Standard sind drei saubere Nachuntersuchungen; das Gesundheitsamt kann
-- mit Freigabe für den Regelturnus früher abschließen.
create table if not exists nova_termindatenbank_data.td_ueberschreitungsphasen (
  id uuid primary key default gen_random_uuid(),
  bereich_id uuid not null references nova_termindatenbank_data.td_bereiche(id),
  ausloesende_bewertung_id uuid references nova_termindatenbank_data.td_untersuchungsbewertungen(id),
  eroeffnet_am date not null,
  ausloeser text not null check (ausloeser in ('ueberschreitung', 'verkeimung', 'behoerdenanordnung', 'sonstiges')),
  status text not null default 'aktiv'
    check (status in ('aktiv', 'massnahmen_laufen', 'nachuntersuchung', 'regelturnus_bestaetigt', 'abgeschlossen')),
  massnahmen_abschluss_am date,
  saubere_nu_erforderlich smallint not null default 3 check (saubere_nu_erforderlich between 0 and 20),
  gesundheitsamt_freigabe_am date,
  gesundheitsamt_aktenzeichen text,
  abgeschlossen_am date,
  begruendung_abweichung text,
  notizen text,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  constraint td_phase_abschluss_konsistent check
    (status not in ('regelturnus_bestaetigt', 'abgeschlossen') or abgeschlossen_am is not null or gesundheitsamt_freigabe_am is not null)
);

alter table nova_termindatenbank_data.td_untersuchungsbewertungen
  add column if not exists phase_id uuid references nova_termindatenbank_data.td_ueberschreitungsphasen(id);

create index if not exists td_bewertungen_phase_idx on nova_termindatenbank_data.td_untersuchungsbewertungen(phase_id);
create index if not exists td_phasen_bereich_idx on nova_termindatenbank_data.td_ueberschreitungsphasen(bereich_id, status);

-- Zentrale, lesbare Bereichshistorie. Geplante Termine erscheinen nicht als
-- Untersuchungsergebnis, weil nur abgeschlossene Termine fachlich zählen.
create or replace view nova_termindatenbank_data.td_v_bereichshistorie as
select a.bereich_id, t.datum as zeitpunkt, 'untersuchung'::text as art,
       a.auftragsnummer as referenz, u.art::text as detail,
       coalesce(b.befund, u.ergebnis::text) as ergebnis,
       b.pruefbericht_nummer, b.phase_id
from nova_termindatenbank_data.td_auftraege a
join nova_termindatenbank_data.td_unterauftraege u on u.auftrag_id = a.id
left join nova_termindatenbank_data.td_termine t on t.id = a.termin_id
left join nova_termindatenbank_data.td_untersuchungsbewertungen b on b.unterauftrag_id = u.id
where t.status = 'abgeschlossen'
union all
select p.bereich_id, p.eroeffnet_am, 'phase_eroeffnet', null, p.ausloeser,
       p.status, null, p.id
from nova_termindatenbank_data.td_ueberschreitungsphasen p
union all
select p.bereich_id, coalesce(p.gesundheitsamt_freigabe_am, p.abgeschlossen_am),
       'phase_abgeschlossen', p.gesundheitsamt_aktenzeichen, p.status,
       'regelturnus', null, p.id
from nova_termindatenbank_data.td_ueberschreitungsphasen p
where coalesce(p.gesundheitsamt_freigabe_am, p.abgeschlossen_am) is not null;

-- Bereiche werden niemals zum Umstrukturieren gelöscht: sie werden verschoben
-- oder archiviert. Aufträge, Bewertungen und Phasen behalten damit ihre IDs.
create or replace function nova_termindatenbank_data.td_bereich_verschieben(
  p_bereich uuid, p_zielanlage uuid
) returns text language plpgsql security definer set search_path = nova_termindatenbank_data, public as $$
begin
  if not td_ist_mind_disposition() then raise exception 'Keine Berechtigung'; end if;
  if not exists (select 1 from td_bereiche where id = p_bereich) then raise exception 'Bereich nicht gefunden'; end if;
  if not exists (select 1 from td_anlagen where id = p_zielanlage) then raise exception 'Zielanlage nicht gefunden'; end if;
  update td_bereiche set anlage_id = p_zielanlage where id = p_bereich;
  insert into td_aenderungshistorie(tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
  values ('td_bereiche', p_bereich, 'anlage_verschoben', null, p_zielanlage::text, auth.uid());
  return 'Bereich wurde verschoben; Aufträge, Bewertungen und Phasen bleiben unverändert erhalten.';
end $$;

create or replace function nova_termindatenbank_data.td_bereiche_zusammenfuehren(
  p_ziel uuid, p_quellen uuid[]
) returns text language plpgsql security definer set search_path = nova_termindatenbank_data, public as $$
declare q uuid;
begin
  if not td_ist_mind_disposition() then raise exception 'Keine Berechtigung'; end if;
  if not exists (select 1 from td_bereiche where id = p_ziel) then raise exception 'Zielbereich nicht gefunden'; end if;
  foreach q in array p_quellen loop
    if q = p_ziel then continue; end if;
    if not exists (select 1 from td_bereiche where id = q) then raise exception 'Quellbereich % nicht gefunden', q; end if;
    update td_auftraege set bereich_id = p_ziel where bereich_id = q;
    update td_termine set bereich_id = p_ziel where bereich_id = q;
    update td_ueberschreitungsphasen set bereich_id = p_ziel where bereich_id = q;
    update td_bereiche set aktiv = false, betreuungsstatus = 'pausiert',
      notizen = concat_ws(E'\n', notizen, 'Zusammengeführt in Bereich ' || p_ziel::text)
      where id = q;
    insert into td_aenderungshistorie(tabelle, datensatz_id, feld, alter_wert, neuer_wert, geaendert_von)
    values ('td_bereiche', q, 'zusammengefuehrt_in', q::text, p_ziel::text, auth.uid());
  end loop;
  return 'Bereiche zusammengeführt. Quellen wurden archiviert, nicht gelöscht; komplette Historie bleibt nachvollziehbar.';
end $$;

alter table nova_termindatenbank_data.td_untersuchungsbewertungen enable row level security;
alter table nova_termindatenbank_data.td_ueberschreitungsphasen enable row level security;
create policy bewertungen_read on nova_termindatenbank_data.td_untersuchungsbewertungen for select using (td_current_rolle() is not null);
create policy bewertungen_write on nova_termindatenbank_data.td_untersuchungsbewertungen for all using (td_ist_mind_disposition()) with check (td_ist_mind_disposition());
create policy phasen_read on nova_termindatenbank_data.td_ueberschreitungsphasen for select using (td_current_rolle() is not null);
create policy phasen_write on nova_termindatenbank_data.td_ueberschreitungsphasen for all using (td_ist_mind_disposition()) with check (td_ist_mind_disposition());

grant select, insert, update on nova_termindatenbank_data.td_untersuchungsbewertungen, nova_termindatenbank_data.td_ueberschreitungsphasen to authenticated;
grant select on nova_termindatenbank_data.td_v_bereichshistorie to authenticated;
