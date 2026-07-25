import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Anlage, Auftrag, Bereich, Kunde, Termin, Untersuchungsart } from './types'

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
      unterauftraege: [
        { id: 'u1', auftrag_id: 'o1', suffix: '', art: 'legionellen', proben_geplant: 14, status: 'offen', ergebnis: 'offen' },
        { id: 'u2', auftrag_id: 'o1', suffix: 'M', art: 'mibi', umfang: 'inklusive Enterokokken', proben_geplant: 3, status: 'offen', ergebnis: 'offen' },
      ],
    },
    {
      id: 'o2', auftragsnummer: '26-0898', jahr: 2026, bereich_id: 'b2', termin_id: 't1', status: 'offen',
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
export const db = {
  async kunden(): Promise<Kunde[]> {
    if (!supabase) return demo.kunden
    const { data, error } = await supabase.from('td_kunden').select('*').order('name_kurz')
    if (error) throw error
    return data as Kunde[]
  },
  async anlagen(): Promise<Anlage[]> {
    if (!supabase) return demo.anlagen
    const { data, error } = await supabase.from('td_anlagen').select('*').order('name')
    if (error) throw error
    return data as Anlage[]
  },
  async bereiche(): Promise<Bereich[]> {
    if (!supabase) return demo.bereiche
    const { data, error } = await supabase.from('td_bereiche').select('*').order('name')
    if (error) throw error
    return data as Bereich[]
  },
  async termine(): Promise<Termin[]> {
    if (!supabase) return demo.termine
    const { data, error } = await supabase.from('td_termine').select('*, td_termin_probenehmer(profil_id, td_profile(anzeigename))').order('datum')
    if (error) throw error
    return (data as any[]).map(t => ({
      ...t,
      probenehmer: (t.termin_probenehmer ?? []).map((x: any) => x.profile?.anzeigename).filter(Boolean),
    })) as Termin[]
  },
  async auftraege(): Promise<Auftrag[]> {
    if (!supabase) return demo.auftraege
    const { data, error } = await supabase.from('td_auftraege').select('*, td_unterauftraege(*)').order('auftragsnummer', { ascending: false })
    if (error) throw error
    return data as unknown as Auftrag[]
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
  async bereichAnlegen(b: Omit<Bereich, 'id' | 'aktiv'>): Promise<void> {
    if (!supabase) { demo.bereiche.push({ ...b, id: 'b' + (demo.bereiche.length + 1), aktiv: true }); return }
    const { error } = await supabase.from('td_bereiche').insert(b)
    if (error) throw error
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

  /** Legt für einen Bereich einen Hauptauftrag mit zentral vergebener Nummer + Unteraufträgen an. */
  async auftragAnlegen(bereichId: string, terminId: string | undefined, arten: {
    art: Untersuchungsart; suffix: string; umfang?: string; proben_geplant?: number
  }[]): Promise<string> {
    if (!supabase) {
      const jahr = new Date().getFullYear()
      demo.zaehler[jahr] = (demo.zaehler[jahr] ?? 0) + 1
      const nr = `${String(jahr % 100).padStart(2, '0')}-${String(demo.zaehler[jahr]).padStart(4, '0')}`
      const id = 'o' + (demo.auftraege.length + 1)
      demo.auftraege.push({
        id, auftragsnummer: nr, jahr, bereich_id: bereichId, termin_id: terminId, status: 'offen',
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
    })
    if (error) throw error
    return data as string
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

  async importStaging(quelle: string, typ: string, zeilen: unknown[]): Promise<number> {
    if (!supabase) return zeilen.length
    const { error } = await supabase.from('td_staging_import').insert(
      zeilen.map(r => ({ quelle, typ, rohdaten: r })),
    )
    if (error) throw error
    return zeilen.length
  },
}
