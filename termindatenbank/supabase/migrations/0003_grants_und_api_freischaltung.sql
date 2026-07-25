-- Rechte fuer das neue Schema + API-Freischaltung
grant usage on schema nova_termindatenbank_data to anon, authenticated, service_role;
grant all on all tables in schema nova_termindatenbank_data to anon, authenticated, service_role;
grant all on all routines in schema nova_termindatenbank_data to anon, authenticated, service_role;
grant all on all sequences in schema nova_termindatenbank_data to anon, authenticated, service_role;
alter default privileges for role postgres in schema nova_termindatenbank_data grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema nova_termindatenbank_data grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema nova_termindatenbank_data grant all on sequences to anon, authenticated, service_role;

-- td_naechste_auftragsnummer bleibt intern (nur ueber td_auftrag_anlegen aufrufbar)
revoke execute on function nova_termindatenbank_data.td_naechste_auftragsnummer(int) from public, anon, authenticated;

-- Schema fuer die Data API freischalten (Alternative zum Dashboard-Schritt)
alter role authenticator set pgrst.db_schemas = 'public, nova_termindatenbank_data';
notify pgrst, 'reload config';
