import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Anlage, Auftrag, Bereich, FachlicheUntersuchungsart, Kunde, Termin, Untersuchungsart, Untersuchungsbewertung, Ueberschreitungsphase } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient<any, any, any> | null = url && key
  ? createClient(url, key, { db: { schema: 'nova_termindatenbank_data' } })
  : null
export const demoModus = !supabase

// ------------------------------------------------------------------
// Demo-Daten (nur Anzeige-Skelett; entspricht 0002_sample_data.sql)
// ------------------------------------------------------------------
const demo = {
  kunden: [
    { id: 'k1', name_lang: 'Augusta Hausverwaltung GmbH & Co. KG', name_kurz: 'Augusta', typ: 'hausverwaltung', strasse: 'Maximilianstr. 12', plz: '86150', ort: 'Augsburg', telefon: '0821 123456', email: 'info@augusta-hv.de', aktiv: true },
    { id: 'k2', name_lang: 'AIC-Hausverwaltung GmbH', name_kurz: 'AIC', typ: 'hausverwaltung', strasse: 'Ludwigstr. 3', plz: '86551', ort: 'Aichach', telefon: '08251 998877', email: 'kontakt@aic-hv.de', aktiv: true },
    { id: 'k3', name_lang: 'Familie Weber', name_kurz: 'Weber', typ: 'privatkunde', strasse: 'Am Kirchberg 7', plz: '86453', ort: 'Dasing', email: 'weber@example.de', aktiv: true },
  ] as Kunde[],
  anlagen: [
    { id: 'a1', kunde_id: 'k1', name: 'Straßbergerstr. 11–47', strasse: 'Straßbergerstr. 11–47', plz: '80809', ort: 'München', turnus_monate: 36, naechste_untersuchung: '2026-08-15', aktiv: true },
    { id: 'a2', kunde_id: 'k2', name: 'Auf dem Kreuz 4–8, 6a–c', strasse: 'Auf dem Kreuz 4–8', plz: '86152', ort: 'Augsburg', turnus_monate: 36, naechste_untersuchung: '2027-08-12', aktiv: true },
    { id: 'a3', kunde_id: 'k3', name: 'Einfamilienhaus Weber', strasse: 'Am Kirchberg 7', plz: '86453', ort: 'Dasing', turnus_monate: 36, naechste_untersuchung: '2026-10-01', aktiv: true },
  ] as Anlage[],
  bereiche: [
    { id: 'b1', anlage_id: 'a1', name: 'Haus 3–5', beschreibung: 'WW-System Häuser 3 bis 5', aktiv: true },
    { id: 'b2', anlage_id: 'a1', name: 'Haus 7', beschreibung: 'Eigenständiges WW-System Haus 7', aktiv: true },
    { id: 'b3', anlage_id: 'a2', name: 'Hauptgebäude', aktiv: true },
    { id: 'b4', anlage_id: 'a3', name: 'Wohnhaus', beschreibung: 'Privatkunde, ein WW-System', aktiv: true },
  ] as Bereich[],
  termine: [
    { id: 't1', kunde_id: 'k1', anlage_id: 'a1', datum: '2026-08-04', beginn: '09:30', ende: '14:00', status: 'bestaetigt', probenehmer: ['M. Huber'], kalender_exportiert: false },
    { id: 't2', kunde_id: 'k3', anlage_id: 'a3', datum: '2026-08-11', beginn: '08:00', ende: '09:30', status: 'geplant', probenehmer: [], kalender_exportiert: false },
  ] as Termin[],
  auftraege: [
    {
      id: 'o1', auftragsnummer: '26-0897', jahr: 2026, bereich_id: 'b1', termin_id: 't1', status: 'offen',
      fachliche_untersuchungsart: 'regeluntersuchung',
      unterauftraege: [
        { id: 'u1', auftrag_id: 'o1', suffix: '', art: 'legionellen', proben_geplant: 14, status: 'offen', ergebnis: 'offen' },
        { id: 'u2', auftrag_id: 'o1', suffix: 'M', art: 'mibi', umfang: 'inklusive Enterokokken', proben_geplant: 3, status: 'offen', ergebnis: 'offen' },
      ],
    },
    {
      id: 'o2', auftragsnummer: '26-0898', jahr: 2026, bereich_id: 'b2', termin_id: 't1', status: 'offen',
      fachliche_untersuchungsart: 'regeluntersuchung',
      unterauftraege: [
        { id: 'u3', auftrag_id: 'o2', suffix: '', art: 'legionellen', proben_geplant: 6, status: 'offen', ergebnis: 'offen' },
      ],
    },
  ] as Auftrag[],
  zaehler: { 2026: 898 } as Record<number, number>,
}

// ------------------------------------------------------------------
// Einheitliche Datenzugriffs-Schicht.
// Im Demo-Modus in-memory; mit Supabase über Tabellen/RPCs aus 0001_init.sql.
// ------------------------------------------------------------------
/** Lädt ALLE Zeilen einer Tabelle in 1000er-Seiten (Supabase-API-Limit pro Abfrage). */
async function alleZeilen<T>(tabelle: string, spalten: string, sortierung: string): Promise<T[]> {
  const ergebnis: T[] = []
  for (let von = 0; ; von += 1000) {
    const { data, error } = await supabase!
      .from(tabelle).select(spalten).order(sortierung).range(von, von + 999)
    if (error) throw error
    ergebnis.push(...(data as T[]))
    if ((data as T[]).length < 1000) break
  }
  return ergebnis
}

export const db = {
  async kunden(): Promise<Kunde[]> {
    if (!supabase) return demo.kunden
    return alleZeilen<Kunde>('td_kunden', '*', 'name_kurz')
  },
  async anlagen(): Promise<Anlage[]> {
    if (!supabase) return demo.anlagen
    return alleZeilen<Anlage>('td_anlagen', '*', 'name')
  },
  async bereiche(): Promise<Bereich[]> {
    if (!supabase) return demo.bereiche
    return alleZeilen<Bereich>('td_bereiche', '*', 'name')
  },
  async termine(): Promise<Termin[]> {
    if (!supabase) return demo.termine
    const zeilen = await alleZeilen<any>('td_termine',
      '*, termin_probenehmer:td_termin_probenehmer(profil_id, profile:td_profile(anzeigename))', 'datum')
    return zeilen.map(t => ({
      ...t,
      probenehmer: (t.termin_probenehmer ?? []).map((x: any) => x.profile?.anzeigename).filter(Boolean),
    })) as Termin[]
  },
  async auftraege(): Promise<Auftrag[]> {
    if (!supabase) return demo.auftraege
    const zeilen: Auftrag[] = []
    for (let von = 0; ; von += 1000) {
      const { data, error } = await supabase.from('td_auftraege')
        .select('*, unterauftraege:td_unterauftraege(*)')
        .order('auftragsnummer', { ascending: false }).range(von, von + 999)
      if (error) throw error
      zeilen.push(...(data as unknown as Auftrag[]))
      if ((data as any[]).length < 1000) break
    }
    return zeilen
  },

  async kundeAnlegen(k: Omit<Kunde, 'id' | 'aktiv'>): Promise<void> {
    if (!supabase) { demo.kunden.push({ ...k, id: 'k' + (demo.kunden.length + 1), aktiv: true }); return }
    const { error } = await supabase.from('td_kunden').insert(k)
    if (error) throw error
  },
  async anlageAnlegen(a: Omit<Anlage, 'id' | 'aktiv'>): Promise<void> {
    if (!supabase) { demo.anlagen.push({ ...a, id: 'a' + (demo.anlagen.length + 1), aktiv: true }); return }
    const { error } = await supabase.from('td_anlagen').insert(a)
    if (error) throw error
  },
  async anlageAnlegenRueckgabe(a: Omit<Anlage, 'id' | 'aktiv'>): Promise<string> {
    if (!supabase) {
      const id = 'a' + (demo.anlagen.length + 1)
      demo.anlagen.push({ ...a, id, aktiv: true })
      return id
    }
    const { data, error } = await supabase.from('td_anlagen').insert(a).select('id').single()
    if (error) throw error
    return data.id
  },
  async bereichAnlegen(b: Omit<Bereich, 'id' | 'aktiv'>): Promise<void> {
    if (!supabase) { demo.bereiche.push({ ...b, id: 'b' + (demo.bereiche.length + 1), aktiv: true }); return }
    const { error } = await supabase.from('td_bereiche').insert(b)
    if (error) throw error
  },
  async bereichAktualisieren(id: string, patch: Partial<Pick<Bereich,
    'name' | 'beschreibung' | 'wwb_details' | 'strasse' | 'hausnummer' | 'notizen' |
    'turnus_monate' | 'turnus_art' | 'turnus_begruendung' | 'naechste_untersuchung' |
    'proben_anzahl' | 'planungsnotiz' | 'betreuungsstatus' |
    'standard_legionellen' | 'standard_mibi' | 'standard_mibi_umfang' | 'standard_chemie'
  >>): Promise<void> {
    if (!supabase) { const b = demo.bereiche.find(x => x.id === id); if (b) Object.assign(b, patch); return }
    const { error } = await supabase.from('td_bereiche').update(patch).eq('id', id)
    if (error) throw error
  },
  async bereichLoeschen(id: string): Promise<{ name: string; termine: number; auftraege: number; phasen: number }> {
    if (!supabase) return { name: 'Demo-Bereich', termine: 0, auftraege: 0, phasen: 0 }
    const { data, error } = await supabase.rpc('td_bereich_sicher_loeschen', {
      p_bereich: id, p_bestaetigung: 'BEREICH LÖSCHEN',
    })
    if (error) throw error
    return data as { name: string; termine: number; auftraege: number; phasen: number }
  },
  async terminAnlegen(t: Omit<Termin, 'id' | 'probenehmer' | 'kalender_exportiert'>): Promise<string> {
    if (!supabase) {
      const id = 't' + (demo.termine.length + 1)
      demo.termine.push({ ...t, id, probenehmer: [], kalender_exportiert: false })
      return id
    }
    const { data, error } = await supabase.from('td_termine').insert(t).select('id').single()
    if (error) throw error
    return data.id
  },
  async terminAktualisieren(id: string, patch: Partial<Pick<Termin,
    'datum' | 'status' | 'fachliche_untersuchungsart' | 'historie_einordnung' |
    'befund' | 'pruefbericht_nummer' | 'pruefbericht_datum' | 'historie_bemerkung' | 'notizen'
  >>): Promise<void> {
    if (!supabase) {
      const t = demo.termine.find(x => x.id === id)
      if (t) Object.assign(t, patch)
      return
    }
    const { error } = await supabase.from('td_termine').update(patch).eq('id', id)
    if (error) throw error
  },
  async terminLoeschen(id: string): Promise<void> {
    if (!supabase) return
    const { error } = await supabase.from('td_termine').delete().eq('id', id)
    if (error) throw error
  },

  /** Vorschau der nächsten Auftragsnummer (ohne sie zu verbrauchen). */
  async nummerVorschau(): Promise<string> {
    if (!supabase) {
      const jahr = new Date().getFullYear()
      const demoNaechste = ((demo as any).zaehler?.[jahr] ?? 0) + 1
      return `${String(jahr % 100).padStart(2, '0')}-${String(demoNaechste).padStart(4, '0')}`
    }
    const { data, error } = await supabase.rpc('td_nummer_vorschau')
    if (error) throw error
    return data as string
  },

  /** Legt für einen Bereich einen Hauptauftrag mit zentral vergebener Nummer + Unteraufträgen an.
   *  nummerManuell: optionaler manueller Eingriff (Format JJ-NNNN, Eindeutigkeit wird geprüft,
   *  der Zähler wird nachgezogen, damit die Automatik nie kollidiert). */
  async auftragAnlegen(bereichId: string, terminId: string | undefined, arten: {
    art: Untersuchungsart; suffix: string; umfang?: string; proben_geplant?: number
  }[], nummerManuell?: string, fachlicheArt?: FachlicheUntersuchungsart): Promise<string> {
    if (!supabase) {
      const jahr = new Date().getFullYear()
      demo.zaehler[jahr] = (demo.zaehler[jahr] ?? 0) + 1
      const nr = `${String(jahr % 100).padStart(2, '0')}-${String(demo.zaehler[jahr]).padStart(4, '0')}`
      const id = 'o' + (demo.auftraege.length + 1)
      demo.auftraege.push({
        id, auftragsnummer: nr, jahr, bereich_id: bereichId, termin_id: terminId, status: 'offen',
        fachliche_untersuchungsart: fachlicheArt,
        unterauftraege: arten.map((x, i) => ({
          id: id + '-u' + i, auftrag_id: id, suffix: x.suffix, art: x.art,
          umfang: x.umfang, proben_geplant: x.proben_geplant, status: 'offen', ergebnis: 'offen',
        })),
      })
      return nr
    }
    const { data, error } = await supabase.rpc('td_auftrag_anlegen', {
      p_bereich: bereichId, p_termin: terminId ?? null,
      p_arten: arten.map(a => ({ ...a, umfang: a.umfang ?? null, proben_geplant: a.proben_geplant ?? null })),
      p_nummer_manuell: nummerManuell?.trim() || null,
    })
    if (error) throw error
    const nr = (data as any).nummer as string
    if (fachlicheArt) {
      const { error: fachFehler } = await supabase.from('td_auftraege')
        .update({ fachliche_untersuchungsart: fachlicheArt })
        .eq('auftragsnummer', nr)
      if (fachFehler) throw fachFehler
    }
    return nr
  },

  async unterauftragAktualisieren(id: string, patch: Partial<{ proben_ist: number; status: string; ergebnis: string; notizen: string }>): Promise<void> {
    if (!supabase) {
      for (const a of demo.auftraege) {
        const u = a.unterauftraege.find(x => x.id === id)
        if (u) Object.assign(u, patch)
      }
      return
    }
    const { error } = await supabase.from('td_unterauftraege').update(patch).eq('id', id)
    if (error) throw error
  },

  async auftragAktualisieren(id: string, patch: Partial<{ fachliche_untersuchungsart: FachlicheUntersuchungsart; notizen: string }>): Promise<void> {
    if (!supabase) {
      const a = demo.auftraege.find(x => x.id === id)
      if (a) Object.assign(a, patch)
      return
    }
    const { error } = await supabase.from('td_auftraege').update(patch).eq('id', id)
    if (error) throw error
  },

  async bewertungenFuerUnterauftraege(ids: string[]): Promise<Untersuchungsbewertung[]> {
    if (!ids.length || !supabase) return []
    const { data, error } = await supabase.from('td_untersuchungsbewertungen').select('*').in('unterauftrag_id', ids)
    if (error) throw error
    return data as Untersuchungsbewertung[]
  },
  async bewertungSpeichern(eintrag: Omit<Untersuchungsbewertung, 'id'>): Promise<Untersuchungsbewertung> {
    if (!supabase) return { id: 'bewertung-demo-' + eintrag.unterauftrag_id, ...eintrag }
    const { data, error } = await supabase.from('td_untersuchungsbewertungen')
      .upsert(eintrag, { onConflict: 'unterauftrag_id' }).select('*').single()
    if (error) throw error
    return data as Untersuchungsbewertung
  },
  async phasenFuerBereich(bereichId: string): Promise<Ueberschreitungsphase[]> {
    if (!supabase) return []
    const { data, error } = await supabase.from('td_ueberschreitungsphasen').select('*')
      .eq('bereich_id', bereichId).order('eroeffnet_am', { ascending: false })
    if (error) throw error
    return data as Ueberschreitungsphase[]
  },
  async phasen(): Promise<Ueberschreitungsphase[]> {
    if (!supabase) return []
    const { data, error } = await supabase.from('td_ueberschreitungsphasen').select('*').order('eroeffnet_am', { ascending: false })
    if (error) throw error
    return data as Ueberschreitungsphase[]
  },
  async bewertungenFuerPhase(phaseId: string): Promise<Untersuchungsbewertung[]> {
    if (!supabase) return []
    const { data, error } = await supabase.from('td_untersuchungsbewertungen').select('*').eq('phase_id', phaseId)
      .order('bewertungsdatum', { ascending: true })
    if (error) throw error
    return data as Untersuchungsbewertung[]
  },
  async phaseAnlegen(eintrag: Omit<Ueberschreitungsphase, 'id'>): Promise<Ueberschreitungsphase> {
    if (!supabase) return { id: 'phase-demo-' + Date.now(), ...eintrag }
    const { data, error } = await supabase.from('td_ueberschreitungsphasen').insert(eintrag).select('*').single()
    if (error) throw error
    return data as Ueberschreitungsphase
  },
  async phaseAktualisieren(id: string, patch: Partial<Omit<Ueberschreitungsphase, 'id' | 'bereich_id' | 'ausloesende_bewertung_id'>>): Promise<void> {
    if (!supabase) return
    const { error } = await supabase.from('td_ueberschreitungsphasen').update(patch).eq('id', id)
    if (error) throw error
  },

  /** Setzt alle operativen Daten zurück (nur Admin, Testphase). */
  async resetAlleDaten(zaehlerZuruecksetzen = false): Promise<string> {
    if (!supabase) return 'Demo-Modus: nichts zurückzusetzen.'
    const { data, error } = await supabase.rpc('td_reset_alle_daten', {
      p_zaehler_zuruecksetzen: zaehlerZuruecksetzen,
    })
    if (error) throw error
    return data as string
  },

  /** Übernimmt die Alt-Daten in Kunden/Anlagen/Bereiche/Termine. */
  async legacyUebernehmen(v: import('./legacyImport').ImportVorschau,
                          fortschritt?: (text: string) => void): Promise<string> {
    if (!supabase) return 'Demo-Modus: Übernahme nur mit Supabase möglich.'

    fortschritt?.(`Kunden werden übernommen (${v.kunden.length}) …`)
    const { error: e1 } = await supabase.from('td_kunden').upsert(
      v.kunden.map(k => ({ ...k, legacy_quelle: 'Terminverwaltung V4' })),
      { onConflict: 'legacy_id' })
    if (e1) throw e1

    const kundenDb = await alleZeilen<any>('td_kunden', 'id, legacy_id', 'id')
    const kundeId = new Map(kundenDb.map(k => [k.legacy_id, k.id]))

    fortschritt?.(`Anlagen werden übernommen (${v.anlagen.length}) …`)
    for (let i = 0; i < v.anlagen.length; i += 500) {
      const teil = v.anlagen.slice(i, i + 500).map(a => ({
        legacy_id: a.legacy_id, kunde_id: kundeId.get(a.kunde_legacy), name: a.name,
        plz: a.plz, ort: a.ort, objekt_referenz: a.objekt_referenz,
        turnus_monate: a.turnus_monate, naechste_untersuchung: a.naechste_untersuchung,
        notizen: a.notizen, planungsnotiz: (a as any).planungsnotiz ?? null,
        proben_anzahl: (a as any).proben_anzahl ?? null,
        legacy_quelle: 'Terminverwaltung V4',
      })).filter(a => a.kunde_id)
      const { error } = await supabase.from('td_anlagen').upsert(teil, { onConflict: 'legacy_id' })
      if (error) throw error
      fortschritt?.(`Anlagen: ${Math.min(i + 500, v.anlagen.length)} / ${v.anlagen.length}`)
    }

    const anlagenDb = await alleZeilen<any>('td_anlagen', 'id, legacy_id, name', 'id')
    const anlageId = new Map(anlagenDb.map(a => [a.legacy_id, a.id]))
    const anlageZuKunde = new Map(v.anlagen.map(a => [a.legacy_id, a.kunde_legacy]))

    // Jeder Import-Datensatz bekommt sofort einen stabilen Bereich. Dadurch
    // bleiben Alt-/Neubau und mehrere WWB bereits vor späteren Merges trennbar.
    fortschritt?.(`Untersuchungsbereiche werden übernommen (${v.bereiche.length}) …`)
    for (let i = 0; i < v.bereiche.length; i += 500) {
      const teil = v.bereiche.slice(i, i + 500).map(b => ({
        legacy_id: b.legacy_id,
        anlage_id: anlageId.get(b.anlage_legacy),
        name: b.name,
        beschreibung: 'Aus Altbestand eindeutig übernommen',
        turnus_monate: b.turnus_monate,
        naechste_untersuchung: b.naechste_untersuchung,
        proben_anzahl: b.proben_anzahl,
        legacy_quelle: 'Terminverwaltung V4',
      })).filter(b => b.anlage_id)
      const { error } = await supabase.from('td_bereiche').upsert(teil, { onConflict: 'legacy_id' })
      if (error) throw error
    }
    const bereicheDb = await alleZeilen<any>('td_bereiche', 'id, legacy_id, anlage_id', 'id')
    const bereichId = new Map(bereicheDb.map(b => [b.legacy_id, b.id]))

    fortschritt?.(`Historische Termine werden übernommen (${v.termine.length}) …`)
    let termineOk = 0
    for (let i = 0; i < v.termine.length; i += 500) {
      const teil = v.termine.slice(i, i + 500).map(t => {
        const aid = anlageId.get(t.anlage_legacy)
        const kid = kundeId.get(anlageZuKunde.get(t.anlage_legacy) ?? '')
        return aid && kid ? {
          legacy_id: t.legacy_id, anlage_id: aid, kunde_id: kid,
          bereich_id: bereichId.get(t.bereich_legacy) ?? null,
          datum: t.datum,
          status: (t as any).geplant ? 'geplant' : 'abgeschlossen',
          historie_einordnung: (t as any).geplant ? 'regulaer' : 'unbekannt',
          notizen: (t as any).geplant ? 'Geplanter Termin aus Altbestand' : 'Historischer Termin aus Altbestand',
          legacy_quelle: 'Terminverwaltung V4',
        } : null
      }).filter((x): x is NonNullable<typeof x> => !!x)
      if (teil.length) {
        const { error } = await supabase.from('td_termine').upsert(teil, { onConflict: 'legacy_id' })
        if (error) throw error
        termineOk += teil.length
      }
      fortschritt?.(`Termine: ${Math.min(i + 500, v.termine.length)} / ${v.termine.length}`)
    }

    return `Übernommen: ${v.kunden.length} Kunden, ${v.anlagen.length} Anlagen, ${v.bereiche.length} Bereiche, ${termineOk} historische Termine.`
  },

  /** Trägt aus einer erneut geladenen Alt-JSON nur fehlende historische Termine nach.
   *  Kunden/Anlagen/Bereiche werden dabei nicht verändert. */
  async legacyHistorieNachtragen(v: import('./legacyImport').ImportVorschau,
                                fortschritt?: (text: string) => void): Promise<string> {
    if (!supabase) return 'Demo-Modus: Nachtrag nur mit Supabase möglich.'

    fortschritt?.(`Historie wird nachgetragen (${v.termine.length}) …`)
    let meldungen: string[] = []
    for (let i = 0; i < v.termine.length; i += 500) {
      const { data, error } = await supabase.rpc('td_legacy_historie_nachtragen', {
        p_termine: v.termine.slice(i, i + 500),
      })
      if (error) throw error
      meldungen.push(data as string)
      fortschritt?.(`Historie: ${Math.min(i + 500, v.termine.length)} / ${v.termine.length}`)
    }

    return meldungen.length === 1 ? meldungen[0] : meldungen.join(' · ')
  },

  async anlageAktualisieren(id: string, patch: Partial<Pick<Anlage, 'name' | 'strasse' | 'plz' | 'ort' | 'notizen' | 'naechste_untersuchung' | 'turnus_monate' | 'aktiv' | 'objekt_betreuer' | 'proben_anzahl'>> & { planungsnotiz?: string | null }): Promise<void> {
    if (!supabase) { const a = demo.anlagen.find(x => x.id === id); if (a) Object.assign(a, patch); return }
    const { error } = await supabase.from('td_anlagen').update(patch).eq('id', id)
    if (error) throw error
  },

  async kundeAktualisieren(id: string, patch: Partial<Pick<Kunde, 'name_lang' | 'name_kurz' | 'telefon' | 'email' | 'notizen' | 'aktiv'>>): Promise<void> {
    if (!supabase) { const k = demo.kunden.find(x => x.id === id); if (k) Object.assign(k, patch); return }
    const { error } = await supabase.from('td_kunden').update(patch).eq('id', id)
    if (error) throw error
  },

  async anlagenZusammenfuehren(zielId: string, quellenIds: string[]): Promise<string> {
    if (!supabase) return 'Demo-Modus: Zusammenführen nur mit Supabase.'
    const { data, error } = await supabase.rpc('td_anlagen_zusammenfuehren', { p_ziel: zielId, p_quellen: quellenIds })
    if (error) throw error
    return data as string
  },

  async kundenZusammenfuehren(zielId: string, quellenIds: string[]): Promise<string> {
    if (!supabase) return 'Demo-Modus: Zusammenführen nur mit Supabase.'
    const { data, error } = await supabase.rpc('td_kunden_zusammenfuehren', { p_ziel: zielId, p_quellen: quellenIds })
    if (error) throw error
    return data as string
  },

  async kundenAlsAnlagenUebernehmen(zielId: string, quellenIds: string[]): Promise<string> {
    if (!supabase) return 'Demo-Modus: Übernahme nur mit Supabase.'
    const { data, error } = await supabase.rpc('td_kunden_als_anlagen_uebernehmen', { p_ziel: zielId, p_quellen: quellenIds })
    if (error) throw error
    return data as string
  },

  async verwalterWechseln(anlageId: string, neuerKundeId: string): Promise<string> {
    if (!supabase) return 'Demo-Modus: Verwalterwechsel nur mit Supabase möglich.'
    const { data, error } = await supabase.rpc('td_anlage_verwalter_wechseln', { p_anlage: anlageId, p_neuer_kunde: neuerKundeId })
    if (error) throw error
    return data as string
  },

  async historieNachzuordnen(): Promise<string> {
    if (!supabase) return 'Demo-Modus.'
    const { data, error } = await supabase.rpc('td_historie_nachzuordnen')
    if (error) throw error
    return data as string
  },

  async importStaging(quelle: string, typ: string, zeilen: unknown[]): Promise<number> {
    if (!supabase) return zeilen.length
    const { error } = await supabase.from('td_staging_import').insert(
      zeilen.map(r => ({ quelle, typ, rohdaten: r })),
    )
    if (error) throw error
    return zeilen.length
  },
}
