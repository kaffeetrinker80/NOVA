-- Technische Merge-Hinweise auch dann entfernen, wenn davor bereits ein
-- eigener mehrzeiliger Hinweis steht. Eigene Texte bleiben erhalten.
update nova_termindatenbank_data.td_anlagen
   set notizen = nova_termindatenbank_data.td_text_ohne_merge_hinweise(notizen)
 where coalesce(notizen, '') like '%Früherer Anlagenname vor Übernahme:%'
    or coalesce(notizen, '') like '%Aus bisherigem Einzelkunden übernommen:%'
    or coalesce(notizen, '') like '%Aus Anlagen-Merge erstellt:%';
