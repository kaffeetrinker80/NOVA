-- Automatische Auftragsnummern richten sich nach dem Untersuchungsjahr.
-- Manuelle freie Nummern bleiben vorwärts und rückwärts belegbar.

create or replace function nova_termindatenbank_data.td_nummer_vorschau(
  p_jahr int
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  if p_jahr < 2000 or p_jahr > 2099 then
    raise exception 'Ungültiges Nummernjahr: %', p_jahr;
  end if;

  return to_char(p_jahr % 100, 'FM00') || '-' ||
    to_char(
      coalesce((
        select z.letzter_wert
        from nova_termindatenbank_data.td_auftragsnummern_zaehler z
        where z.jahr = p_jahr
      ), 0) + 1,
      'FM0000'
    );
end
$$;

revoke execute on function nova_termindatenbank_data.td_nummer_vorschau(int)
  from public, anon;
grant execute on function nova_termindatenbank_data.td_nummer_vorschau(int)
  to authenticated;

create or replace function nova_termindatenbank_data.td_auftrag_anlegen(
  p_bereich uuid,
  p_termin uuid,
  p_arten jsonb,
  p_nummer_manuell text,
  p_nummernjahr int
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_nr text;
  v_jahr int;
  v_lauf int;
  v_termin_jahr int;
  e jsonb;
begin
  if not nova_termindatenbank_data.td_ist_mind_disposition() then
    raise exception 'Keine Berechtigung';
  end if;

  if p_nummer_manuell is not null and length(trim(p_nummer_manuell)) > 0 then
    v_nr := trim(p_nummer_manuell);
    if v_nr !~ '^[0-9]{2}-[0-9]{4}$' then
      raise exception 'Ungültiges Format "%": erwartet JJ-NNNN, z. B. 27-0001', v_nr;
    end if;
    if exists (
      select 1
      from nova_termindatenbank_data.td_auftraege a
      where a.auftragsnummer = v_nr
    ) then
      raise exception 'Auftragsnummer % ist bereits vergeben', v_nr;
    end if;

    v_jahr := 2000 + split_part(v_nr, '-', 1)::int;
    v_lauf := split_part(v_nr, '-', 2)::int;

    insert into nova_termindatenbank_data.td_auftragsnummern_zaehler
      (jahr, letzter_wert)
    values (v_jahr, v_lauf)
    on conflict (jahr) do update
      set letzter_wert = greatest(
        nova_termindatenbank_data.td_auftragsnummern_zaehler.letzter_wert,
        excluded.letzter_wert
      );
  else
    if p_termin is not null then
      select extract(year from t.datum)::int
      into v_termin_jahr
      from nova_termindatenbank_data.td_termine t
      where t.id = p_termin;

      if v_termin_jahr is null then
        raise exception 'Der gewählte Termin wurde nicht gefunden';
      end if;
    end if;

    v_jahr := coalesce(v_termin_jahr, p_nummernjahr);
    if v_jahr is null or v_jahr < 2000 or v_jahr > 2099 then
      raise exception 'Ungültiges Nummernjahr: %', v_jahr;
    end if;

    v_nr := nova_termindatenbank_data.td_naechste_auftragsnummer(v_jahr);
  end if;

  insert into nova_termindatenbank_data.td_auftraege
    (auftragsnummer, jahr, bereich_id, termin_id)
  values
    (v_nr, v_jahr, p_bereich, p_termin)
  returning id into v_id;

  for e in
    select * from jsonb_array_elements(coalesce(p_arten, '[]'::jsonb))
  loop
    insert into nova_termindatenbank_data.td_unterauftraege
      (auftrag_id, suffix, art, umfang, proben_geplant)
    values (
      v_id,
      coalesce(e->>'suffix', ''),
      (e->>'art')::nova_termindatenbank_data.td_untersuchungsart,
      e->>'umfang',
      nullif(e->>'proben_geplant', '')::int
    );
  end loop;

  return jsonb_build_object('auftrag_id', v_id, 'nummer', v_nr);
end
$$;

revoke execute on function nova_termindatenbank_data.td_auftrag_anlegen(
  uuid, uuid, jsonb, text, int
) from public, anon;
grant execute on function nova_termindatenbank_data.td_auftrag_anlegen(
  uuid, uuid, jsonb, text, int
) to authenticated;
