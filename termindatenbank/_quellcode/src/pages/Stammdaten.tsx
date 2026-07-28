import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type {
  Anlage, Auftrag, Befund, Bereich, FachlicheUntersuchungsart, Kunde, Kundentyp,
  Turnusart, Ueberschreitungsphase,
} from '../lib/types'
import { BEFUND_LABEL, ERGEBNIS_LABEL, FACHLICHE_ART_LABEL, fmtDatum, kundeAnzeige } from '../lib/types'
import BerichtModal from '../components/BerichtModal'
import HistorieModal from '../components/HistorieModal'
import PhaseModal from '../components/PhaseModal'
import { Meldung } from '../components/ui'

const TYP: Record<Kundentyp, string> = {
  hausverwaltung: 'Hausverwaltung', pflegetraeger: 'Pflegeträger',
  wohnungsbau: 'Wohnungsbau', privatkunde: 'Privatkunde', sonstige: 'Sonstige',
}

const PHASE_TEXT: Record<Ueberschreitungsphase['status'], string> = {
  aktiv: 'Überschreitung offen',
  massnahmen_laufen: 'Maßnahmen laufen',
  nachuntersuchung: 'NU-Phase',
  regelturnus_bestaetigt: 'Regelturnus bestätigt',
  abgeschlossen: 'Phase abgeschlossen',
}

function bereichAnsicht(b: Bereich) {
  const titel = b.name.endsWith(' – Gesamtanlage') ? b.name.replace(/ – Gesamtanlage$/, '') : b.name
  const mergeHinweis = b.legacy_quelle === 'Anlagen-Zusammenführung'
    || b.name.endsWith(' – Gesamtanlage')
    || (b.beschreibung ?? '').includes('Übernommen aus früherer Anlage:')
    || (b.beschreibung ?? '').includes('Zielanlage beim Anlagen-Merge')
  return { titel, uebernommen: mergeHinweis }
}

type NeuerBereichForm = {
  name: string
  turnus_monate: string
  proben_anzahl: string
  standard_legionellen: boolean
  standard_mibi: boolean
  standard_mibi_umfang: 'Standard' | 'Komplett' | 'inklusive Enterokokken'
  standard_chemie: boolean
  pruefbericht_nummer: string
  pruefbericht_datum: string
  letzte_untersuchung: string
  fachliche_untersuchungsart: FachlicheUntersuchungsart
  befund: Befund
  naechste_untersuchung: string
  notizen: string
}

const neuerBereichForm = (name = 'Gesamtanlage'): NeuerBereichForm => ({
  name, turnus_monate: '', proben_anzahl: '',
  standard_legionellen: true, standard_mibi: false,
  standard_mibi_umfang: 'Standard', standard_chemie: false,
  pruefbericht_nummer: '', pruefbericht_datum: '', letzte_untersuchung: '',
  fachliche_untersuchungsart: 'orientierend', befund: 'offen',
  naechste_untersuchung: '', notizen: '',
})

function datumVerschieben(iso: string, tage = 0, monate = 0) {
  if (!iso) return ''
  const datum = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(datum.getTime())) return ''
  if (tage) datum.setUTCDate(datum.getUTCDate() + tage)
  if (monate) {
    const tag = datum.getUTCDate()
    datum.setUTCDate(1)
    datum.setUTCMonth(datum.getUTCMonth() + monate)
    const letzterTag = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth() + 1, 0)).getUTCDate()
    datum.setUTCDate(Math.min(tag, letzterTag))
  }
  return datum.toISOString().slice(0, 10)
}

export default function Stammdaten() {
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [suche, setSuche] = useState('')
  const [kundeId, setKundeId] = useState('')
  const [anlageId, setAnlageId] = useState('')

  // Inline-Neuanlage
  const [neuKunde, setNeuKunde] = useState(false)
  const [kf, setKf] = useState({ name_lang: '', name_kurz: '', typ: 'hausverwaltung' as Kundentyp, telefon: '', email: '', ort: '' })
  const [neuAnlage, setNeuAnlage] = useState(false)
  const [af, setAf] = useState({ name: '', strasse: '', plz: '', ort: '', notizen: '' })
  const [neueAnlageBereiche, setNeueAnlageBereiche] = useState<NeuerBereichForm[]>([neuerBereichForm()])
  const [anlageWirdAngelegt, setAnlageWirdAngelegt] = useState(false)
  const [neuBereichName, setNeuBereichName] = useState('')

  // Übernahme-Modus: bisherige Einzelkunden werden als Anlagen unter einen Zielkunden gehängt.
  const [mergeModus, setMergeModus] = useState(false)
  const [mergeWahl, setMergeWahl] = useState<Set<string>>(new Set())
  const [mergeZiel, setMergeZiel] = useState('')
  const [mergeZielSuche, setMergeZielSuche] = useState('')
  const [mergeNeu, setMergeNeu] = useState(false)          // Ziel = neuer Kunde
  const [mergeNeuName, setMergeNeuName] = useState({ kurz: '', lang: '' })
  const [meldung, setMeldung] = useState('')

  // Anlagen-Detailbearbeitung
  const [notiz, setNotiz] = useState('')
  const [planungsnotiz, setPlanungsnotiz] = useState('')
  const [neuerVerwalter, setNeuerVerwalter] = useState('')
  const [anlageName, setAnlageName] = useState('')
  const [adresse, setAdresse] = useState({ strasse: '', plz: '', ort: '' })
  const [betreuer, setBetreuer] = useState('')

  // Anlagen zusammenführen
  const [aMergeModus, setAMergeModus] = useState(false)
  const [aMergeWahl, setAMergeWahl] = useState<Set<string>>(new Set())
  const [aMergeName, setAMergeName] = useState('')

  // Kunden umbenennen
  const [kName, setKName] = useState({ kurz: '', lang: '' })
  const [inaktiveAnzeigen, setInaktiveAnzeigen] = useState(false)
  const [inaktiveKunden, setInaktiveKunden] = useState(false)
  const [historieOffen, setHistorieOffen] = useState(false)
  const [historieBereich, setHistorieBereich] = useState<string | undefined>(undefined)
  const [bereichId, setBereichId] = useState('')
  const [bf, setBf] = useState({
    name: '', strasse: '', hausnummer: '', wwb_details: '', notizen: '',
    turnus_art: 'regelturnus' as Turnusart, turnus_monate: '', naechste_untersuchung: '',
    proben_anzahl: '', turnus_begruendung: '',
    standard_legionellen: true, standard_mibi: false,
    standard_mibi_umfang: 'Standard' as 'Standard' | 'Komplett' | 'inklusive Enterokokken',
    standard_chemie: false,
  })
  const [termine, setTermine] = useState<import('../lib/types').Termin[]>([])
  const [auftraege, setAuftraege] = useState<import('../lib/types').Auftrag[]>([])
  const [phasen, setPhasen] = useState<Ueberschreitungsphase[]>([])
  const [berichtAuftrag, setBerichtAuftrag] = useState<Auftrag | null>(null)
  const [phaseBearbeiten, setPhaseBearbeiten] = useState<Ueberschreitungsphase | null>(null)

  const laden = () => {
    db.kunden().then(setKunden); db.anlagen().then(setAnlagen); db.bereiche().then(setBereiche)
    db.termine().then(setTermine); db.auftraege().then(setAuftraege)
    db.phasen().then(setPhasen).catch(() => setPhasen([]))
  }
  useEffect(laden, [])

  const kundenGefiltert = useMemo(() => {
    const q = suche.toLowerCase()
    return kunden
      .filter(k => (inaktiveKunden || k.aktiv)
        && (!q || k.name_lang.toLowerCase().includes(q) || k.name_kurz.toLowerCase().includes(q)))
      .sort((a, b) => a.name_lang.localeCompare(b.name_lang, 'de'))
  }, [kunden, suche, inaktiveKunden])

  const kunde = kunden.find(k => k.id === kundeId)

  const mergeToggle = (id: string) => setMergeWahl(w => {
    const n = new Set(w)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const kundenMergeModusSchalten = () => {
    if (mergeModus) {
      setMergeModus(false); setMergeWahl(new Set()); setMergeZiel('')
      setMergeZielSuche('')
      setMergeNeu(false); setMergeNeuName({ kurz: '', lang: '' })
      return
    }
    setMergeModus(true)
    setMergeWahl(new Set(kundeId ? [kundeId] : []))
    setMergeZiel('')
    setMergeZielSuche('')
    setMergeNeu(false)
    setMergeNeuName({ kurz: '', lang: '' })
  }

  const zusammenfuehren = async () => {
    let ziel: string
    let quellen: string[]
    if (mergeNeu) {
      if (!mergeNeuName.lang.trim() || mergeWahl.size < 1) return
      await db.kundeAnlegen({ name_lang: mergeNeuName.lang.trim(), name_kurz: mergeNeuName.kurz.trim(), typ: 'hausverwaltung' })
      const alle = await db.kunden()
      const neu = [...alle].reverse().find(k => k.name_lang === mergeNeuName.lang.trim())
      if (!neu) { setMeldung('Neuer Kunde konnte nicht angelegt werden.'); return }
      ziel = neu.id
      quellen = [...mergeWahl]
    } else {
      ziel = mergeZiel
      quellen = [...mergeWahl].filter(id => id !== ziel)
      if (!ziel || quellen.length === 0) return
    }
    try {
      const erg = await db.kundenAlsAnlagenUebernehmen(ziel, quellen)
      setMeldung(erg + ' Der Zielkunde bleibt links; die Quellkunden stehen rechts als Anlagen/Objekte.')
      setMergeModus(false); setMergeWahl(new Set()); setMergeZiel('')
      setMergeZielSuche('')
      setMergeNeu(false); setMergeNeuName({ kurz: '', lang: '' })
      setKundeId(ziel); laden()
    } catch (e: any) { setMeldung('Fehler: ' + (e.message ?? e)) }
  }
  const anlagenDesKunden = anlagen.filter(a => a.kunde_id === kundeId && (inaktiveAnzeigen || a.aktiv))
  const bereich = bereiche.find(b => b.id === bereichId)
  useEffect(() => {
    const ansicht = bereich ? bereichAnsicht(bereich) : undefined
    setBf({
      name: ansicht?.titel ?? '', strasse: bereich?.strasse ?? '', hausnummer: bereich?.hausnummer ?? '',
      wwb_details: bereich?.wwb_details ?? '', notizen: bereich?.notizen ?? '',
      turnus_art: bereich?.turnus_art ?? 'regelturnus',
      turnus_monate: bereich?.turnus_monate != null ? String(bereich.turnus_monate) : '',
      naechste_untersuchung: bereich?.naechste_untersuchung ?? '',
      proben_anzahl: bereich?.proben_anzahl != null ? String(bereich.proben_anzahl) : '',
      turnus_begruendung: bereich?.turnus_begruendung ?? '',
      standard_legionellen: bereich?.standard_legionellen ?? true,
      standard_mibi: bereich?.standard_mibi ?? false,
      standard_mibi_umfang: bereich?.standard_mibi_umfang ?? 'Standard',
      standard_chemie: bereich?.standard_chemie ?? false,
    })
  }, [bereichId])
  const bereichSpeichernDetails = async () => {
    if (!bereich) return
    const ansicht = bereichAnsicht(bereich)
    const name = bf.name.trim() || ansicht.titel || bereich.name
    await db.bereichAktualisieren(bereich.id, {
      name, strasse: bf.strasse || undefined,
      hausnummer: bf.hausnummer || undefined, wwb_details: bf.wwb_details || undefined,
      notizen: bf.notizen || undefined,
      turnus_art: bf.turnus_art,
      turnus_monate: bf.turnus_monate ? +bf.turnus_monate : undefined,
      naechste_untersuchung: bf.naechste_untersuchung || undefined,
      proben_anzahl: bf.proben_anzahl ? +bf.proben_anzahl : undefined,
      turnus_begruendung: bf.turnus_begruendung || undefined,
      standard_legionellen: bf.standard_legionellen,
      standard_mibi: bf.standard_mibi,
      standard_mibi_umfang: bf.standard_mibi_umfang,
      standard_chemie: bf.standard_chemie,
    })
    setMeldung('Bereich gespeichert.'); laden()
  }
  const bereichEntfernen = async (id: string) => {
    const b = bereiche.find(x => x.id === id)
    const anzTermine = termine.filter(t => t.bereich_id === id).length
    const anzAuftraege = auftraege.filter(a => a.bereich_id === id).length
    const anzPhasen = phasen.filter(p => p.bereich_id === id).length
    const text = `ACHTUNG: Bereich „${b?.name ?? ''}“ dauerhaft löschen?\n\n` +
      `Dabei werden ${anzTermine} Termin(e), ${anzAuftraege} Auftrag/Aufträge und ${anzPhasen} Phase(n) dieses Bereichs gelöscht. Auftragsnummern werden nicht wiederverwendet.\n\nDieser Vorgang ist nicht rückgängig zu machen.`
    if (!window.confirm(text) || !window.confirm('Wirklich endgültig löschen?')) return
    try {
      const erg = await db.bereichLoeschen(id)
      if (bereichId === id) setBereichId('')
      setMeldung(`Bereich „${erg.name}“ mit ${erg.termine} Termin(en), ${erg.auftraege} Auftrag/Aufträgen und ${erg.phasen} Phase(n) gelöscht.`)
      laden()
    } catch (e: any) { setMeldung('Löschen fehlgeschlagen: ' + (e.message ?? e)) }
  }

  const anlage = anlagen.find(a => a.id === anlageId)
  useEffect(() => { setBereichId('') }, [anlageId])
  useEffect(() => {
    setNotiz(anlage?.notizen ?? ''); setPlanungsnotiz(anlage?.planungsnotiz ?? '')
    setNeuerVerwalter(''); setAnlageName(anlage?.name ?? '')
    setAdresse({ strasse: anlage?.strasse ?? '', plz: anlage?.plz ?? '', ort: anlage?.ort ?? '' })
    setBetreuer(anlage?.objekt_betreuer ?? '')
  }, [anlageId])
  useEffect(() => {
    setKName({ kurz: kunde?.name_kurz ?? '', lang: kunde?.name_lang ?? '' })
    setAMergeModus(false); setAMergeWahl(new Set()); setAMergeName('')
  }, [kundeId])

  const aMergeToggle = (id: string) => setAMergeWahl(w => {
    const n = new Set(w)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const anlagenZusammenfuehren = async () => {
    const quellen = [...aMergeWahl]
    const name = aMergeName.trim()
    if (!kundeId || quellen.length < 2 || !name) return
    const erste = anlagen.find(a => a.id === quellen[0])
    try {
      const ziel = await db.anlageAnlegenRueckgabe({
        kunde_id: kundeId,
        name,
        strasse: erste?.strasse,
        plz: erste?.plz,
        ort: erste?.ort,
        notizen: `Aus Anlagen-Merge erstellt: ${quellen.map(id => anlagen.find(a => a.id === id)?.name ?? id).join(' / ')}`,
      })
      const erg = await db.anlagenZusammenfuehren(ziel, quellen)
      setMeldung(erg + ` Neues Objekt „${name}“ enthält jetzt die gewählten Anlagen als eigene Bereiche mit Historie.`)
      setAMergeModus(false); setAMergeWahl(new Set()); setAMergeName(''); setAnlageId(ziel); laden()
    } catch (e: any) { setMeldung('Fehler: ' + (e.message ?? e)) }
  }
  const kundeUmbenennen = async () => {
    if (!kunde) return
    await db.kundeAktualisieren(kunde.id, { name_kurz: kName.kurz, name_lang: kName.lang })
    setMeldung('Kunde umbenannt.'); laden()
  }
  const anlageAktivSetzen = async (aktiv: boolean) => {
    if (!anlage) return
    await db.anlageAktualisieren(anlage.id, { aktiv })
    setMeldung(aktiv
      ? 'Anlage wieder aktiv – erscheint erneut in den Fälligkeits-Ansichten.'
      : 'Anlage inaktiv gesetzt – keine Fälligkeits-Erinnerungen mehr, jederzeit reaktivierbar.')
    laden()
  }

  const anlageSpeichernDetails = async () => {
    if (!anlage) return
    await db.anlageAktualisieren(anlage.id, {
      name: anlageName.trim() || anlage.name,
      strasse: adresse.strasse || undefined, plz: adresse.plz || undefined, ort: adresse.ort || undefined,
      objekt_betreuer: betreuer || undefined,
      notizen: notiz || undefined, planungsnotiz: planungsnotiz || null,
    })
    setMeldung('Objekt-Details gespeichert.'); laden()
  }
  const verwalterWechseln = async () => {
    if (!anlage || !neuerVerwalter) return
    const erg = await db.verwalterWechseln(anlage.id, neuerVerwalter)
    setMeldung(erg)
    setKundeId(neuerVerwalter); laden()
  }
  const bereicheDerAnlage = bereiche.filter(b => b.anlage_id === anlageId)
  const bereichStatus = (b: Bereich) => {
    const fachPhasen = phasen.filter(p => p.bereich_id === b.id)
      .sort((a, c) => (c.eroeffnet_am || '').localeCompare(a.eroeffnet_am || ''))
    const offen = fachPhasen.find(p => !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status))
    const letzte = fachPhasen[0]
    const bTermine = termine
      .filter(t => t.bereich_id === b.id)
      .sort((a, c) => (c.datum || '').localeCompare(a.datum || ''))
    const bAuftraege = auftraege.filter(a => a.bereich_id === b.id)
    const hatAuffaellig = bAuftraege.some(a => a.unterauftraege.some(u => ['ueberschritten', 'nachuntersuchung_erforderlich'].includes(u.ergebnis)))
    if (offen) return { text: PHASE_TEXT[offen.status], klasse: offen.status === 'nachuntersuchung' ? 'medium' : 'active', icon: 'fa-triangle-exclamation' }
    if (letzte?.status === 'regelturnus_bestaetigt') return { text: 'Regelturnus bestätigt', klasse: 'closed', icon: 'fa-circle-check' }
    if (hatAuffaellig) return { text: 'Historie auffällig', klasse: 'medium', icon: 'fa-clock-rotate-left' }
    if (bTermine.length > 0) return { text: `Regelturnus · letzte ${fmtDatum(bTermine[0].datum)}`, klasse: 'closed', icon: 'fa-calendar-check' }
    return { text: 'Regelturnus', klasse: 'neutral', icon: 'fa-circle-info' }
  }
  const termineZumBereich = (b?: Bereich) => {
    if (!b || !anlage) return []
    const auftragTerminIds = new Set(auftraege.filter(a => a.bereich_id === b.id && a.termin_id).map(a => a.termin_id))
    return termine
      .filter(t => t.status !== 'abgesagt'
        && t.anlage_id === anlage.id
        && (t.bereich_id === b.id || auftragTerminIds.has(t.id) || (!t.bereich_id && bereicheDerAnlage.length === 1)))
      .sort((a, c) => (c.datum || '').localeCompare(a.datum || ''))
  }
  const auftraegeZumBereich = (b?: Bereich) => b ? auftraege.filter(a => a.bereich_id === b.id) : []
  const probenZumBereich = (b?: Bereich) => {
    const ausAuftraegen = auftraegeZumBereich(b)
      .flatMap(a => a.unterauftraege)
      .map(u => u.proben_ist ?? u.proben_geplant ?? 0)
      .filter(n => n > 0)
    return ausAuftraegen[0] ?? b?.proben_anzahl ?? anlage?.proben_anzahl
  }
  const ergebnisZumTermin = (t: import('../lib/types').Termin, b: Bereich) => {
    const labels = auftraegeZumBereich(b)
      .filter(a => a.termin_id === t.id)
      .flatMap(a => a.unterauftraege.map(u => ERGEBNIS_LABEL[u.ergebnis]))
      .filter(l => l && l !== 'offen')
    const direkt = t.befund === 'sauber' ? 'ohne Befund'
      : t.befund === 'ueberschreitung' ? 'Überschreitung'
      : t.befund === 'offen' ? 'unbekannt / nicht erfasst'
      : ''
    return direkt || [...new Set(labels)].join(', ') || (t.status === 'geplant' ? 'geplant' : 'unbekannt / nicht erfasst')
  }
  const befundKlasseZumTermin = (t: import('../lib/types').Termin, b: Bereich) => {
    if (t.befund === 'ueberschreitung') return 'befund-rot'
    if (t.befund === 'sauber') return 'befund-gruen'
    const ergebnisse = auftraegeZumBereich(b).filter(a => a.termin_id === t.id).flatMap(a => a.unterauftraege.map(u => u.ergebnis))
    if (ergebnisse.includes('ueberschritten')) return 'befund-rot'
    if (ergebnisse.length && ergebnisse.every(e => e === 'unauffaellig')) return 'befund-gruen'
    return 'befund-gelb'
  }
  const letzterAuftragZumBereich = (b: Bereich) => {
    const nachDatum = (a: Auftrag) => termine.find(t => t.id === a.termin_id)?.datum ?? ''
    return [...auftraegeZumBereich(b)].sort((a, c) => nachDatum(c).localeCompare(nachDatum(a)))[0]
  }

  const kundeSpeichern = async () => {
    if (!kf.name_lang) return
    await db.kundeAnlegen(kf)
    setNeuKunde(false); setKf({ ...kf, name_lang: '', name_kurz: '' }); laden()
  }
  const anlageSpeichern = async () => {
    if (!af.name.trim() || !kundeId) return
    if (neueAnlageBereiche.some(b => !b.name.trim())) {
      setMeldung('Bitte jedem Bereich/WWB einen Namen geben.')
      return
    }
    setAnlageWirdAngelegt(true)
    try {
      const id = await db.anlageMitBereichenAnlegen(kundeId, {
        name: af.name.trim(), strasse: af.strasse || undefined, plz: af.plz || undefined,
        ort: af.ort || undefined, notizen: af.notizen || undefined,
      }, neueAnlageBereiche.map(b => ({
        ...b,
        name: b.name.trim(),
        turnus_monate: b.turnus_monate ? Number(b.turnus_monate) : undefined,
        proben_anzahl: b.proben_anzahl ? Number(b.proben_anzahl) : undefined,
        naechste_untersuchung: b.naechste_untersuchung || undefined,
        letzte_untersuchung: b.letzte_untersuchung || undefined,
        pruefbericht_nummer: b.pruefbericht_nummer || undefined,
        pruefbericht_datum: b.pruefbericht_datum || undefined,
        notizen: b.notizen || undefined,
      })))
      setNeuAnlage(false)
      setAf({ name: '', strasse: '', plz: '', ort: '', notizen: '' })
      setNeueAnlageBereiche([neuerBereichForm()])
      setAnlageId(id)
      setMeldung(`„${af.name.trim()}“ wurde mit ${neueAnlageBereiche.length} Bereich${neueAnlageBereiche.length === 1 ? '' : 'en'} vollständig angelegt.`)
      laden()
    } catch (e: any) {
      setMeldung('Fehler beim Anlegen: ' + (e.message ?? e))
    } finally {
      setAnlageWirdAngelegt(false)
    }
  }
  const neuerBereichAendern = (index: number, patch: Partial<NeuerBereichForm>) =>
    setNeueAnlageBereiche(alt => alt.map((b, i) => i === index ? { ...b, ...patch } : b))
  const turnusAendern = (index: number, wert: string) => {
    const b = neueAnlageBereiche[index]
    neuerBereichAendern(index, {
      turnus_monate: wert,
      naechste_untersuchung: b.letzte_untersuchung && wert
        ? datumVerschieben(b.letzte_untersuchung, 0, Number(wert)) : b.naechste_untersuchung,
    })
  }
  const pruefberichtDatumAendern = (index: number, wert: string) => {
    const b = neueAnlageBereiche[index]
    const untersuchung = wert ? datumVerschieben(wert, -14) : ''
    neuerBereichAendern(index, {
      pruefbericht_datum: wert,
      letzte_untersuchung: untersuchung,
      naechste_untersuchung: untersuchung && b.turnus_monate
        ? datumVerschieben(untersuchung, 0, Number(b.turnus_monate)) : '',
    })
  }
  const letzteUntersuchungAendern = (index: number, wert: string) => {
    const b = neueAnlageBereiche[index]
    neuerBereichAendern(index, {
      letzte_untersuchung: wert,
      naechste_untersuchung: wert && b.turnus_monate
        ? datumVerschieben(wert, 0, Number(b.turnus_monate)) : b.naechste_untersuchung,
    })
  }
  const bereichHinzufuegen = () => setNeueAnlageBereiche(alt => {
    const vorbereitet = alt.length === 1 && alt[0].name === 'Gesamtanlage'
      ? [{ ...alt[0], name: '' }] : alt
    return [...vorbereitet, neuerBereichForm('')]
  })
  const neuenBereichEntfernen = (index: number) => setNeueAnlageBereiche(alt => {
    const rest = alt.filter((_, i) => i !== index)
    return rest.length === 1 && !rest[0].name ? [{ ...rest[0], name: 'Gesamtanlage' }] : rest
  })
  const bereichSpeichern = async () => {
    if (!neuBereichName.trim() || !anlageId) return
    await db.bereichAnlegen({ anlage_id: anlageId, name: neuBereichName.trim() })
    setNeuBereichName(''); laden()
  }

  return (
    <>
      <Meldung text={meldung} onWeg={() => setMeldung('')} />
      <div className="stamm-spalten">
        {/* ── Spalte 1: Kunden ── */}
        <div className="stamm-spalte">
          <div className="stamm-kopf">
            <h3><i className="fas fa-building-user" aria-hidden="true"></i> Kunden ({kundenGefiltert.length})</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="zeile-btn" style={mergeModus ? { background: '#6c757d', borderColor: '#6c757d' } : undefined}
                onClick={kundenMergeModusSchalten}
                title="Ausgewählte Kunden als Anlagen unter einem Zielkunden zusammenführen">
                <i className="fas fa-code-merge" aria-hidden="true"></i> {mergeModus ? 'Merge abbrechen' : 'Kunden zusammenführen'}
              </button>
              {!mergeModus && <button className="zeile-btn" onClick={() => setNeuKunde(!neuKunde)}>
                <i className="fas fa-plus" aria-hidden="true"></i> Neu
              </button>}
            </div>
          </div>
          <div className="suchfeld" style={{ margin: '0 12px 10px' }}>
            <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
            <input placeholder="Kunde suchen …" value={suche} onChange={e => setSuche(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setSuche('')} />
            {suche && <button className="suchfeld-x" onClick={() => setSuche('')} aria-label="Suche leeren">×</button>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.76rem', padding: '0 14px 8px', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={inaktiveKunden} onChange={e => setInaktiveKunden(e.target.checked)} />
            inaktive Kunden anzeigen
          </label>
          {neuKunde && (
            <div className="stamm-formular">
              <input placeholder="Vollständiger Name (wie in HV)" value={kf.name_lang} onChange={e => setKf({ ...kf, name_lang: e.target.value })} />
              <input placeholder="Kurzname für Outlook-Titel (optional)" value={kf.name_kurz} onChange={e => setKf({ ...kf, name_kurz: e.target.value })} />
              <select value={kf.typ} onChange={e => setKf({ ...kf, typ: e.target.value as Kundentyp })}>
                {Object.entries(TYP).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input placeholder="Telefon" value={kf.telefon} onChange={e => setKf({ ...kf, telefon: e.target.value })} />
              <input placeholder="E-Mail" value={kf.email} onChange={e => setKf({ ...kf, email: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary" onClick={kundeSpeichern}>Anlegen</button>
                <button onClick={() => setNeuKunde(false)}>Abbrechen</button>
              </div>
            </div>
          )}
          {mergeModus && (
            <div className="merge-leiste">
              <div className="merge-auswahl-kopf">
                <strong>{mergeWahl.size} Quellkunde{mergeWahl.size === 1 ? '' : 'n'} ausgewählt</strong>
                <span className="hint">Der zuvor geöffnete Kunde bleibt markiert. Weitere kannst du unten anhaken.</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem' }}>
                <input type="radio" checked={!mergeNeu} onChange={() => setMergeNeu(false)} />
                Mit vorhandenem Kunden zusammenführen
              </label>
              {!mergeNeu && <label className="f">Mit welchem Kunden willst du zusammenführen?
                <input list="merge-zielkunden" value={mergeZielSuche}
                  placeholder="Kundennamen tippen und auswählen …"
                  onChange={e => {
                    const eingabe = e.target.value
                    setMergeZielSuche(eingabe)
                    const treffer = kunden.find(k => k.aktiv && !mergeWahl.has(k.id) && kundeAnzeige(k) === eingabe)
                    setMergeZiel(treffer?.id ?? '')
                  }} />
                <datalist id="merge-zielkunden">
                  {kunden.filter(k => k.aktiv && !mergeWahl.has(k.id))
                    .sort((a, b) => a.name_lang.localeCompare(b.name_lang, 'de'))
                    .map(k => <option key={k.id} value={kundeAnzeige(k)} />)}
                </datalist>
                {mergeZiel && <span className="merge-ziel-bestaetigt">
                  <i className="fas fa-circle-check" aria-hidden="true"></i>
                  Ziel: {kundeAnzeige(kunden.find(k => k.id === mergeZiel))}
                </span>}
              </label>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem' }}>
                <input type="radio" checked={mergeNeu} onChange={() => {
                  setMergeNeu(true); setMergeZiel(''); setMergeZielSuche('')
                }} />
                Zielkunde nicht vorhanden – <strong>neu anlegen</strong>
              </label>
              {mergeNeu && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ flex: 1 }} placeholder="Voller Name, z. B. AWO Bezirksverband Schwaben e.V." value={mergeNeuName.lang}
                    onChange={e => setMergeNeuName({ ...mergeNeuName, lang: e.target.value })} />
                  <input style={{ width: 130 }} placeholder="Kurz (optional)" value={mergeNeuName.kurz}
                    onChange={e => setMergeNeuName({ ...mergeNeuName, kurz: e.target.value })} />
                </div>
              )}
              <p className="hint" style={{ margin: 0 }}>
                Der Zielkunde bleibt links bestehen. Die markierten Quellkunden erscheinen danach rechts
                als Anlagen/Objekte – inklusive aller Bereiche, Termine, Aufträge und der vollständigen
                Historie. Die bisherigen Quellkunden werden inaktiv archiviert.
              </p>
              <button className="primary" onClick={zusammenfuehren}
                disabled={mergeNeu ? (mergeWahl.size < 1 || !mergeNeuName.lang.trim())
                                   : (mergeWahl.size < 1 || !mergeZiel)}>
                <i className="fas fa-code-merge" aria-hidden="true"></i>
                {mergeNeu
                  ? (mergeWahl.size < 1 ? 'Kunden ankreuzen' : !mergeNeuName.lang.trim() ? 'Namen des neuen Zielkunden eingeben' : `${mergeWahl.size} Kunden → Anlagen unter ${mergeNeuName.lang.trim()}`)
                  : (mergeWahl.size < 1 ? 'Quellkunden ankreuzen' : !mergeZiel ? 'Zielkunden auswählen' : `${mergeWahl.size} Kunde(n) mit ${kundeAnzeige(kunden.find(k => k.id === mergeZiel))} zusammenführen`)}
              </button>
            </div>
          )}
          <div className="stamm-liste">
            {kundenGefiltert.map(k => (
              mergeModus ? (
                <label key={k.id} className={`stamm-eintrag merge ${mergeWahl.has(k.id) ? 'markiert' : ''} ${mergeZiel === k.id ? 'ziel' : ''}`}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={mergeWahl.has(k.id)} disabled={mergeZiel === k.id} onChange={() => mergeToggle(k.id)} />
                    <strong>{kundeAnzeige(k)}</strong>
                    {mergeWahl.has(k.id) && <span className="badge medium">wird Anlage</span>}
                    {mergeZiel === k.id && <span className="badge closed"><i className="fas fa-bullseye" aria-hidden="true"></i> Zielkunde</span>}
                  </span>
                  <span className="hint">{k.name_lang}</span>
                  <span className="stamm-zahl">{anlagen.filter(a => a.kunde_id === k.id).length}</span>
                </label>
              ) : (
              <button key={k.id} className={`stamm-eintrag ${k.id === kundeId ? 'aktiv' : ''}`}
                onClick={() => { setKundeId(k.id); setAnlageId('') }}>
                <strong>{k.name_lang}</strong>
                {k.name_kurz && <span className="hint">Kurz: {k.name_kurz}</span>}
                <span className="stamm-zahl">{anlagen.filter(a => a.kunde_id === k.id).length}</span>
              </button>
              )
            ))}
            {kundenGefiltert.length === 0 && <p className="hint" style={{ padding: '0 14px' }}>Keine Kunden gefunden.</p>}
          </div>
        </div>

        {/* ── Spalte 2: Anlagen des Kunden ── */}
        <div className="stamm-spalte">
          <div className="stamm-kopf">
            <h3><i className="fas fa-building" aria-hidden="true"></i> Anlagen {kunde ? `– ${kundeAnzeige(kunde)} (${anlagenDesKunden.length})` : ''}</h3>
            {kunde && <div style={{ display: 'flex', gap: 6 }}>
              <button className="zeile-btn" style={aMergeModus ? { background: '#6c757d', borderColor: '#6c757d' } : undefined}
                onClick={() => { setAMergeModus(!aMergeModus); setAMergeWahl(new Set()); setAMergeName('') }}
                title="Mehrere Anlagen als Bereiche in ein neues Objekt übernehmen">
                <i className="fas fa-code-merge" aria-hidden="true"></i> {aMergeModus ? 'Merge abbrechen' : 'Anlagen zusammenführen'}
              </button>
              {!aMergeModus && <button className="zeile-btn" onClick={() => setNeuAnlage(!neuAnlage)}>
                <i className="fas fa-plus" aria-hidden="true"></i> Neu
              </button>}
            </div>}
          </div>
          {kunde && !aMergeModus && (
            <div className="stamm-formular" style={{ background: '#fbfdff' }}>
              <span className="hint" style={{ fontWeight: 650 }}>Kunde bearbeiten</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ width: 110 }} value={kName.kurz} onChange={e => setKName({ ...kName, kurz: e.target.value })} placeholder="Kurzname" />
                <input style={{ flex: 1 }} value={kName.lang} onChange={e => setKName({ ...kName, lang: e.target.value })} placeholder="Vollständiger Name" />
                <button onClick={kundeUmbenennen} title="Namen speichern"><i className="fas fa-floppy-disk" aria-hidden="true"></i></button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem' }}>
                <input type="checkbox" checked={inaktiveAnzeigen} onChange={e => setInaktiveAnzeigen(e.target.checked)} />
                inaktive Anlagen anzeigen
              </label>
            </div>
          )}
          {kunde && aMergeModus && (
            <div className="merge-leiste">
              <p className="hint" style={{ margin: 0 }}>
                Anlagen ankreuzen und den Namen des neuen Objekts eingeben. Alle gewählten Anlagen werden
                darunter zu eigenständigen <strong>Untersuchungsbereichen</strong> mit eigener Historie.
              </p>
              <input placeholder="Neues Objekt, z. B. AWO Krumbach" value={aMergeName}
                onChange={e => setAMergeName(e.target.value)} />
              <button className="primary" onClick={anlagenZusammenfuehren} disabled={aMergeWahl.size < 2 || !aMergeName.trim()}>
                <i className="fas fa-object-group" aria-hidden="true"></i>
                {aMergeWahl.size < 2 ? 'Mind. 2 Anlagen ankreuzen'
                  : !aMergeName.trim() ? 'Namen des neuen Objekts eingeben'
                  : `${aMergeWahl.size} Anlagen → ${aMergeName.trim()}`}
              </button>
            </div>
          )}
          {!kunde && <p className="hint" style={{ padding: '4px 14px' }}>← Links einen Kunden wählen.</p>}
          {neuAnlage && kunde && (
            <div className="stamm-formular neue-anlage-assistent">
              <div className="neu-anlage-abschnitt">
                <strong>1. Objekt / Anlage</strong>
                <input placeholder="Objektname, z. B. Straßbergerstr. 11–47" value={af.name}
                  onChange={e => setAf({ ...af, name: e.target.value })} />
                <input placeholder="Straße" value={af.strasse} onChange={e => setAf({ ...af, strasse: e.target.value })} />
                <div className="neu-anlage-grid adresse">
                  <input placeholder="PLZ" value={af.plz} onChange={e => setAf({ ...af, plz: e.target.value })} />
                  <input placeholder="Ort" value={af.ort} onChange={e => setAf({ ...af, ort: e.target.value })} />
                </div>
                <textarea rows={2} placeholder="Notiz zum Objekt (optional)" value={af.notizen}
                  onChange={e => setAf({ ...af, notizen: e.target.value })} />
              </div>

              <div className="neu-anlage-abschnitt">
                <div className="neu-anlage-titelzeile">
                  <strong>2. Bereiche / WWB</strong>
                  <button type="button" onClick={bereichHinzufuegen}>
                    <i className="fas fa-plus" aria-hidden="true"></i> Bereich hinzufügen
                  </button>
                </div>
                <p className="hint">Bei nur einem Bereich wird automatisch eine Gesamtanlage angelegt. Bekannte Angaben können direkt vollständig erfasst werden.</p>
                {neueAnlageBereiche.map((b, index) => (
                  <div className="neuer-bereich-block" key={index}>
                    <div className="neu-anlage-titelzeile">
                      <strong>{neueAnlageBereiche.length === 1 ? 'Gesamtanlage' : `Bereich / WWB ${index + 1}`}</strong>
                      {neueAnlageBereiche.length > 1 && <button type="button" className="danger"
                        onClick={() => neuenBereichEntfernen(index)} title="Diesen noch nicht gespeicherten Bereich entfernen">
                        <i className="fas fa-trash" aria-hidden="true"></i>
                      </button>}
                    </div>
                    <label className="f">Bereichsname
                      <input placeholder={neueAnlageBereiche.length === 1 ? 'Gesamtanlage' : 'z. B. Altbau oder WWB 1'}
                        value={b.name} onChange={e => neuerBereichAendern(index, { name: e.target.value })} />
                    </label>
                    <div className="neu-anlage-grid">
                      <label className="f">Turnus in Monaten
                        <input type="number" min="1" placeholder="z. B. 12 oder 36" value={b.turnus_monate}
                          onChange={e => turnusAendern(index, e.target.value)} />
                      </label>
                      <label className="f">Probenanzahl / Umfang
                        <input type="number" min="0" placeholder="optional" value={b.proben_anzahl}
                          onChange={e => neuerBereichAendern(index, { proben_anzahl: e.target.value })} />
                      </label>
                    </div>
                    <div className="neu-anlage-leistungen">
                      <label><input type="checkbox" checked={b.standard_legionellen}
                        onChange={e => neuerBereichAendern(index, { standard_legionellen: e.target.checked })} /> Legionellen</label>
                      <label><input type="checkbox" checked={b.standard_mibi}
                        onChange={e => neuerBereichAendern(index, { standard_mibi: e.target.checked })} /> Mibi</label>
                      {b.standard_mibi && <select aria-label="Mibi-Umfang" value={b.standard_mibi_umfang}
                        onChange={e => neuerBereichAendern(index, { standard_mibi_umfang: e.target.value as NeuerBereichForm['standard_mibi_umfang'] })}>
                        <option>Standard</option><option>Komplett</option><option>inklusive Enterokokken</option>
                      </select>}
                      <label><input type="checkbox" checked={b.standard_chemie}
                        onChange={e => neuerBereichAendern(index, { standard_chemie: e.target.checked })} /> Chemie</label>
                    </div>

                    <details className="bekannter-bericht" open={neueAnlageBereiche.length === 1}>
                      <summary>Bekannter letzter Prüfbericht (optional)</summary>
                      <div className="bekannter-bericht-inhalt">
                        <div className="neu-anlage-grid">
                          <label className="f">Prüfbericht-Nr.
                            <input placeholder="optional" value={b.pruefbericht_nummer}
                              onChange={e => neuerBereichAendern(index, { pruefbericht_nummer: e.target.value })} />
                          </label>
                          <label className="f">Datum Prüfbericht
                            <input type="date" value={b.pruefbericht_datum}
                              onChange={e => pruefberichtDatumAendern(index, e.target.value)} />
                          </label>
                          <label className="f">Letzte Untersuchung
                            <input type="date" value={b.letzte_untersuchung}
                              onChange={e => letzteUntersuchungAendern(index, e.target.value)} />
                            {b.pruefbericht_datum && <span className="hint">zunächst als Prüfbericht minus 14 Tage geschätzt</span>}
                          </label>
                          <label className="f">Befund / Status
                            <select value={b.befund} onChange={e => neuerBereichAendern(index, { befund: e.target.value as Befund })}>
                              {(Object.keys(BEFUND_LABEL) as Befund[]).map(v => <option key={v} value={v}>{BEFUND_LABEL[v]}</option>)}
                            </select>
                          </label>
                          <label className="f">Untersuchungsart
                            <select value={b.fachliche_untersuchungsart}
                              onChange={e => neuerBereichAendern(index, { fachliche_untersuchungsart: e.target.value as FachlicheUntersuchungsart })}>
                              {(Object.keys(FACHLICHE_ART_LABEL) as FachlicheUntersuchungsart[])
                                .map(v => <option key={v} value={v}>{FACHLICHE_ART_LABEL[v]}</option>)}
                            </select>
                          </label>
                          <label className="f">Nächste Untersuchung / Fälligkeit
                            <input type="date" value={b.naechste_untersuchung}
                              onChange={e => neuerBereichAendern(index, { naechste_untersuchung: e.target.value })} />
                            {b.letzte_untersuchung && b.turnus_monate && <span className="hint">aus Untersuchung + Turnus berechnet; frei änderbar</span>}
                          </label>
                        </div>
                        <textarea rows={2} placeholder="Bemerkung zu Bereich oder Prüfbericht (optional)" value={b.notizen}
                          onChange={e => neuerBereichAendern(index, { notizen: e.target.value })} />
                      </div>
                    </details>
                  </div>
                ))}
                <button type="button" onClick={bereichHinzufuegen}>
                  <i className="fas fa-plus" aria-hidden="true"></i> Weiteren Bereich / WWB hinzufügen
                </button>
              </div>

              <div className="neu-anlage-aktionen">
                <button className="primary" onClick={anlageSpeichern}
                  disabled={anlageWirdAngelegt || !af.name.trim()}>
                  <i className="fas fa-floppy-disk" aria-hidden="true"></i>
                  {anlageWirdAngelegt ? 'Wird angelegt …' : 'Anlage vollständig anlegen'}
                </button>
                <button onClick={() => {
                  setNeuAnlage(false)
                  setAf({ name: '', strasse: '', plz: '', ort: '', notizen: '' })
                  setNeueAnlageBereiche([neuerBereichForm()])
                }}>Abbrechen</button>
              </div>
            </div>
          )}
          <div className="stamm-liste">
            {anlagenDesKunden.map(a => (
              aMergeModus ? (
                <label key={a.id} className={`stamm-eintrag merge ${aMergeWahl.has(a.id) ? 'markiert' : ''}`}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={aMergeWahl.has(a.id)} onChange={() => aMergeToggle(a.id)} />
                    <strong>{a.name}</strong>
                  </span>
                  <span className="hint">{[a.plz, a.ort].filter(Boolean).join(' ')} · wird eigener Bereich im neuen Objekt</span>
                </label>
              ) : (
              <button key={a.id} className={`stamm-eintrag ${a.id === anlageId ? 'aktiv' : ''} ${!a.aktiv ? 'inaktiv' : ''}`} onClick={() => setAnlageId(a.id)}>
                <strong>{a.name}{!a.aktiv && <span className="badge neutral" style={{ marginLeft: 6 }}>inaktiv</span>}</strong>
                <span className="hint">{[a.plz, a.ort].filter(Boolean).join(' ') || 'Adresse noch nicht erfasst'}</span>
                <span className="stamm-zahl">{bereiche.filter(b => b.anlage_id === a.id).length}</span>
              </button>
              )
            ))}
            {kunde && anlagenDesKunden.length === 0 && <p className="hint" style={{ padding: '0 14px' }}>Noch keine Anlagen – oben „Neu“.</p>}
          </div>
        </div>

        {/* ── Spalte 3: Bereiche (WWB) mit eigenen Details ── */}
        <div className="stamm-spalte breit">
          <div className="stamm-kopf">
            <h3><i className="fas fa-diagram-project" aria-hidden="true"></i> Untersuchungsbereiche (WWB) {anlage ? `(${bereicheDerAnlage.length})` : ''}</h3>
            {anlage && bereicheDerAnlage.length === 1 && <button className="zeile-btn" onClick={() => { setHistorieBereich(bereicheDerAnlage[0].id); setHistorieOffen(true) }}>
              <i className="fas fa-clock-rotate-left" aria-hidden="true"></i> Historie
            </button>}
          </div>
          {!anlage && <p className="hint" style={{ padding: '4px 14px' }}>← In der Mitte eine Anlage (Objekt/Standort) wählen.</p>}

          {anlage && (
            <div className="bereich-raster">
              {/* Objekt-Ebene: Adresse, Betreuer, Zugang, Aktiv, Verwalterwechsel */}
              <details className="objekt-box">
                <summary><i className="fas fa-building" aria-hidden="true"></i> Objekt: {anlage.name}
                  {!anlage.aktiv && <span className="badge neutral" style={{ marginLeft: 6 }}>inaktiv</span>}</summary>
                <div className="stamm-formular" style={{ borderBottom: 'none' }}>
                  <span className="hint" style={{ fontWeight: 650 }}>Objektname</span>
                  <input value={anlageName} onChange={e => setAnlageName(e.target.value)} />
                  <span className="hint" style={{ fontWeight: 650 }}>Adresse (Objekt gesamt)</span>
                  <input placeholder="Straße" value={adresse.strasse} onChange={e => setAdresse({ ...adresse, strasse: e.target.value })} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input placeholder="PLZ" style={{ width: 90 }} value={adresse.plz} onChange={e => setAdresse({ ...adresse, plz: e.target.value })} />
                    <input placeholder="Ort" style={{ flex: 1 }} value={adresse.ort} onChange={e => setAdresse({ ...adresse, ort: e.target.value })} />
                  </div>
                  <span className="hint" style={{ fontWeight: 650 }}>Objektbetreuer (optional)</span>
                  <input placeholder="z. B. Hr. Maier, 0821 …" value={betreuer} onChange={e => setBetreuer(e.target.value)} />
                  <span className="hint" style={{ fontWeight: 650 }}>Zugang / Notizen</span>
                  <textarea rows={2} placeholder="z. B. Schlüssel beim Hausmeister" value={notiz} onChange={e => setNotiz(e.target.value)} />
                  <span className="hint" style={{ fontWeight: 650 }}>Planungsvermerk (nimmt Objekt aus Fälligkeits-Ansichten)</span>
                  <textarea rows={2} placeholder="z. B. Heizung wird erneuert – zurückstellen" value={planungsnotiz} onChange={e => setPlanungsnotiz(e.target.value)} />
                  <button className="primary" onClick={anlageSpeichernDetails}>
                    <i className="fas fa-floppy-disk" aria-hidden="true"></i> Objekt speichern
                  </button>

                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <select style={{ flex: 1 }} value={neuerVerwalter} onChange={e => setNeuerVerwalter(e.target.value)}>
                      <option value="">Verwalter wechseln zu …</option>
                      {kunden.filter(k => k.id !== kundeId).map(k => <option key={k.id} value={k.id}>{k.name_lang}</option>)}
                    </select>
                    <button onClick={verwalterWechseln} disabled={!neuerVerwalter} title="Objekt + Historie zum neuen Kunden">
                      <i className="fas fa-right-left" aria-hidden="true"></i>
                    </button>
                  </div>
                  {anlage.aktiv
                    ? <button className="secondary" onClick={() => anlageAktivSetzen(false)}><i className="fas fa-pause" aria-hidden="true"></i> Objekt inaktiv setzen</button>
                    : <button className="primary" onClick={() => anlageAktivSetzen(true)}><i className="fas fa-play" aria-hidden="true"></i> Objekt reaktivieren</button>}
                </div>
              </details>

              {/* Bereichs-Ebene: je WWB eigene Adresse/Details/Historie */}
              <div className="bereich-liste">
                {bereicheDerAnlage.map(b => {
                  const ansicht = bereichAnsicht(b)
                  const status = bereichStatus(b)
                  const bTermine = termineZumBereich(b)
                  const letzterAuftrag = letzterAuftragZumBereich(b)
                  const offenePhase = phasen
                    .filter(p => p.bereich_id === b.id && !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status))
                    .sort((a, c) => c.eroeffnet_am.localeCompare(a.eroeffnet_am))[0]
                  return (
                  <div key={b.id} className={`bereich-karte ${b.id === bereichId ? 'aktiv' : ''} ${ansicht.uebernommen ? 'uebernommen' : ''}`}>
                    <button className="bereich-kopf" onClick={() => setBereichId(b.id === bereichId ? '' : b.id)}>
                      <span className="bereich-titelzeile">
                        <strong><i className={`fas fa-chevron-${b.id === bereichId ? 'down' : 'right'}`} style={{ fontSize: '.7rem', marginRight: 6 }}></i>{ansicht.titel}</strong>
                        <span className={`badge ${status.klasse}`}><i className={`fas ${status.icon}`} aria-hidden="true"></i> {status.text}</span>
                      </span>
                      <span className="bereich-meta-row">
                        <span><i className="fas fa-flask" aria-hidden="true"></i> Proben: <strong>{probenZumBereich(b) ?? '–'}</strong></span>
                        <span><i className="fas fa-calendar-check" aria-hidden="true"></i> Letzte: <strong>{fmtDatum(bTermine[0]?.datum)}</strong></span>
                      </span>
                      <span className="bereich-mini-historie">
                        {bTermine.slice(0, 3).map(t => (
                          <span key={t.id} className={`mini-hist-zeile ${befundKlasseZumTermin(t, b)}`}>
                            <strong>{fmtDatum(t.datum)}</strong>
                            <em>{ergebnisZumTermin(t, b)}</em>
                          </span>
                        ))}
                        {bTermine.length === 0 && <span className="hint">Noch keine Historie zu diesem Bereich.</span>}
                      </span>
                      {(b.strasse || b.hausnummer) && <span className="hint">{[b.strasse, b.hausnummer].filter(Boolean).join(' ')}</span>}
                    </button>
                    {b.id === bereichId && (
                      <div className="stamm-formular" style={{ borderBottom: 'none', paddingTop: 6 }}>
                        <span className="hint" style={{ fontWeight: 650 }}>
                          Details und Historie zu: {ansicht.titel}
                        </span>
                        <div className="bereich-detail-uebersicht">
                          <span><small>Letzter Termin</small><strong>{fmtDatum(bTermine[0]?.datum)}</strong></span>
                          <span><small>Letztes Ergebnis</small><strong>{bTermine[0] ? ergebnisZumTermin(bTermine[0], b) : '–'}</strong></span>
                          <span><small>Aktueller Status</small><strong>{status.text}</strong></span>
                          <span><small>Proben / Umfang</small><strong>{probenZumBereich(b) ?? '–'}</strong></span>
                          <span><small>Untersuchungsart</small><strong>{bTermine[0]?.fachliche_untersuchungsart
                            ? FACHLICHE_ART_LABEL[bTermine[0].fachliche_untersuchungsart]
                            : letzterAuftrag?.fachliche_untersuchungsart
                              ? FACHLICHE_ART_LABEL[letzterAuftrag.fachliche_untersuchungsart]
                              : 'noch nicht erfasst'}</strong></span>
                        </div>
                        <input placeholder="Bereichsname, z. B. Altbau / Haus 7" value={bf.name} onChange={e => setBf({ ...bf, name: e.target.value })} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input placeholder="Straße (falls abweichend)" style={{ flex: 1 }} value={bf.strasse} onChange={e => setBf({ ...bf, strasse: e.target.value })} />
                          <input placeholder="Haus-Nr." style={{ width: 90 }} value={bf.hausnummer} onChange={e => setBf({ ...bf, hausnummer: e.target.value })} />
                        </div>
                        <input placeholder="WW-System-Details (optional)" value={bf.wwb_details} onChange={e => setBf({ ...bf, wwb_details: e.target.value })} />
                        <div className="grid2">
                          <label className="f">Turnus
                            <select value={bf.turnus_art} onChange={e => setBf({ ...bf, turnus_art: e.target.value as Turnusart })}>
                              <option value="regelturnus">Regelturnus</option>
                              <option value="sonderturnus">Sonderturnus</option>
                              <option value="behoerdlich">behördlich festgelegt</option>
                            </select>
                          </label>
                          <label className="f">Turnus in Monaten
                            <input type="number" min={1} max={120} value={bf.turnus_monate} onChange={e => setBf({ ...bf, turnus_monate: e.target.value })} placeholder="12 oder 36" />
                          </label>
                          <label className="f">Nächste Untersuchung
                            <input type="date" value={bf.naechste_untersuchung} onChange={e => setBf({ ...bf, naechste_untersuchung: e.target.value })} />
                          </label>
                          <label className="f">Probenanzahl / Umfang
                            <input type="number" min={1} value={bf.proben_anzahl} onChange={e => setBf({ ...bf, proben_anzahl: e.target.value })} />
                          </label>
                        </div>
                        <input placeholder="Begründung Sonderturnus / behördliche Vorgabe" value={bf.turnus_begruendung} onChange={e => setBf({ ...bf, turnus_begruendung: e.target.value })} />
                        <fieldset className="bereich-standardarten">
                          <legend>Standardmäßig erforderliche Probenahmearten</legend>
                          <label><input type="checkbox" checked={bf.standard_legionellen} onChange={e => setBf({ ...bf, standard_legionellen: e.target.checked })} /> Legionellen</label>
                          <label><input type="checkbox" checked={bf.standard_mibi} onChange={e => setBf({ ...bf, standard_mibi: e.target.checked })} /> Mikrobiologie</label>
                          {bf.standard_mibi && <select value={bf.standard_mibi_umfang} onChange={e => setBf({ ...bf, standard_mibi_umfang: e.target.value as typeof bf.standard_mibi_umfang })}>
                            <option>Standard</option><option>Komplett</option><option>inklusive Enterokokken</option>
                          </select>}
                          <label><input type="checkbox" checked={bf.standard_chemie} onChange={e => setBf({ ...bf, standard_chemie: e.target.checked })} /> Chemie</label>
                        </fieldset>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="primary" onClick={bereichSpeichernDetails}><i className="fas fa-floppy-disk" aria-hidden="true"></i> Speichern</button>
                          {letzterAuftrag
                            ? <button onClick={() => setBerichtAuftrag(letzterAuftrag)}><i className="fas fa-file-circle-check" aria-hidden="true"></i> Bericht erfassen / nacherfassen</button>
                            : <button onClick={() => {
                              sessionStorage.setItem('novaplan_auftrag_vorbelegung', JSON.stringify({
                                kundeId: kunde?.id, anlageId: anlage.id, bereichId: b.id,
                                terminId: bTermine[0]?.id ?? '',
                              }))
                              location.hash = '#/auftragsbuch'
                            }} title="Auftrag mit Kunde, Anlage und Bereich vorbereitet öffnen"><i className="fas fa-hashtag" aria-hidden="true"></i> Auftrag nacherfassen</button>}
                          {offenePhase && <button onClick={() => setPhaseBearbeiten(offenePhase)}><i className="fas fa-triangle-exclamation" aria-hidden="true"></i> Phase verwalten</button>}
                          <button onClick={() => { setHistorieBereich(b.id); setHistorieOffen(true) }}><i className="fas fa-clock-rotate-left" aria-hidden="true"></i> Vollständige Historie</button>
                          <button className="secondary" onClick={() => bereichEntfernen(b.id)} title="Bereich entfernen"><i className="fas fa-trash-can" aria-hidden="true"></i></button>
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
                <div className="pm-bereich-neu" style={{ margin: '8px 0 0' }}>
                  <input placeholder="Neuer Bereich, z. B. Neubau / Haus 7" value={neuBereichName}
                    onChange={e => setNeuBereichName(e.target.value)} onKeyDown={e => e.key === 'Enter' && bereichSpeichern()} />
                  <button className="primary" onClick={bereichSpeichern} disabled={!neuBereichName.trim()}>
                    <i className="fas fa-plus" aria-hidden="true"></i> Bereich
                  </button>
                </div>
                {bereicheDerAnlage.length === 0 && <p className="hint" style={{ padding: '4px 2px' }}>
                  Noch keine Bereiche. Bei einem einzelnen WW-System z. B. „Gesamtanlage"; bei mehreren je System einen Bereich mit eigener Adresse.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {historieOffen && anlage && (
        <HistorieModal anlage={anlage} kunde={kunde} termine={termine}
          auftraege={auftraege} bereiche={bereiche} nurBereich={historieBereich}
          onClose={() => setHistorieOffen(false)} onSaved={laden} />
      )}
      {berichtAuftrag && (
        <BerichtModal
          auftrag={berichtAuftrag}
          kundeKurz={kundeAnzeige(kunde)}
          bereichName={bereiche.find(b => b.id === berichtAuftrag.bereich_id)?.name}
          bereichId={berichtAuftrag.bereich_id}
          onClose={() => setBerichtAuftrag(null)}
          onSaved={laden}
        />
      )}
      {phaseBearbeiten && (
        <PhaseModal
          phase={phaseBearbeiten}
          bereichName={bereiche.find(b => b.id === phaseBearbeiten.bereich_id)?.name}
          onClose={() => setPhaseBearbeiten(null)}
          onSaved={laden}
        />
      )}
    </>
  )
}
