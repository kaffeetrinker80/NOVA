-- ============================================================
-- Migration 0003: Sicherheits-Härtung (aus Supabase-Security-Advisor)
-- ============================================================

-- Views sollen mit den Rechten des abfragenden Nutzers laufen (RLS greift korrekt),
-- nicht mit denen des Erstellers.
alter view nova_termindatenbank_data.td_v_auftragsnummern set (security_invoker = true);
alter view nova_termindatenbank_data.td_v_auftragsbuch set (security_invoker = true);

-- search_path fest auf public setzen (verhindert Manipulation über den Suchpfad)
alter function nova_termindatenbank_data.td_ist_mind_disposition() set search_path = nova_termindatenbank_data, public;
alter function nova_termindatenbank_data.td_set_audit_fields() set search_path = nova_termindatenbank_data, public;
alter function nova_termindatenbank_data.td_log_kritische_aenderungen() set search_path = nova_termindatenbank_data, public;

-- Auftragsnummern dürfen nur über die geprüfte Funktion td_auftrag_anlegen() vergeben werden,
-- nicht direkt von jedem angemeldeten Nutzer (sonst könnten Nummern "verbrannt" werden).
revoke execute on function nova_termindatenbank_data.td_naechste_auftragsnummer(int) from public, anon, authenticated;
