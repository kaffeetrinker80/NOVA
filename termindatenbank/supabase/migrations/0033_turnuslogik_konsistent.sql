-- NOVAplan v3.19 – Turnus und fachliche Phase bleiben widerspruchsfrei.
-- 3 Monate bedeuten immer Nachuntersuchung. Ein Wechsel auf 1 oder 3 Jahre
-- beendet den NU-Turnus und führt zurück zum Regelturnus.

create or replace function nova_termindatenbank_data.td_turnus_normalisieren()
returns trigger
language plpgsql
set search_path = nova_termindatenbank_data, pg_catalog
as $$
begin
  if new.turnus_monate = 3 then
    new.turnus_art := 'nachuntersuchung';
  elsif new.turnus_monate in (12, 36) and new.turnus_art = 'nachuntersuchung' then
    new.turnus_art := 'regelturnus';
  end if;
  return new;
end;
$$;

drop trigger if exists td_bereiche_turnus_normalisieren
  on nova_termindatenbank_data.td_bereiche;

create trigger td_bereiche_turnus_normalisieren
before insert or update of turnus_monate, turnus_art
on nova_termindatenbank_data.td_bereiche
for each row execute function nova_termindatenbank_data.td_turnus_normalisieren();

-- Einmalige Korrektur des Excel-Altbestands.
update nova_termindatenbank_data.td_bereiche
set turnus_art = 'nachuntersuchung'
where turnus_monate = 3
  and turnus_art is distinct from 'nachuntersuchung';

update nova_termindatenbank_data.td_bereiche
set turnus_art = 'regelturnus'
where turnus_monate in (12, 36)
  and turnus_art = 'nachuntersuchung';

alter table nova_termindatenbank_data.td_bereiche
  drop constraint if exists td_bereiche_turnus_konsistent;

alter table nova_termindatenbank_data.td_bereiche
  add constraint td_bereiche_turnus_konsistent check (
    (turnus_monate is distinct from 3 or turnus_art = 'nachuntersuchung')
    and (turnus_monate not in (12, 36) or turnus_art <> 'nachuntersuchung')
  );

comment on constraint td_bereiche_turnus_konsistent
on nova_termindatenbank_data.td_bereiche
is '3 Monate = Nachuntersuchung; 1/3 Jahre können nicht als NU-Turnus gespeichert werden.';
