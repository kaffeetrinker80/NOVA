-- Legt Profile für Auth-Nutzer nach, die bereits vor dieser App in Supabase Auth
-- angelegt wurden (der automatische Trigger greift nur bei künftigen Neuanmeldungen).
-- Alle erhalten zunächst die Rolle 'lesend' — Admin danach gezielt hochstufen:
--   update nova_termindatenbank_data.td_profile set rolle = 'admin' where anzeigename = '...';

insert into nova_termindatenbank_data.td_profile (id, anzeigename, rolle)
select u.id, split_part(u.email, '@', 1), 'lesend'
from auth.users u
left join nova_termindatenbank_data.td_profile p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
