-- Manuelle Freigabe des Probenahmeberichts je Hauptauftrag.
-- Unteraufträge (-M/-C) teilen sich die Freigabe der Hauptnummer.

alter table nova_termindatenbank_data.td_auftraege
  add column if not exists probenahmebericht_freigegeben boolean not null default false,
  add column if not exists probenahmebericht_freigegeben_am timestamptz,
  add column if not exists probenahmebericht_freigegeben_von uuid references auth.users(id);

create or replace function nova_termindatenbank_data.td_probenahmebericht_freigeben(
  p_auftrag uuid,
  p_freigegeben boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nummer text;
  v_am timestamptz;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  update nova_termindatenbank_data.td_auftraege
  set probenahmebericht_freigegeben = p_freigegeben,
      probenahmebericht_freigegeben_am = case when p_freigegeben then now() else null end,
      probenahmebericht_freigegeben_von = case when p_freigegeben then auth.uid() else null end
  where id = p_auftrag
  returning auftragsnummer, probenahmebericht_freigegeben_am
  into v_nummer, v_am;

  if v_nummer is null then
    raise exception 'Auftrag nicht gefunden';
  end if;

  return jsonb_build_object(
    'nummer', v_nummer,
    'freigegeben', p_freigegeben,
    'freigegeben_am', v_am
  );
end
$$;

revoke execute on function nova_termindatenbank_data.td_probenahmebericht_freigeben(uuid, boolean)
  from public, anon;
grant execute on function nova_termindatenbank_data.td_probenahmebericht_freigeben(uuid, boolean)
  to authenticated;
