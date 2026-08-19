import { useEffect, useMemo, useRef, useState } from 'react'
import { db, demoModus } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Abschnitt, Meldung, Nr } from '../components/ui'
import {
  Anlage, Auftrag, Bereich, Kunde, Pruefbericht, PbUeberschreitung, Ueberschreitungsphase,
  fmtDatum, kundeAnzeige, umfangKurz, umfangZuArten, ART_LABEL, FACHLICHE_ART_LABEL, Untersuchungsart,
} from '../lib/types'
import {
  dateiZugriffVerfuegbar, gespeicherterOrdner, ordnerWaehlen, ordnerVergessen, pdfOeffnen,
} from '../lib/kundenordner'
import {
  ergebnisVorschlaege, phasenVorschlaege,
  type ErgebnisVorschlag, type PhasenVorschlag,
} from '../lib/pbAbgleich'
import Phasen from './Auswertungen'

/* ==========================================================
   Hilfen
   ========================================================== */

/** Schreibweise vereinheitlichen: 2026-0859 und 26-859 → 26-0859 (Suffix bleibt erhalten). */
function normAuftragsnummer(v?: string): string {
  if (!v) return ''
  const m = String(v).trim().match(/^(\d{2,4})-(\d{1,4})(.*)$/)
  if (!m) return String(v).trim()
  return m[1].slice(-2) + '-' + m[2].padStart(4, '0') + (m[3] ?? '')
}
/** Basisnummer JJ-NNNN für den Abgleich mit dem Auftragsbuch (ohne Suffix). */
function basisNummer(v?: string): string {
  const m = normAuftragsnummer(v).match(/^\d{2}-\d{4}/)
  return m ? m[0] : ''
}

type Unter = 'jahr' | 'berichte' | 'anlagen' | 'abgleich' | 'phasen' | 'import'

interface AuftragKontext {
  auftrag: Auftrag
  bereich?: Bereich
  anlage?: Anlage
  kunde?: Kunde
}

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function befundBadge(b?: string, ueber?: boolean) {
  if (ueber || b === 'Überschreitung') return <span className="badge active">Überschreitung</span>
  if (b === 'Ohne Befund') return <span className="badge closed">ohne Befund</span>
  return <span className="badge medium">{b || 'unklar'}</span>
}

function herkunftBadge(b: Pruefbericht) {
  if (b.herkunft === 'NOVA') {
    return <span className="badge closed" title={`Kundennummer ${b.kundennummer || ''} im Bericht erkannt${b.herkunft_grund ? ` – ${b.herkunft_grund}` : ''}`}>
      <i className="fas fa-circle-check" /> NOVA</span>
  }
  if (b.herkunft === 'Fremd') return <span className="badge medium" title={b.herkunft_grund}>Fremdbericht</span>
  if (!b.herkunft || b.herkunft === 'Unklar') return <span className="badge neutral" title={b.herkunft_grund || 'Alter Scan ohne Herkunftsprüfung'}>Herkunft unklar</span>
  return <span className="badge neutral" title={b.herkunft_grund}>{b.herkunft}</span>
}

function bytesFmt(n?: number): string {
  if (!n) return '–'
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return Math.round(n / 1024) + ' KB'
}

/** Höchste tatsächliche Überschreitung eines Berichts (für die Berichtstabelle). */
function hoechsteUeber(b: Pruefbericht): { text: string; titel: string } | null {
  const liste = (b.ueberschreitungen ?? []).filter(u => u.wert != null || u.anzeigewert)
  if (!liste.length) return null
  const top = [...liste].sort((a, c) => (c.wert ?? 0) - (a.wert ?? 0))[0]
  const wert = top.anzeigewert ?? String(top.wert ?? '')
  return {
    text: `${wert}${top.einheit ? ' ' + top.einheit : ''}`,
    titel: `${top.parameter}${top.grenzwert != null ? ` – Grenzwert ${top.grenzwert} ${top.einheit ?? ''}` : ''}`,
  }
}

/** Felder, die 1:1 aus dem Scanner-JSON übernommen werden (nichts dazuerfinden). */
function ausJson(r: any): Partial<Pruefbericht> {
  return {
    id: String(r.id),
    labor: r.labor ?? undefined,
    berichtsnummer: r.berichtsnummer ?? undefined,
    berichtsversion: r.berichtsversion ?? undefined,
    jahr: r.jahr ?? undefined,
    hausverwaltung: r.hausverwaltung ?? undefined,
    objekt: r.objekt ?? undefined,
    bereich: r.bereich ?? undefined,
    anlage_laut_bericht: r.anlage_laut_bericht ?? undefined,
    auftraggeber: r.auftraggeber ?? undefined,
    auftragsnummer: r.auftragsnummer ? normAuftragsnummer(r.auftragsnummer) : undefined,
    auftragsnummer_quelle: r.auftragsnummer_quelle ?? undefined,
    auftragsnummer_hinweis: r.auftragsnummer_hinweis ?? undefined,
    probenahmedatum: r.probenahmedatum || null,
    datum_quelle: r.datum_quelle ?? undefined,
    untersuchungsart: r.untersuchungsart ?? undefined,
    untersuchungsart_quelle: r.untersuchungsart_quelle ?? undefined,
    umfang: Array.isArray(r.umfang) ? r.umfang : [],
    parameter: Array.isArray(r.parameter) ? r.parameter : [],
    befund: r.befund ?? undefined,
    ueberschreitung: !!r.ueberschreitung,
    befund_grund: r.befund_grund ?? undefined,
    legionellen_max: r.legionellen_max == null ? null : String(r.legionellen_max),
    legionellen_max_num: legMaxNum(r.legionellen_max),
    ueberschreitungen: Array.isArray(r.ueberschreitungen) ? r.ueberschreitungen as PbUeberschreitung[] : [],
    /* Scanner 1.15: Herkunft, Dokumentart, Ablageprüfung */
    kundennummer: r.kundennummer ?? undefined,
    herkunft: r.herkunft ?? undefined,
    herkunft_grund: r.herkunft_grund ?? undefined,
    dokumentart: r.dokumentart ?? undefined,
    dokumentart_grund: r.dokumentart_grund ?? undefined,
    objekt_quelle: r.objekt_quelle ?? undefined,
    ablage_status: r.ablage_status ?? undefined,
    ablage_grund: r.ablage_grund ?? undefined,
    ablage_bestaetigt: !!r.ablage_bestaetigt,
    ablage_bestaetigt_am: r.ablage_bestaetigt_am ?? null,
    ablage_status_berechnet: r.ablage_status_berechnet ?? null,
    ablage_grund_berechnet: r.ablage_grund_berechnet ?? null,
    /* Dateien */
    pdf_dateiname: r.pdf_dateiname ?? undefined,
    relativer_pfad: r.relativer_pfad ?? undefined,
    datei_hash: r.datei_hash ?? undefined,
    dateigroesse: r.dateigroesse ?? undefined,
    datei_geaendert: r.datei_geaendert ?? undefined,
    text_lesbar: r.text_lesbar ?? undefined,
    quellpfade: Array.isArray(r.quellpfade) ? r.quellpfade : (r.relativer_pfad ? [r.relativer_pfad] : []),
    fundstellen: r.fundstellen ?? undefined,
    datei_hashes: Array.isArray(r.datei_hashes) ? r.datei_hashes : (r.datei_hash ? [r.datei_hash] : []),
    hat_dateivarianten: !!r.hat_dateivarianten,
  }
}

const vereinigen = (a: string[] = [], b: string[] = []) => Array.from(new Set([...a, ...b]))

/** "<2" → 0 (unter Bestimmungsgrenze), "1300" → 1300, sonst null. */
function legMaxNum(v: unknown): number | null {
  if (v == null) return null
  const s = String(v).trim()
  if (/^</.test(s)) return 0
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/* ==========================================================
   Seite
   ========================================================== */

export default function Pruefberichte() {
  const { rolle } = useAuth()
  const darfSchreiben = demoModus || rolle === 'admin' || rolle === 'disposition'

  const [berichte, setBerichte] = useState<Pruefbericht[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [fachPhasen, setFachPhasen] = useState<Ueberschreitungsphase[]>([])
  const [laden, setLaden] = useState(true)
  const [meldung, setMeldung] = useState('')
  const [unter, setUnter] = useState<Unter>('jahr')

  // Kundenordner (OneDrive)
  const [ordner, setOrdner] = useState<FileSystemDirectoryHandle | null>(null)

  // Globale Filter – gelten für Jahresauswertung, Berichte UND Anlagen
  const [suche, setSuche] = useState('')
  const [fJahr, setFJahr] = useState('')
  const [fHv, setFHv] = useState('')
  const [fObjekt, setFObjekt] = useState('')
  const [fBefund, setFBefund] = useState('')
  const [fUmfang, setFUmfang] = useState('')
  const [fArt, setFArt] = useState('')
  const [fHerkunft, setFHerkunft] = useState('')
  const [fZuordnung, setFZuordnung] = useState('')
  const [nurUeberAnlagen, setNurUeberAnlagen] = useState(false)

  // Import
  const dateiRef = useRef<HTMLInputElement>(null)
  const [importLauf, setImportLauf] = useState(false)
  const [importBericht, setImportBericht] = useState('')

  // Manuelle Zuordnung
  const [zuordnenId, setZuordnenId] = useState<string | null>(null)
  const [zuordnenNr, setZuordnenNr] = useState('')

  // Automatik-Läufe
  const [autoLauf, setAutoLauf] = useState(false)

  async function ladeAlles() {
    setLaden(true)
    try {
      const [b, a, be, an, ku, ph] = await Promise.all([
        db.pruefberichte(), db.auftraege(), db.bereiche(), db.anlagen(), db.kunden(), db.phasen(),
      ])
      setBerichte(b); setAuftraege(a); setBereiche(be); setAnlagen(an); setKunden(ku); setFachPhasen(ph)
    } catch (e: any) {
      setMeldung('Fehler beim Laden: ' + (e?.message ?? e))
    } finally { setLaden(false) }
  }
  useEffect(() => { ladeAlles() }, [])
  useEffect(() => { gespeicherterOrdner().then(setOrdner).catch(() => {}) }, [])

  /* ---------- Nachschlagewerke ---------- */
  const kundenMap = useMemo(() => new Map(kunden.map(k => [k.id, k])), [kunden])
  const anlagenMap = useMemo(() => new Map(anlagen.map(a => [a.id, a])), [anlagen])
  const bereicheMap = useMemo(() => new Map(bereiche.map(b => [b.id, b])), [bereiche])
  const auftragNachNummer = useMemo(() => new Map(auftraege.map(a => [a.auftragsnummer, a])), [auftraege])
  const auftragNachId = useMemo(() => new Map(auftraege.map(a => [a.id, a])), [auftraege])

  function kontext(a?: Auftrag): AuftragKontext | undefined {
    if (!a) return undefined
    const bereich = bereicheMap.get(a.bereich_id)
    const anlage = bereich ? anlagenMap.get(bereich.anlage_id) : undefined
    const kunde = anlage ? kundenMap.get(anlage.kunde_id) : undefined
    return { auftrag: a, bereich, anlage, kunde }
  }

  /* ---------- Globale Filterung ---------- */
  const berichtJahre = useMemo(
    () => Array.from(new Set(berichte.map(b => b.jahr).filter(Boolean))).sort() as number[],
    [berichte])

  const hvListe = useMemo(() =>
    Array.from(new Set(berichte.map(b => b.hausverwaltung).filter(Boolean))).sort() as string[],
  [berichte])

  const objektListe = useMemo(() =>
    Array.from(new Set(berichte
      .filter(b => !fHv || b.hausverwaltung === fHv)
      .map(b => b.objekt).filter(Boolean))).sort() as string[],
  [berichte, fHv])

  const artenListe = useMemo(() =>
    Array.from(new Set(berichte.map(b => b.untersuchungsart).filter(Boolean))).sort() as string[],
  [berichte])

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase()
    return berichte.filter(b => {
      if (fJahr && String(b.jahr) !== fJahr) return false
      if (fHv && b.hausverwaltung !== fHv) return false
      if (fObjekt && b.objekt !== fObjekt) return false
      if (fBefund === 'ueber' && !b.ueberschreitung) return false
      if (fBefund === 'ohne' && (b.ueberschreitung || b.befund !== 'Ohne Befund')) return false
      if (fBefund === 'unklar' && b.befund !== 'Unklar') return false
      if (fUmfang) {
        const kurz = umfangKurz(b.umfang)
        if (fUmfang === 'kombi' ? b.umfang.length < 2 : !kurz.includes(fUmfang)) return false
      }
      if (fArt && b.untersuchungsart !== fArt) return false
      if (fHerkunft === 'nova' && b.herkunft !== 'NOVA') return false
      if (fHerkunft === 'fremd' && b.herkunft !== 'Fremd') return false
      if (fHerkunft === 'unklar' && b.herkunft && b.herkunft !== 'Unklar') return false
      if (fZuordnung === 'ja' && !b.auftrag_id) return false
      if (fZuordnung === 'nein' && b.auftrag_id) return false
      if (fZuordnung === 'ohne_nr' && b.auftragsnummer) return false
      if (s) {
        const ktx = b.auftrag_id ? kontext(auftragNachId.get(b.auftrag_id)) : undefined
        const heu = [b.berichtsnummer, b.auftragsnummer, b.hausverwaltung, b.objekt, b.bereich,
          b.anlage_laut_bericht, b.pdf_dateiname, b.kundennummer, ktx ? kundeAnzeige(ktx.kunde) : '',
          ktx?.anlage?.name, ktx?.bereich?.name].filter(Boolean).join(' ').toLowerCase()
        if (!heu.includes(s)) return false
      }
      return true
    })
  }, [berichte, suche, fJahr, fHv, fObjekt, fBefund, fUmfang, fArt, fHerkunft, fZuordnung,
    auftragNachId, bereicheMap, anlagenMap, kundenMap])

  const filterAktiv = !!(suche || fJahr || fHv || fObjekt || fBefund || fUmfang || fArt || fHerkunft || fZuordnung)
  function filterZuruecksetzen() {
    setSuche(''); setFJahr(''); setFHv(''); setFObjekt(''); setFBefund('')
    setFUmfang(''); setFArt(''); setFHerkunft(''); setFZuordnung('')
  }

  /* ---------- Abgleich: Bestandsanalysen ---------- */
  const auftraegeMitBericht = useMemo(() => {
    const s = new Set<string>()
    for (const b of berichte) if (b.auftrag_id) s.add(b.auftrag_id)
    return s
  }, [berichte])

  /** Aufträge, für die ein Prüfbericht zu erwarten wäre, aber keiner vorliegt. */
  const fehlendeBerichte = useMemo(() => {
    if (!berichtJahre.length) return []
    return auftraege
      .filter(a => berichtJahre.includes(a.jahr)
        && ['beprobt', 'im_labor', 'abgeschlossen'].includes(a.status)
        && !auftraegeMitBericht.has(a.id))
      .map(a => kontext(a)!)
  }, [auftraege, auftraegeMitBericht, berichtJahre, bereicheMap, anlagenMap, kundenMap])

  /** Berichte mit Auftragsnummer, die im Auftragsbuch nicht existiert. */
  const ohneTreffer = useMemo(() =>
    berichte.filter(b => !b.auftrag_id && b.auftragsnummer && !auftragNachNummer.has(basisNummer(b.auftragsnummer))),
  [berichte, auftragNachNummer])

  /** Berichte ganz ohne Auftragsnummer (Fremdberichte, Altbestand …). */
  const ohneNummer = useMemo(() =>
    berichte.filter(b => !b.auftrag_id && !b.auftragsnummer),
  [berichte])

  /** Zugeordnete Berichte, deren Umfang nicht zu den Unteraufträgen passt. */
  const unstimmig = useMemo(() => {
    const out: Array<{ bericht: Pruefbericht; ktx: AuftragKontext; fehltImAuftrag: Untersuchungsart[]; fehltImBericht: Untersuchungsart[] }> = []
    for (const b of berichte) {
      if (!b.auftrag_id) continue
      const a = auftragNachId.get(b.auftrag_id)
      if (!a) continue
      const berichtArten = new Set(umfangZuArten(b.umfang))
      if (!berichtArten.size) continue
      const auftragArten = new Set(
        (a.unterauftraege ?? []).filter(u => u.status !== 'storniert').map(u => u.art)
          .filter(x => ['legionellen', 'mibi', 'chemie'].includes(x)))
      const fehltImAuftrag = [...berichtArten].filter(x => !auftragArten.has(x))
      const fehltImBericht = [...auftragArten].filter(x => !berichtArten.has(x)) as Untersuchungsart[]
      if (fehltImAuftrag.length || fehltImBericht.length) {
        out.push({ bericht: b, ktx: kontext(a)!, fehltImAuftrag, fehltImBericht })
      }
    }
    return out
  }, [berichte, auftragNachId, bereicheMap, anlagenMap, kundenMap])

  /* ---------- Abgleich: Automatik-Vorschläge (Scanner 1.15, exakte Daten) ---------- */
  const ergVorschlaege: ErgebnisVorschlag[] = useMemo(
    () => ergebnisVorschlaege(berichte, auftragNachId),
    [berichte, auftragNachId])

  const phVorschlaege: PhasenVorschlag[] = useMemo(
    () => phasenVorschlaege(berichte, auftragNachId, fachPhasen),
    [berichte, auftragNachId, fachPhasen])
  const phOffen = phVorschlaege.filter(p => !p.uebersprungen)

  const abgleichZaehler = fehlendeBerichte.length + ohneTreffer.length + unstimmig.length
    + ergVorschlaege.length + phOffen.length

  /* ---------- Aktionen ---------- */

  async function ordnerAktion() {
    try {
      const h = await ordnerWaehlen()
      if (h) { setOrdner(h); setMeldung(`Kundenordner „${h.name}“ verbunden – PDF-Links sind jetzt klickbar.`) }
    } catch { /* Abbruch durch Nutzer */ }
  }

  async function pdfKlick(b: Pruefbericht) {
    if (!b.relativer_pfad) return
    if (!ordner) { setMeldung('Bitte zuerst oben rechts den Kundenordner (OneDrive → Kunden) verbinden.'); return }
    try {
      await pdfOeffnen(ordner, b.relativer_pfad)
    } catch (e: any) {
      setMeldung(`PDF nicht gefunden: ${b.relativer_pfad} – ${e?.message ?? e}`)
    }
  }

  async function importDatei(datei: File) {
    setImportLauf(true); setImportBericht('')
    try {
      const roh = JSON.parse(await datei.text())
      const reports: any[] = Array.isArray(roh?.reports) ? roh.reports : (Array.isArray(roh) ? roh : [])
      if (!reports.length) throw new Error('Keine „reports“ im JSON gefunden.')

      const bestehend = new Map(berichte.map(b => [b.id, b]))
      let neu = 0, aktualisiert = 0, uebersprungen = 0, autoZu = 0
      const upserts: Partial<Pruefbericht>[] = []

      for (const r of reports) {
        const j = ausJson(r)
        if (!j.id) continue
        const alt = bestehend.get(j.id)

        // Auto-Zuordnung: Auftragsnummer im Format YY-NNNN → Auftragsbuch
        let auftragId: string | null = alt?.auftrag_id ?? null
        let zuordnung = alt?.zuordnung_art ?? 'keine'
        if (zuordnung !== 'manuell') {
          const nr = basisNummer(j.auftragsnummer)
          const treffer = nr ? auftragNachNummer.get(nr) : undefined
          if (treffer) { auftragId = treffer.id; zuordnung = 'auto'; if (!alt?.auftrag_id) autoZu++ }
        }

        if (!alt) {
          upserts.push({ ...j, auftrag_id: auftragId, zuordnung_art: zuordnung })
          neu++
          continue
        }
        // Merge-Vertrag des Scanners: gleiche ID + bekannter Hash → nur Fundorte zusammenführen
        const hashBekannt = j.datei_hash && (alt.datei_hashes ?? []).includes(j.datei_hash)
        const versionNeuer = (j.berichtsversion ?? 0) > (alt.berichtsversion ?? 0)
        if (hashBekannt && !versionNeuer) {
          const pfade = vereinigen(alt.quellpfade, j.quellpfade)
          // Neue Scanner-Felder auch bei bekannten Hashes nachziehen (Alt-Import ohne Herkunft)
          const neueFelder: Partial<Pruefbericht> = {}
          if (!alt.herkunft && j.herkunft) {
            Object.assign(neueFelder, {
              herkunft: j.herkunft, herkunft_grund: j.herkunft_grund, kundennummer: j.kundennummer,
              dokumentart: j.dokumentart, dokumentart_grund: j.dokumentart_grund,
              ablage_status: j.ablage_status, ablage_grund: j.ablage_grund,
              ueberschreitungen: j.ueberschreitungen,
            })
          }
          if (pfade.length !== (alt.quellpfade ?? []).length || auftragId !== (alt.auftrag_id ?? null)
            || Object.keys(neueFelder).length) {
            upserts.push({
              id: j.id, quellpfade: pfade, datei_hashes: vereinigen(alt.datei_hashes, j.datei_hashes),
              fundstellen: pfade.length, hat_dateivarianten: alt.hat_dateivarianten || pfade.length > 1,
              auftrag_id: auftragId, zuordnung_art: zuordnung, ...neueFelder,
            } as Partial<Pruefbericht>)
            aktualisiert++
          } else uebersprungen++
        } else {
          // neuer Hash oder höhere Version → Bericht aktualisieren, Fundorte behalten
          upserts.push({
            ...j,
            quellpfade: vereinigen(alt.quellpfade, j.quellpfade),
            datei_hashes: vereinigen(alt.datei_hashes, j.datei_hashes),
            hat_dateivarianten: true,
            auftrag_id: auftragId, zuordnung_art: zuordnung,
          })
          aktualisiert++
        }
      }
      if (upserts.length) await db.pruefberichteUpsert(upserts)
      setImportBericht(`Import abgeschlossen: ${neu} neu, ${aktualisiert} aktualisiert, ${uebersprungen} unverändert, ${autoZu} automatisch dem Auftragsbuch zugeordnet.`)
      await ladeAlles()
    } catch (e: any) {
      setImportBericht('Import fehlgeschlagen: ' + (e?.message ?? e))
    } finally {
      setImportLauf(false)
      if (dateiRef.current) dateiRef.current.value = ''
    }
  }

  /** Nach neuen Aufträgen erneut automatisch abgleichen. */
  async function neuAbgleichen() {
    const updates: Partial<Pruefbericht>[] = []
    for (const b of berichte) {
      if (b.auftrag_id || b.zuordnung_art === 'manuell') continue
      const nr = basisNummer(b.auftragsnummer)
      const treffer = nr ? auftragNachNummer.get(nr) : undefined
      if (treffer) updates.push({ id: b.id, auftrag_id: treffer.id, zuordnung_art: 'auto' })
    }
    if (!updates.length) { setMeldung('Keine neuen Treffer – alles ist bereits abgeglichen.'); return }
    await db.pruefberichteUpsert(updates)
    setMeldung(`${updates.length} Bericht(e) neu zugeordnet.`)
    await ladeAlles()
  }

  /** Ergebnisse (und fachliche Art) aus den Prüfberichten ins Auftragsbuch übernehmen. */
  async function ergebnisseUebernehmen() {
    if (!ergVorschlaege.length) return
    setAutoLauf(true)
    try {
      let ergebnisse = 0
      const facharten = new Map<string, ErgebnisVorschlag>()
      for (const v of ergVorschlaege) {
        await db.unterauftragAktualisieren(v.unterauftrag.id, { ergebnis: v.neuesErgebnis })
        ergebnisse++
        if (v.fachart) facharten.set(v.auftrag.id, v)
      }
      for (const [auftragId, v] of facharten) {
        await db.auftragFachartSetzen(auftragId, v.fachart!)
      }
      setMeldung(`${ergebnisse} Ergebnis(se) übernommen, ${facharten.size} fachliche Untersuchungsart(en) gesetzt – alles belegt durch Prüfberichte.`)
      await ladeAlles()
    } catch (e: any) {
      setMeldung('Übernahme fehlgeschlagen: ' + (e?.message ?? e))
    } finally { setAutoLauf(false) }
  }

  /** Einen rückwirkend erkannten Phasen-Vorschlag als echte Phase anlegen. */
  async function phaseUebernehmen(v: PhasenVorschlag) {
    setAutoLauf(true)
    try {
      const nummern = v.berichte.map(b => b.berichtsnummer).filter(Boolean).join(', ')
      await db.phaseAnlegen({
        bereich_id: v.bereichId,
        eroeffnet_am: v.eroeffnetAm,
        ausloeser: 'ueberschreitung',
        status: v.status === 'abgeschlossen' ? 'abgeschlossen' : 'aktiv',
        abgeschlossen_am: v.abgeschlossenAm,
        saubere_nu_erforderlich: 3,
        begruendung_abweichung: v.status === 'abgeschlossen'
          ? 'Rückwirkend aus Prüfberichten übernommen – sauberer Folgebericht liegt vor.' : undefined,
        notizen: `Automatisch aus Prüfberichten abgeleitet (${nummern}).`,
      } as Omit<Ueberschreitungsphase, 'id'>)
      setMeldung(`Phase ab ${fmtDatum(v.eroeffnetAm)} angelegt (${v.status}).`)
      await ladeAlles()
    } catch (e: any) {
      setMeldung('Phase konnte nicht angelegt werden: ' + (e?.message ?? e))
    } finally { setAutoLauf(false) }
  }

  async function manuellZuordnen() {
    if (!zuordnenId) return
    const nr = zuordnenNr.trim()
    const a = auftragNachNummer.get(nr)
    if (!a) { setMeldung(`Auftrag ${nr || '–'} nicht im Auftragsbuch gefunden.`); return }
    await db.pruefberichtZuordnen(zuordnenId, a.id, 'manuell')
    setZuordnenId(null); setZuordnenNr('')
    setMeldung(`Bericht manuell dem Auftrag ${nr} zugeordnet.`)
    await ladeAlles()
  }

  async function zuordnungLoesen(b: Pruefbericht) {
    await db.pruefberichtZuordnen(b.id, null, 'keine')
    await ladeAlles()
  }

  /* ---------- Anzeige ---------- */

  if (laden) return <p className="hint">Auswertung wird geladen …</p>

  const mitFilterHinweis = filterAktiv ? ' (gefiltert)' : ''

  return (
    <>
      {meldung && <Meldung text={meldung} onWeg={() => setMeldung('')} />}

      {/* Kopf: Unterreiter + Kundenordner */}
      <div className="pb-kopf no-print">
        <div className="pb-untertabs">
          <button className={`pb-untertab ${unter === 'jahr' ? 'active' : ''}`} onClick={() => setUnter('jahr')}>
            <i className="fas fa-chart-simple" /> Jahresauswertung</button>
          <button className={`pb-untertab ${unter === 'berichte' ? 'active' : ''}`} onClick={() => setUnter('berichte')}>
            <i className="fas fa-file-shield" /> Prüfberichte</button>
          <button className={`pb-untertab ${unter === 'anlagen' ? 'active' : ''}`} onClick={() => setUnter('anlagen')}>
            <i className="fas fa-building" /> Untersuchte Anlagen</button>
          <button className={`pb-untertab ${unter === 'abgleich' ? 'active' : ''}`} onClick={() => setUnter('abgleich')}>
            <i className="fas fa-code-compare" /> Abgleich
            {abgleichZaehler > 0 && <span className="pb-zaehler">{abgleichZaehler}</span>}
          </button>
          <button className={`pb-untertab ${unter === 'phasen' ? 'active' : ''}`} onClick={() => setUnter('phasen')}>
            <i className="fas fa-diagram-project" /> Phasen</button>
          {darfSchreiben && (
            <button className={`pb-untertab ${unter === 'import' ? 'active' : ''}`} onClick={() => setUnter('import')}>
              <i className="fas fa-file-import" /> Import</button>
          )}
        </div>
        <div className="pb-ordner">
          {dateiZugriffVerfuegbar ? (
            ordner ? (
              <>
                <span className="pb-ordner-ok"><i className="fas fa-folder-open" /> Kundenordner: <strong>{ordner.name}</strong></span>
                <button className="pb-btn-klein" onClick={ordnerAktion} title="Anderen Ordner wählen"><i className="fas fa-rotate" /></button>
                <button className="pb-btn-klein" onClick={async () => { await ordnerVergessen(); setOrdner(null) }} title="Verbindung lösen"><i className="fas fa-xmark" /></button>
              </>
            ) : (
              <button className="pb-btn-ordner" onClick={ordnerAktion}>
                <i className="fas fa-folder-plus" /> Kundenordner verbinden (OneDrive)
              </button>
            )
          ) : <span className="hint">PDF-Direktöffnung braucht Chrome oder Edge.</span>}
        </div>
      </div>

      {/* Globale Filter – wie im Viewer: gelten für Auswertung, Berichte und Anlagen */}
      {['jahr', 'berichte', 'anlagen'].includes(unter) && (
        <>
          <div className="filters no-print">
            <div className="pb-suche">
              <i className="fas fa-magnifying-glass" />
              <input type="search" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="Suchen: Bericht-Nr., Auftrag, Kunde, Objekt, Bereich …" />
              {suche && <button className="pb-suche-leeren" onClick={() => setSuche('')}>×</button>}
            </div>
            <select value={fHv} onChange={e => { setFHv(e.target.value); setFObjekt('') }}>
              <option value="">Alle Hausverwaltungen</option>
              {hvListe.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <select value={fObjekt} onChange={e => setFObjekt(e.target.value)}>
              <option value="">Alle Objekte</option>
              {objektListe.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={fArt} onChange={e => setFArt(e.target.value)}>
              <option value="">Alle Untersuchungsarten</option>
              {artenListe.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={fUmfang} onChange={e => setFUmfang(e.target.value)}>
              <option value="">Alle Umfänge</option>
              <option value="Legio">Legionellen</option>
              <option value="Mibi">Mikrobiologie</option>
              <option value="Chemie">Chemie</option>
              <option value="kombi">Kombi (mehrere)</option>
            </select>
            <select value={fBefund} onChange={e => setFBefund(e.target.value)}>
              <option value="">Alle Befunde</option>
              <option value="ohne">ohne Befund</option>
              <option value="ueber">Überschreitung</option>
              <option value="unklar">unklar</option>
            </select>
            <select value={fHerkunft} onChange={e => setFHerkunft(e.target.value)}>
              <option value="">Herkunft: alle</option>
              <option value="nova">nur NOVA (Kundennr. bestätigt)</option>
              <option value="fremd">nur Fremdberichte</option>
              <option value="unklar">Herkunft unklar</option>
            </select>
            <select value={fZuordnung} onChange={e => setFZuordnung(e.target.value)}>
              <option value="">Zuordnung: alle</option>
              <option value="ja">mit Auftrag</option>
              <option value="nein">ohne Auftrag</option>
              <option value="ohne_nr">ohne Auftragsnummer</option>
            </select>
            {filterAktiv && <button onClick={filterZuruecksetzen}><i className="fas fa-rotate-left" /> Zurücksetzen</button>}
          </div>
          <div className="filters no-print" style={{ marginTop: 0 }}>
            <div className="pb-chips">
              <button className={`pb-chip ${!fJahr ? 'active' : ''}`} onClick={() => setFJahr('')}>Alle Jahrgänge</button>
              {berichtJahre.map(j => (
                <button key={j} className={`pb-chip ${fJahr === String(j) ? 'active' : ''}`}
                  onClick={() => setFJahr(fJahr === String(j) ? '' : String(j))}>{j}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {unter === 'jahr' && <Jahresauswertung berichte={gefiltert} filterHinweis={mitFilterHinweis} />}

      {unter === 'berichte' && (
        <Abschnitt titel={`Prüfberichte (${gefiltert.length} von ${berichte.length})`}>
          <div className="table-container">
            <table>
              <thead><tr>
                <th>Bericht</th><th>Auftrag</th><th>Kunde / Objekt</th><th>Probenahme</th>
                <th>Art</th><th>Umfang</th><th>Befund</th><th>Höchste Überschr.</th><th>Herkunft</th><th>PDF</th>
              </tr></thead>
              <tbody>
                {[...gefiltert]
                  .sort((a, b) => (b.probenahmedatum ?? '').localeCompare(a.probenahmedatum ?? ''))
                  .map(b => {
                    const ktx = b.auftrag_id ? kontext(auftragNachId.get(b.auftrag_id)) : undefined
                    const top = hoechsteUeber(b)
                    return (
                      <tr key={b.id} className={b.ueberschreitung ? 'pb-zeile-rot' : ''}>
                        <td><Nr>{b.berichtsnummer || '–'}</Nr>{(b.berichtsversion ?? 1) > 1 && <span className="pb-version">v{b.berichtsversion}</span>}</td>
                        <td>
                          {ktx ? <><span title={b.auftragsnummer_quelle ? `Quelle: ${b.auftragsnummer_quelle}` : undefined}><Nr>{ktx.auftrag.auftragsnummer}</Nr></span>
                            {b.zuordnung_art === 'manuell' && <i className="fas fa-hand pb-manuell" title="manuell zugeordnet" />}
                            {darfSchreiben && <button className="pb-btn-klein" title="Zuordnung lösen" onClick={() => zuordnungLoesen(b)}><i className="fas fa-link-slash" /></button>}
                          </> : b.auftragsnummer
                            ? <span className="badge medium" title="Nummer nicht im Auftragsbuch">{b.auftragsnummer} ?</span>
                            : <span className="badge neutral">–</span>}
                          {!ktx && darfSchreiben && (
                            <button className="pb-btn-klein" title="Manuell zuordnen"
                              onClick={() => { setZuordnenId(b.id); setZuordnenNr(b.auftragsnummer ?? '') }}>
                              <i className="fas fa-link" /></button>
                          )}
                        </td>
                        <td>
                          {ktx ? (
                            <><strong>{kundeAnzeige(ktx.kunde)}</strong><br />
                              <span className="hint">{ktx.anlage?.name}{ktx.bereich && ktx.bereich.name !== ktx.anlage?.name ? ` · ${ktx.bereich.name}` : ''}</span></>
                          ) : (
                            <><strong>{b.hausverwaltung || '–'}</strong><br />
                              <span className="hint">{b.objekt}{b.bereich && b.bereich !== b.objekt ? ` · ${b.bereich}` : ''}</span></>
                          )}
                        </td>
                        <td>{fmtDatum(b.probenahmedatum ?? undefined)}</td>
                        <td>{b.untersuchungsart || '–'}</td>
                        <td>{umfangKurz(b.umfang)}</td>
                        <td>{befundBadge(b.befund, b.ueberschreitung)}
                          {b.legionellen_max == null && b.befund === 'Unklar' && b.befund_grund &&
                            <i className="fas fa-circle-info pb-info" title={b.befund_grund} />}</td>
                        <td>{top ? <strong title={top.titel} style={{ color: '#99342e' }}>{top.text}</strong>
                          : (b.legionellen_max != null ? <span title="Höchster Legionellen-Messwert (keine Überschreitung)">{b.legionellen_max}</span> : '–')}</td>
                        <td>{herkunftBadge(b)}</td>
                        <td>
                          {b.relativer_pfad ? (
                            <button className="pb-datei" onClick={() => pdfKlick(b)}
                              title={`${b.relativer_pfad}\n${bytesFmt(b.dateigroesse)}`}>
                              <i className="fas fa-file-pdf" /> {b.pdf_dateiname || 'PDF öffnen'}
                            </button>
                          ) : '–'}
                        </td>
                      </tr>
                    )
                  })}
                {!gefiltert.length && <tr><td colSpan={10} className="hint">Keine Berichte gefunden{berichte.length ? ' – Filter anpassen.' : ' – zuerst im Reiter „Import“ das Scanner-JSON einlesen.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Abschnitt>
      )}

      {unter === 'anlagen' && (
        <>
          <div className="filters no-print">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={nurUeberAnlagen} onChange={e => setNurUeberAnlagen(e.target.checked)} />
              nur Bereiche mit Überschreitung
            </label>
          </div>
          <AnlagenUebersicht berichte={gefiltert} nurUeber={nurUeberAnlagen} filterHinweis={mitFilterHinweis} />
        </>
      )}

      {unter === 'abgleich' && (
        <>
          {darfSchreiben && (
            <div className="filters no-print" style={{ marginBottom: 12 }}>
              <button onClick={neuAbgleichen}><i className="fas fa-rotate" /> Neu abgleichen (Auftragsnummern)</button>
            </div>
          )}

          {/* --- Automatik 1: Ergebnisse aus Prüfberichten --- */}
          <Abschnitt titel={`Ergebnisse aus Prüfberichten übernehmen (${ergVorschlaege.length})`}
            legende={<span className="hint">Zugeordnete Berichte mit eindeutigem Befund füllen offene Unteraufträge automatisch:
              Überschreitung → überschritten, sauber → ohne Befund. Orientierende Untersuchungen ohne Befund bestätigen so den Regelturnus.
              Berichte mit unklarem Befund werden nie automatisch übernommen.</span>}>
            {ergVorschlaege.length > 0 && darfSchreiben && (
              <div className="filters no-print" style={{ padding: '10px 20px 0' }}>
                <button className="pb-btn-ordner" disabled={autoLauf} onClick={ergebnisseUebernehmen}>
                  <i className={`fas ${autoLauf ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`} /> Alle {ergVorschlaege.length} Ergebnisse übernehmen
                </button>
              </div>
            )}
            <div className="table-container">
              <table>
                <thead><tr><th>Auftrag</th><th>Untersuchung</th><th>Bericht</th><th>Probenahme</th><th>Neues Ergebnis</th><th>Fachliche Art</th></tr></thead>
                <tbody>
                  {ergVorschlaege.slice(0, 60).map(v => (
                    <tr key={v.unterauftrag.id}>
                      <td><Nr>{v.auftrag.auftragsnummer}</Nr></td>
                      <td>{ART_LABEL[v.unterauftrag.art]}</td>
                      <td><Nr>{v.bericht.berichtsnummer}</Nr></td>
                      <td>{fmtDatum(v.bericht.probenahmedatum ?? undefined)}</td>
                      <td>{v.neuesErgebnis === 'ueberschritten'
                        ? <span className="badge active">Überschreitung</span>
                        : <span className="badge closed" title={v.hinweis}>ohne Befund</span>}</td>
                      <td>{v.fachart ? FACHLICHE_ART_LABEL[v.fachart] : <span className="hint">bleibt</span>}</td>
                    </tr>
                  ))}
                  {ergVorschlaege.length > 60 && <tr><td colSpan={6} className="hint">… und {ergVorschlaege.length - 60} weitere.</td></tr>}
                  {!ergVorschlaege.length && <tr><td colSpan={6} className="hint">Nichts zu übernehmen – alle zugeordneten Berichte sind bereits im Auftragsbuch verbucht.</td></tr>}
                </tbody>
              </table>
            </div>
          </Abschnitt>

          {/* --- Automatik 2: rückwirkende Phasen --- */}
          <Abschnitt titel={`Phasen rückwirkend aus Prüfberichten (${phOffen.length} Vorschläge)`}
            legende={<span className="hint">Datumsgenau aus den Berichten abgeleitet – kein Raten mehr: eine Überschreitung eröffnet die Phase,
              der erste saubere Folgebericht im selben Bereich schließt sie. Bereits erfasste Phasen werden erkannt und übersprungen.</span>}>
            <div className="table-container">
              <table>
                <thead><tr><th>Bereich</th><th>Eröffnet</th><th>Auslöser</th><th>Berichte</th><th>Abgeschlossen</th><th>Status</th>{darfSchreiben && <th></th>}</tr></thead>
                <tbody>
                  {phVorschlaege.map((v, i) => {
                    const be = bereicheMap.get(v.bereichId)
                    const an = be ? anlagenMap.get(be.anlage_id) : undefined
                    const ku = an ? kundenMap.get(an.kunde_id) : undefined
                    return (
                      <tr key={v.bereichId + v.eroeffnetAm + i} style={v.uebersprungen ? { opacity: .55 } : undefined}>
                        <td><strong>{kundeAnzeige(ku)}</strong><br />
                          <span className="hint">{an?.name}{be && be.name !== an?.name ? ` · ${be.name}` : ''}</span></td>
                        <td>{fmtDatum(v.eroeffnetAm)}</td>
                        <td><Nr>{v.ausloeser.berichtsnummer}</Nr>{v.ausloeser.legionellen_max ? <span className="hint"> max {v.ausloeser.legionellen_max}</span> : null}</td>
                        <td>{v.berichte.map(b => b.berichtsnummer).filter(Boolean).join(', ')}</td>
                        <td>{v.abgeschlossenAm ? fmtDatum(v.abgeschlossenAm) : '–'}</td>
                        <td>{v.uebersprungen
                          ? <span className="badge neutral" title={v.uebersprungen}>bereits erfasst</span>
                          : v.status === 'abgeschlossen'
                            ? <span className="badge closed">abgeschlossen</span>
                            : <span className="badge active">noch aktiv</span>}</td>
                        {darfSchreiben && <td>{!v.uebersprungen &&
                          <button className="pb-btn-klein" disabled={autoLauf} onClick={() => phaseUebernehmen(v)}>
                            <i className="fas fa-plus" /> Phase anlegen</button>}</td>}
                      </tr>
                    )
                  })}
                  {!phVorschlaege.length && <tr><td colSpan={7} className="hint">Keine Phasen ableitbar – es liegen keine zugeordneten Berichte mit Überschreitung vor.</td></tr>}
                </tbody>
              </table>
            </div>
          </Abschnitt>

          <Abschnitt titel={`Fehlende Prüfberichte (${fehlendeBerichte.length})`}
            legende={<span className="hint">Aufträge {berichtJahre.join(' / ')} mit Status beprobt, im Labor oder abgeschlossen, zu denen kein Prüfbericht gefunden wurde.</span>}>
            <div className="table-container">
              <table>
                <thead><tr><th>Auftrag</th><th>Status</th><th>Kunde</th><th>Anlage / Bereich</th><th>Untersuchungen</th></tr></thead>
                <tbody>
                  {fehlendeBerichte.map(k => (
                    <tr key={k.auftrag.id}>
                      <td><Nr>{k.auftrag.auftragsnummer}</Nr></td>
                      <td><span className={`badge ${({ beprobt: 'high', im_labor: 'medium', abgeschlossen: 'closed' } as Record<string, string>)[k.auftrag.status] ?? 'neutral'}`}>{k.auftrag.status.replace('_', ' ')}</span></td>
                      <td>{kundeAnzeige(k.kunde)}</td>
                      <td>{k.anlage?.name}{k.bereich && k.bereich.name !== k.anlage?.name ? ` · ${k.bereich.name}` : ''}</td>
                      <td>{(k.auftrag.unterauftraege ?? []).filter(u => u.status !== 'storniert').map(u => ART_LABEL[u.art]).join(', ') || '–'}</td>
                    </tr>
                  ))}
                  {!fehlendeBerichte.length && <tr><td colSpan={5} className="hint">Sehr gut – zu allen relevanten Aufträgen liegt ein Prüfbericht vor.</td></tr>}
                </tbody>
              </table>
            </div>
          </Abschnitt>

          <Abschnitt titel={`Berichte mit unbekannter Auftragsnummer (${ohneTreffer.length})`}
            legende={<span className="hint">Auf dem Bericht steht eine Nummer, die (noch) nicht im Auftragsbuch existiert – z. B. Alt-Nummern oder Tippfehler des Scanners.</span>}>
            <div className="table-container">
              <table>
                <thead><tr><th>Bericht</th><th>Nummer lt. Bericht</th><th>Herkunft</th><th>Hausverwaltung / Objekt</th><th>Probenahme</th><th>Umfang</th>{darfSchreiben && <th></th>}</tr></thead>
                <tbody>
                  {ohneTreffer.map(b => (
                    <tr key={b.id}>
                      <td><Nr>{b.berichtsnummer}</Nr></td>
                      <td><span className="badge medium">{b.auftragsnummer}</span></td>
                      <td>{herkunftBadge(b)}</td>
                      <td><strong>{b.hausverwaltung}</strong> · {b.objekt}</td>
                      <td>{fmtDatum(b.probenahmedatum ?? undefined)}</td>
                      <td>{umfangKurz(b.umfang)}</td>
                      {darfSchreiben && <td><button className="pb-btn-klein" onClick={() => { setZuordnenId(b.id); setZuordnenNr('') }}><i className="fas fa-link" /> zuordnen</button></td>}
                    </tr>
                  ))}
                  {!ohneTreffer.length && <tr><td colSpan={7} className="hint">Keine offenen Fälle.</td></tr>}
                </tbody>
              </table>
            </div>
          </Abschnitt>

          <Abschnitt titel={`Umfang passt nicht zum Auftrag (${unstimmig.length})`}
            legende={<span className="hint">Der Untersuchungsumfang laut Bericht weicht von den Unteraufträgen ab – Hinweis auf fehlende Teilberichte oder überzählige Unteraufträge.</span>}>
            <div className="table-container">
              <table>
                <thead><tr><th>Bericht</th><th>Auftrag</th><th>Kunde</th><th>Bericht enthält, Auftrag nicht</th><th>Auftrag erwartet, Bericht nicht</th></tr></thead>
                <tbody>
                  {unstimmig.map(x => (
                    <tr key={x.bericht.id}>
                      <td><Nr>{x.bericht.berichtsnummer}</Nr></td>
                      <td><Nr>{x.ktx.auftrag.auftragsnummer}</Nr></td>
                      <td>{kundeAnzeige(x.ktx.kunde)}</td>
                      <td>{x.fehltImAuftrag.map(a => ART_LABEL[a]).join(', ') || '–'}</td>
                      <td>{x.fehltImBericht.map(a => ART_LABEL[a]).join(', ') || '–'}</td>
                    </tr>
                  ))}
                  {!unstimmig.length && <tr><td colSpan={5} className="hint">Alle zugeordneten Berichte passen zum Untersuchungsumfang.</td></tr>}
                </tbody>
              </table>
            </div>
          </Abschnitt>

          <Abschnitt titel={`Berichte ohne Auftragsnummer (${ohneNummer.length})`}
            legende={<span className="hint">Auf diesen Berichten konnte der Scanner keine Auftragsnummer lesen – meist Fremd- oder Altberichte. Die Herkunftsspalte zeigt, ob die NOVA-Kundennummer im Bericht steht.</span>}>
            <div className="table-container">
              <table>
                <thead><tr><th>Bericht</th><th>Herkunft</th><th>Hausverwaltung / Objekt</th><th>Probenahme</th><th>Umfang</th><th>Art</th>{darfSchreiben && <th></th>}</tr></thead>
                <tbody>
                  {ohneNummer.map(b => (
                    <tr key={b.id}>
                      <td><Nr>{b.berichtsnummer}</Nr></td>
                      <td>{herkunftBadge(b)}</td>
                      <td><strong>{b.hausverwaltung}</strong> · {b.objekt}</td>
                      <td>{fmtDatum(b.probenahmedatum ?? undefined)}</td>
                      <td>{umfangKurz(b.umfang)}</td>
                      <td>{b.untersuchungsart}</td>
                      {darfSchreiben && <td><button className="pb-btn-klein" onClick={() => { setZuordnenId(b.id); setZuordnenNr('') }}><i className="fas fa-link" /> zuordnen</button></td>}
                    </tr>
                  ))}
                  {!ohneNummer.length && <tr><td colSpan={7} className="hint">Keine Berichte ohne Auftragsnummer.</td></tr>}
                </tbody>
              </table>
            </div>
          </Abschnitt>
        </>
      )}

      {unter === 'phasen' && <Phasen />}

      {unter === 'import' && darfSchreiben && (
        <Abschnitt titel="Scanner-JSON importieren">
          <div className="pb-import">
            <p>Hier die Export-Datei des <strong>NOVA Prüfberichte-Scanners</strong> (ab Version 1.15) einlesen.
              Der Import folgt dem Merge-Vertrag des Scanners:</p>
            <ul>
              <li>Neue Berichte werden angelegt – <em>nur</em> mit den Feldern aus dem JSON.</li>
              <li>Gleiche Berichts-ID mit bekanntem Datei-Hash → nur Fundorte werden ergänzt.
                Neue Scanner-Felder (Herkunft, Kundennummer, Ablage) werden dabei nachgezogen.</li>
              <li>Neuer Hash oder höhere Berichtsversion → der Bericht wird aktualisiert.</li>
              <li>Auftragsnummern im Format <code>JJ-NNNN</code> werden automatisch mit dem Auftragsbuch verknüpft; manuelle Zuordnungen bleiben unangetastet.</li>
              <li>Nach dem Import stehen im Reiter <strong>Abgleich</strong> die automatischen Vorschläge bereit
                (Ergebnisse übernehmen, Phasen rückwirkend anlegen).</li>
            </ul>
            <div className="pb-dropzone"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) importDatei(f) }}
              onClick={() => dateiRef.current?.click()}>
              <i className="fas fa-file-arrow-up" />
              <div><strong>JSON hier ablegen</strong> oder klicken zum Auswählen</div>
              <input ref={dateiRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) importDatei(f) }} />
            </div>
            {importLauf && <p className="hint"><i className="fas fa-spinner fa-spin" /> Import läuft – bitte warten …</p>}
            {importBericht && <p className={importBericht.startsWith('Import fehlgeschlagen') ? 'pb-import-fehler' : 'pb-import-ok'}>{importBericht}</p>}
          </div>
        </Abschnitt>
      )}

      {zuordnenId && (
        <div className="modal-hintergrund" onClick={() => setZuordnenId(null)}>
          <div className="modal pb-modal" onClick={e => e.stopPropagation()}>
            <h3><i className="fas fa-link" /> Bericht manuell zuordnen</h3>
            <p className="hint">Auftragsnummer aus dem Auftragsbuch eingeben (Format JJ-NNNN):</p>
            <input autoFocus value={zuordnenNr} onChange={e => setZuordnenNr(e.target.value)}
              placeholder="z. B. 26-0987" onKeyDown={e => { if (e.key === 'Enter') manuellZuordnen() }} />
            <div className="pb-modal-aktionen">
              <button onClick={() => setZuordnenId(null)}>Abbrechen</button>
              <button className="primary" onClick={manuellZuordnen}><i className="fas fa-check" /> Zuordnen</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ==========================================================
   Balkenliste in Viewer-Optik
   ========================================================== */
function BalkenListe({ titel, zeilen, maxZeilen = 20, sortieren = true, hinweis }: {
  titel: string
  zeilen: Array<{ label: string; wert: number; nebenwert?: number; nebenTitel?: string }>
  maxZeilen?: number
  sortieren?: boolean
  hinweis?: string
}) {
  const basis = sortieren ? [...zeilen].sort((a, b) => b.wert - a.wert) : zeilen
  const sichtbar = basis.slice(0, maxZeilen)
  const max = Math.max(...sichtbar.map(z => z.wert), 1)
  return (
    <Abschnitt titel={titel} legende={hinweis ? <span className="hint">{hinweis}</span> : undefined}>
      <div className="pb-barlist">
        {sichtbar.map(z => (
          <div key={z.label} className="pb-barrow">
            <div className="pb-barlabel" title={z.label}>{z.label}</div>
            <div className="pb-bartrack">
              <div className="pb-barfill" style={{ width: `${(z.wert / max) * 100}%` }} />
              {z.nebenwert ? <div className="pb-barfill bad" style={{ width: `${(z.nebenwert / max) * 100}%` }}
                title={`${z.nebenTitel ?? 'davon'}: ${z.nebenwert}`} /> : null}
            </div>
            <div className="pb-barval">{z.wert}{z.nebenwert ? <span className="pb-barval-bad"> / {z.nebenwert}</span> : null}</div>
          </div>
        ))}
        {!sichtbar.length && <p className="hint">Noch keine Daten – zuerst Berichte importieren.</p>}
      </div>
    </Abschnitt>
  )
}

/* ==========================================================
   Jahresauswertung (Viewer-Startansicht)
   ========================================================== */
function Jahresauswertung({ berichte, filterHinweis }: { berichte: Pruefbericht[]; filterHinweis: string }) {
  const ueber = berichte.filter(b => b.ueberschreitung)
  const quote = berichte.length ? ((ueber.length / berichte.length) * 100).toFixed(1) : '0'
  const novaAnzahl = berichte.filter(b => b.herkunft === 'NOVA').length

  const bereicheUnters = useMemo(() => {
    const s = new Set<string>()
    for (const b of berichte) s.add(`${b.hausverwaltung}|${b.objekt}|${b.bereich}`)
    return s.size
  }, [berichte])

  const proHV = useMemo(() => {
    const m = new Map<string, { wert: number; ueber: number }>()
    for (const b of berichte) {
      const k = b.hausverwaltung || '(ohne Hausverwaltung)'
      const e = m.get(k) ?? { wert: 0, ueber: 0 }
      e.wert++; if (b.ueberschreitung) e.ueber++
      m.set(k, e)
    }
    return [...m.entries()].map(([label, e]) => ({ label, wert: e.wert, nebenwert: e.ueber || undefined, nebenTitel: 'Überschreitungen' }))
  }, [berichte])

  const zaehleMitUeber = (fn: (b: Pruefbericht) => string | undefined, leer: string) => {
    const m = new Map<string, { wert: number; ueber: number }>()
    for (const b of berichte) {
      const k = fn(b) || leer
      const e = m.get(k) ?? { wert: 0, ueber: 0 }
      e.wert++; if (b.ueberschreitung) e.ueber++
      m.set(k, e)
    }
    return [...m.entries()].map(([label, e]) => ({ label, wert: e.wert, nebenwert: e.ueber || undefined, nebenTitel: 'Überschreitungen' }))
  }

  const proMonat = useMemo(() => {
    const werte = MONATE.map(label => ({ label, wert: 0, nebenwert: 0 }))
    for (const b of berichte) {
      if (!b.probenahmedatum) continue
      const m = +b.probenahmedatum.slice(5, 7) - 1
      if (m < 0 || m > 11) continue
      werte[m].wert++
      if (b.ueberschreitung) werte[m].nebenwert++
    }
    return werte.map(w => ({ ...w, nebenwert: w.nebenwert || undefined, nebenTitel: 'Überschreitungen' }))
  }, [berichte])

  const ueberDetail = useMemo(() => {
    const out: Array<{ b: Pruefbericht; u: PbUeberschreitung }> = []
    for (const b of ueber) {
      const liste = b.ueberschreitungen ?? []
      if (liste.length) for (const u of liste) out.push({ b, u })
      else out.push({ b, u: { parameter: b.legionellen_max ? 'Legionellen' : '(Parameter unbekannt)', anzeigewert: b.legionellen_max ?? undefined } })
    }
    return out.sort((x, y) => (y.b.probenahmedatum ?? '').localeCompare(x.b.probenahmedatum ?? ''))
  }, [ueber])

  return (
    <>
      <div className="cards">
        <div className="card"><div className="label">Prüfberichte{filterHinweis}</div><div className="value">{berichte.length}</div></div>
        <div className="card"><div className="label">Bereiche untersucht</div><div className="value">{bereicheUnters}</div></div>
        <div className="card pb-kpi-bad"><div className="label">Überschreitungen</div><div className="value">{ueber.length}</div></div>
        <div className="card"><div className="label">Quote</div><div className="value">{quote}&nbsp;%</div></div>
        <div className="card"><div className="label">Hausverwaltungen</div><div className="value">{proHV.length}</div></div>
        <div className="card"><div className="label">Sicher von NOVA</div><div className="value">{novaAnzahl}</div></div>
      </div>

      <div className="pb-auswertung-grid">
        <BalkenListe titel="Untersuchungsarten (rot = davon Überschreitungen)"
          zeilen={zaehleMitUeber(b => b.untersuchungsart, 'Unbekannt')} />
        <BalkenListe titel="Untersuchungsumfang"
          zeilen={zaehleMitUeber(b => umfangKurz(b.umfang), '–')} />
      </div>

      <BalkenListe titel="Probenahmen im Jahresverlauf (rot = Berichte mit Überschreitung)"
        zeilen={proMonat} sortieren={false} maxZeilen={12} />

      <Abschnitt titel={`Überschreitungen im Detail (${ueberDetail.length})`}
        legende={<span className="hint">Jede Zeile ist ein überschrittener Parameter – exakt aus dem Prüfbericht gelesen.</span>}>
        <div className="table-container">
          <table>
            <thead><tr><th>Probenahme</th><th>Bericht</th><th>Hausverwaltung</th><th>Objekt / Bereich</th><th>Parameter</th><th>Wert</th><th>Grenzwert</th></tr></thead>
            <tbody>
              {ueberDetail.slice(0, 200).map(({ b, u }, i) => (
                <tr key={b.id + (u.parameter ?? '') + i} className="pb-zeile-rot">
                  <td>{fmtDatum(b.probenahmedatum ?? undefined)}</td>
                  <td><Nr>{b.berichtsnummer}</Nr></td>
                  <td>{b.hausverwaltung || '–'}</td>
                  <td>{b.objekt}{b.bereich && b.bereich !== b.objekt ? ` · ${b.bereich}` : ''}</td>
                  <td><strong>{u.parameter}</strong>{u.gruppe && u.gruppe !== u.parameter ? <span className="hint"> ({u.gruppe})</span> : null}</td>
                  <td><strong style={{ color: '#99342e' }}>{u.anzeigewert ?? u.wert ?? '–'}{u.einheit ? ` ${u.einheit}` : ''}</strong></td>
                  <td>{u.grenzwert != null ? `${u.grenzwert}${u.einheit ? ` ${u.einheit}` : ''}` : '–'}</td>
                </tr>
              ))}
              {ueberDetail.length > 200 && <tr><td colSpan={7} className="hint">… und {ueberDetail.length - 200} weitere – Filter nutzen.</td></tr>}
              {!ueberDetail.length && <tr><td colSpan={7} className="hint">Keine Überschreitungen im gewählten Zeitraum. 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      </Abschnitt>

      <BalkenListe titel="Hausverwaltungen im Vergleich (rot = davon Überschreitungen)" zeilen={proHV} maxZeilen={25} />
    </>
  )
}

/* ==========================================================
   Untersuchte Anlagen – eine Zeile je Bereich (Viewer-Ansicht 3)
   ========================================================== */
function AnlagenUebersicht({ berichte, nurUeber, filterHinweis }: {
  berichte: Pruefbericht[]; nurUeber: boolean; filterHinweis: string
}) {
  const zeilen = useMemo(() => {
    const m = new Map<string, {
      hv: string; objekt: string; bereich: string
      anzahl: number; ueber: number; letzte: string; jahre: Set<number>; arten: Set<string>
      letzterUeber?: string
    }>()
    for (const b of berichte) {
      const key = `${b.hausverwaltung}|${b.objekt}|${b.bereich}`
      const e = m.get(key) ?? {
        hv: b.hausverwaltung || '–', objekt: b.objekt || '–', bereich: b.bereich || '–',
        anzahl: 0, ueber: 0, letzte: '', jahre: new Set<number>(), arten: new Set<string>(),
      }
      e.anzahl++
      if (b.ueberschreitung) {
        e.ueber++
        if ((b.probenahmedatum ?? '') > (e.letzterUeber ?? '')) e.letzterUeber = b.probenahmedatum ?? undefined
      }
      if ((b.probenahmedatum ?? '') > e.letzte) e.letzte = b.probenahmedatum ?? ''
      if (b.jahr) e.jahre.add(b.jahr)
      const kurz = umfangKurz(b.umfang); if (kurz !== '–') e.arten.add(kurz)
      m.set(key, e)
    }
    return [...m.values()]
      .filter(e => !nurUeber || e.ueber > 0)
      .sort((a, b) => b.ueber - a.ueber || a.hv.localeCompare(b.hv) || a.objekt.localeCompare(b.objekt))
  }, [berichte, nurUeber])

  return (
    <Abschnitt titel={`Untersuchte Anlagen und Bereiche (${zeilen.length})${filterHinweis}`}
      legende={<span className="hint">Kompakte Aufstellung: eine Zeile je Bereich, zusammengefasst über alle gefilterten Berichte.</span>}>
      <div className="table-container">
        <table>
          <thead><tr>
            <th>Hausverwaltung</th><th>Objekt</th><th>Bereich</th><th>Berichte</th>
            <th>Umfang</th><th>Jahrgänge</th><th>Letzte Probenahme</th><th>Befund</th>
          </tr></thead>
          <tbody>
            {zeilen.map(z => (
              <tr key={z.hv + z.objekt + z.bereich} className={z.ueber ? 'pb-zeile-rot' : ''}>
                <td><strong>{z.hv}</strong></td>
                <td>{z.objekt}</td>
                <td>{z.bereich !== z.objekt ? z.bereich : <span className="hint">–</span>}</td>
                <td>{z.anzahl}</td>
                <td>{[...z.arten].join(', ') || '–'}</td>
                <td>{[...z.jahre].sort().join(', ')}</td>
                <td>{fmtDatum(z.letzte || undefined)}</td>
                <td>{z.ueber
                  ? <span className="badge active" title={z.letzterUeber ? `letzte Überschreitung: ${fmtDatum(z.letzterUeber)}` : undefined}>{z.ueber}× Überschreitung</span>
                  : <span className="badge closed">ohne Befund</span>}</td>
              </tr>
            ))}
            {!zeilen.length && <tr><td colSpan={8} className="hint">Keine Bereiche im gewählten Filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </Abschnitt>
  )
}
