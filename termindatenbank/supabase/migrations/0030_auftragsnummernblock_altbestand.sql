-- Auftragsnummernblock für den Parallelbetrieb mit dem bisherigen Auftragsbuch.
-- Es werden keine leeren Aufträge angelegt. Der Zähler markiert lediglich den
-- höchsten bereits außerhalb von NOVAplan verwendeten Nummernstand.

create or replace function nova_termindatenbank_data.td_nummernblock_bis(
  p_jahr int,
  p_letzter_wert int
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stand int;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  if p_jahr < 2000 or p_jahr > 2099 then
    raise exception 'Ungültiges Jahr: %', p_jahr;
  end if;
  if p_letzter_wert < 1 or p_letzter_wert > 9999 then
    raise exception 'Nummernstand muss zwischen 0001 und 9999 liegen';
  end if;

  insert into nova_termindatenbank_data.td_auftragsnummern_zaehler (jahr, letzter_wert)
  values (p_jahr, p_letzter_wert)
  on conflict (jahr) do update
    set letzter_wert = greatest(
      nova_termindatenbank_data.td_auftragsnummern_zaehler.letzter_wert,
      excluded.letzter_wert
    )
  returning letzter_wert into v_stand;

  return jsonb_build_object(
    'jahr', p_jahr,
    'letzter_wert', v_stand,
    'nummer', to_char(p_jahr % 100, 'FM00') || '-' || to_char(v_stand, 'FM0000')
  );
end
$$;

revoke execute on function nova_termindatenbank_data.td_nummernblock_bis(int, int)
  from public, anon;
grant execute on function nova_termindatenbank_data.td_nummernblock_bis(int, int)
  to authenticated;
