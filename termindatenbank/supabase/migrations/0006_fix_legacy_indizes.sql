-- ============================================================
-- Migration 0006: Eindeutigkeits-Indizes für den Legacy-Import korrigieren
-- ============================================================
-- Teil-Indizes (WHERE legacy_id is not null) können von ON CONFLICT nicht
-- verwendet werden -> Fehler "no unique or exclusion constraint matching the
-- ON CONFLICT specification". Normale Unique-Indizes lösen das; NULL-Werte
-- gelten in Postgres als verschieden, manuell angelegte Datensätze ohne
-- legacy_id kollidieren also weiterhin nicht.

drop index if exists nova_termindatenbank_data.td_kunden_legacy_uni;
drop index if exists nova_termindatenbank_data.td_anlagen_legacy_uni;
drop index if exists nova_termindatenbank_data.td_termine_legacy_uni;

create unique index td_kunden_legacy_uni  on nova_termindatenbank_data.td_kunden  (legacy_id);
create unique index td_anlagen_legacy_uni on nova_termindatenbank_data.td_anlagen (legacy_id);
create unique index td_termine_legacy_uni on nova_termindatenbank_data.td_termine (legacy_id);
