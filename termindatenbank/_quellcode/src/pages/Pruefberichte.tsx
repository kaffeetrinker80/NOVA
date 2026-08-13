import { useEffect, useMemo, useRef, useState } from 'react'
import { db, demoModus } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Abschnitt, Meldung, Nr } from '../components/ui'
import {
  Anlage, Auftrag, Bereich, Kunde, Pruefbericht,
  fmtDatum, kundeAnzeige, umfangKurz, umfangZuArten, ART_LABEL, Untersuchungsart,
} from '../lib/types'
import {
  dateiZugriffVerfuegbar, gespeicherterOrdner, ordnerWaehlen, ordnerVergessen, pdfOeffnen,
} from '../lib/kundenordner'
import Phasen from './Auswertungen'

/* ---------- Hilfen ---------- */

const NUMMER_RE = /^\d{2}-\d{4}$/

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

type Unter = 'berichte' | 'auswertung' | 'abgleich' | 'phasen' | 'import'

interface AuftragKontext {
  auftrag: Auftrag
  bereich?: Bereich
  anlage?: Anlage
  kunde?: Kunde
}

function befundBadge(b?: string, ueber?: boolean) {
  if (ueber || b === 'Überschreitung') return <span className="badge active">Überschreitung</span>
  if (b === 'Ohne Befund') return <span className="badge closed">ohne Befund</span>
  return <span className="badge medium">{b || 'unklar'}</span>
}

function bytesFmt(n?: number): string {
  if (!n) return '–'
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return Math.round(n / 1024) + ' KB'
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
    probenahmedatum: r.probenahmedatum || null,
    untersuchungsart: r.untersuchungsart ?? undefined,
    untersuchungsart_quelle: r.untersuchungsart_quelle ?? undefined,
    umfang: Array.isArray(r.umfang) ? r.umfang : [],
    parameter: Array.isArray(r.parameter) ? r.parameter : [],
    befund: r.befund ?? undefined,
    ueberschreitung: !!r.ueberschreitung,
    befund_grund: r.befund_grund ?? undefined,
    legionellen_max: r.legionellen_max == null ? null : String(r.legionellen_max),
    legionellen_max_num: legMaxNum(r.legionellen_max),
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

/* ---------- Seite ---------- */

export default function Pruefberichte() {
  const { rolle } = useAuth()
  const darfSchreiben = demoModus || rolle === 'admin' || rolle === 'disposition'

  const [berichte, setBerichte] = useState<Pruefbericht[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [laden, setLaden] = useState(true)
  const [meldung, setMeldung] = useState('')
  const [unter, setUnter] = useState<Unter>('berichte')

  // Kundenordner (OneDrive)
  const [ordner, setOrdner] = useState<FileSystemDirectoryHandle | null>(null)

  // Filter
  const [suche, setSuche] = useState('')
  const [fJahr, setFJahr] = useState('')
  const [fBefund, setFBefund] = useState('')
  const [fUmfang, setFUmfang] = useState('')
  const [fArt, setFArt] = useState('')
  const [fZuordnung, setFZuordnung] = useState('')

  // Import
  const dateiRef = useRef<HTMLInputElement>(null)
  const [importLauf, setImportLauf] = useState(false)
  const [importBericht, setImportBericht] = useState('')

  // Manuelle Zuordnung
  const [zuordnenId, setZuordnenId] = useState<string | null>(null)
  const [zuordnenNr, setZuordnenNr] = useState('')

  async function ladeAlles() {
    setLaden(true)
    try {
      const [b, a, be, an, ku] = await Promise.all([
        db.pruefberichte(), db.auftraege(), db.bereiche(), db.anlagen(), db.kunden(),
      ])
      setBerichte(b); setAuftraege(a); setBereiche(be); setAnlagen(an); setKunden(ku)
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

  /* ---------- Abgleich ---------- */
  const berichtJahre = useMemo(
    () => Array.from(new Set(berichte.map(b => b.jahr).filter(Boolean))).sort() as number[],
    [berichte])

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

  /* ---------- Filterung Berichtsliste ---------- */
  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase()
    return berichte.filter(b => {
      if (fJahr && String(b.jahr) !== fJahr) return false
      if (fBefund === 'ueber' && !b.ueberschreitung) return false
      if (fBefund === 'ohne' && (b.ueberschreitung || b.befund !== 'Ohne Befund')) return false
      if (fBefund === 'unklar' && b.befund !== 'Unklar') return false
      if (fUmfang) {
        const kurz = umfangKurz(b.umfang)
        if (fUmfang === 'kombi' ? b.umfang.length < 2 : !kurz.includes(fUmfang)) return false
      }
      if (fArt && b.untersuchungsart !== fArt) return false
      if (fZuordnung === 'ja' && !b.auftrag_id) return false
      if (fZuordnung === 'nein' && b.auftrag_id) return false
      if (fZuordnung === 'ohne_nr' && b.auftragsnummer) return false
      if (s) {
        const ktx = b.auftrag_id ? kontext(auftragNachId.get(b.auftrag_id)) : undefined
        const heu = [b.berichtsnummer, b.auftragsnummer, b.hausverwaltung, b.objekt, b.bereich,
          b.anlage_laut_bericht, b.pdf_dateiname, ktx ? kundeAnzeige(ktx.kunde) : '',
          ktx?.anlage?.name, ktx?.bereich?.name].filter(Boolean).join(' ').toLowerCase()
        if (!heu.includes(s)) return false
      }
      return true
    }).sort((a, b) => (b.probenahmedatum ?? '').localeCompare(a.probenahmedatum ?? ''))
  }, [berichte, suche, fJahr, fBefund, fUmfang, fArt, fZuordnung, auftragNachId, bereicheMap, anlagenMap, kundenMap])

  const artenListe = useMemo(() =>
    Array.from(new Set(berichte.map(b => b.untersuchungsart).filter(Boolean))).sort() as string[],
  [berichte])

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
          if (pfade.length !== (alt.quellpfade ?? []).length || auftragId !== (alt.auftrag_id ?? null)) {
            upserts.push({
              id: j.id, quellpfade: pfade, datei_hashes: vereinigen(alt.datei_hashes, j.datei_hashes),
              fundstellen: pfade.length, hat_dateivarianten: alt.hat_dateivarianten || pfade.length > 1,
              auftrag_id: auftragId, zuordnung_art: zuordnung,
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

  if (laden) return <p className="hint">Prüfberichte werden geladen …</p>

  const zugeordnet = berichte.filter(b => b.auftrag_id).length
  const ueberschreitungen = berichte.filter(b => b.ueberschreitung).length

  return (
    <>
      {meldung && <Meldung text={meldung} onWeg={() => setMeldung('')} />}

      <div className="cards">
        <div className="card"><div className="label">Prüfberichte gesamt</div><div className="value">{berichte.length}</div></div>
        <div className="card"><div className="label">Mit Auftrag verknüpft</div><div className="value">{zugeordnet}</div></div>
        <div className="card"><div className="label">Nr. ohne Treffer</div><div className="value">{ohneTreffer.length}</div></div>
        <div className="card"><div className="label">Ohne Auftragsnummer</div><div className="value">{ohneNummer.length}</div></div>
        <div className="card pb-kpi-warn"><div className="label">Fehlende Berichte</div><div className="value">{fehlendeBerichte.length}</div></div>
        <div className="card pb-kpi-bad"><div className="label">Überschreitungen</div><div className="value">{ueberschreitungen}</div></div>
      </div>

      <div className="pb-kopf no-print">
        <div className="pb-untertabs">
          <button className={`pb-untertab ${unter === 'berichte' ? 'active' : ''}`} onClick={() => setUnter('berichte')}>
            <i className="fas fa-file-shield" /> Berichte</button>
          <button className={`pb-untertab ${unter === 'auswertung' ? 'active' : ''}`} onClick={() => setUnter('auswertung')}>
            <i className="fas fa-chart-simple" /> Auswertung</button>
          <button className={`pb-untertab ${unter === 'abgleich' ? 'active' : ''}`} onClick={() => setUnter('abgleich')}>
            <i className="fas fa-code-compare" /> Abgleich
            {(fehlendeBerichte.length + ohneTreffer.length + unstimmig.length) > 0 &&
              <span className="pb-zaehler">{fehlendeBerichte.length + ohneTreffer.length + unstimmig.length}</span>}
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

      {unter === 'berichte' && (
        <Abschnitt titel={`Prüfberichte (${gefiltert.length} von ${berichte.length})`}>
          <div className="filters no-print">
            <div className="pb-suche">
              <i className="fas fa-magnifying-glass" />
              <input type="search" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="Kunde, Objekt, Bereich, Berichts- oder Auftragsnummer suchen …" />
              {suche && <button className="pb-suche-leeren" onClick={() => setSuche('')}>×</button>}
            </div>
            <select value={fJahr} onChange={e => setFJahr(e.target.value)}>
              <option value="">Jahr: alle</option>
              {berichtJahre.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
            <select value={fBefund} onChange={e => setFBefund(e.target.value)}>
              <option value="">Befund: alle</option>
              <option value="ohne">ohne Befund</option>
              <option value="ueber">Überschreitung</option>
              <option value="unklar">unklar</option>
            </select>
            <select value={fUmfang} onChange={e => setFUmfang(e.target.value)}>
              <option value="">Umfang: alle</option>
              <option value="Legio">Legionellen</option>
              <option value="Mibi">Mikrobiologie</option>
              <option value="Chemie">Chemie</option>
              <option value="kombi">Kombi (mehrere)</option>
            </select>
            <select value={fArt} onChange={e => setFArt(e.target.value)}>
              <option value="">Untersuchungsart: alle</option>
              {artenListe.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={fZuordnung} onChange={e => setFZuordnung(e.target.value)}>
              <option value="">Zuordnung: alle</option>
              <option value="ja">mit Auftrag</option>
              <option value="nein">ohne Auftrag</option>
              <option value="ohne_nr">ohne Auftragsnummer</option>
            </select>
          </div>
          <div className="table-container">
            <table>
              <thead><tr>
                <th>Bericht</th><th>Auftrag</th><th>Kunde / Objekt</th><th>Probenahme</th>
                <th>Art</th><th>Umfang</th><th>Befund</th><th>Leg. max</th><th>PDF</th>
              </tr></thead>
              <tbody>
                {gefiltert.map(b => {
                  const ktx = b.auftrag_id ? kontext(auftragNachId.get(b.auftrag_id)) : undefined
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
                      <td>{b.legionellen_max != null ? <strong>{b.legionellen_max}</strong> : '–'}</td>
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
                {!gefiltert.length && <tr><td colSpan={9} className="hint">Keine Berichte gefunden{berichte.length ? ' – Filter anpassen.' : ' – zuerst im Reiter „Import“ das Scanner-JSON einlesen.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Abschnitt>
      )}

      {unter === 'abgleich' && (
        <>
          {darfSchreiben && (
            <div className="filters no-print" style={{ marginBottom: 12 }}>
              <button onClick={neuAbgleichen}><i className="fas fa-rotate" /> Neu abgleichen (Auftragsnummern)</button>
            </div>
          )}

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
                <thead><tr><th>Bericht</th><th>Nummer lt. Bericht</th><th>Hausverwaltung / Objekt</th><th>Probenahme</th><th>Umfang</th>{darfSchreiben && <th></th>}</tr></thead>
                <tbody>
                  {ohneTreffer.map(b => (
                    <tr key={b.id}>
                      <td><Nr>{b.berichtsnummer}</Nr></td>
                      <td><span className="badge medium">{b.auftragsnummer}</span></td>
                      <td><strong>{b.hausverwaltung}</strong> · {b.objekt}</td>
                      <td>{fmtDatum(b.probenahmedatum ?? undefined)}</td>
                      <td>{umfangKurz(b.umfang)}</td>
                      {darfSchreiben && <td><button className="pb-btn-klein" onClick={() => { setZuordnenId(b.id); setZuordnenNr('') }}><i className="fas fa-link" /> zuordnen</button></td>}
                    </tr>
                  ))}
                  {!ohneTreffer.length && <tr><td colSpan={6} className="hint">Keine offenen Fälle.</td></tr>}
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
            legende={<span className="hint">Auf diesen Berichten konnte der Scanner keine Auftragsnummer lesen – meist Fremd- oder Altberichte. Bei Bedarf manuell zuordnen.</span>}>
            <div className="table-container">
              <table>
                <thead><tr><th>Bericht</th><th>Hausverwaltung / Objekt</th><th>Probenahme</th><th>Umfang</th><th>Art</th>{darfSchreiben && <th></th>}</tr></thead>
                <tbody>
                  {ohneNummer.map(b => (
                    <tr key={b.id}>
                      <td><Nr>{b.berichtsnummer}</Nr></td>
                      <td><strong>{b.hausverwaltung}</strong> · {b.objekt}</td>
                      <td>{fmtDatum(b.probenahmedatum ?? undefined)}</td>
                      <td>{umfangKurz(b.umfang)}</td>
                      <td>{b.untersuchungsart}</td>
                      {darfSchreiben && <td><button className="pb-btn-klein" onClick={() => { setZuordnenId(b.id); setZuordnenNr('') }}><i className="fas fa-link" /> zuordnen</button></td>}
                    </tr>
                  ))}
                  {!ohneNummer.length && <tr><td colSpan={6} className="hint">Keine Berichte ohne Auftragsnummer.</td></tr>}
                </tbody>
              </table>
            </div>
          </Abschnitt>
        </>
      )}

      {unter === 'phasen' && <Phasen />}

      {unter === 'auswertung' && <PbAuswertung berichte={berichte} />}

      {unter === 'import' && darfSchreiben && (
        <Abschnitt titel="Scanner-JSON importieren">
          <div className="pb-import">
            <p>Hier die Export-Datei des <strong>NOVA Prüfberichte-Scanners</strong> einlesen
              (z.&nbsp;B. <code>Pruefberichte_Viewer_2025_2026_….json</code>).
              Der Import folgt dem Merge-Vertrag des Scanners:</p>
            <ul>
              <li>Neue Berichte werden angelegt – <em>nur</em> mit den Feldern aus dem JSON.</li>
              <li>Gleiche Berichts-ID mit bekanntem Datei-Hash → nur Fundorte werden ergänzt.</li>
              <li>Neuer Hash oder höhere Berichtsversion → der Bericht wird aktualisiert.</li>
              <li>Auftragsnummern im Format <code>JJ-NNNN</code> werden automatisch mit dem Auftragsbuch verknüpft; manuelle Zuordnungen bleiben unangetastet.</li>
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
   Auswertung in Viewer-Optik: Balkenlisten aus den Berichtsdaten
   ========================================================== */
function BalkenListe({ titel, zeilen, maxZeilen = 20 }: {
  titel: string
  zeilen: Array<{ label: string; wert: number; nebenwert?: number; nebenTitel?: string }>
  maxZeilen?: number
}) {
  const sortiert = [...zeilen].sort((a, b) => b.wert - a.wert).slice(0, maxZeilen)
  const max = Math.max(...sortiert.map(z => z.wert), 1)
  return (
    <Abschnitt titel={titel}>
      <div className="pb-barlist">
        {sortiert.map(z => (
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
        {!sortiert.length && <p className="hint">Noch keine Daten – zuerst Berichte importieren.</p>}
      </div>
    </Abschnitt>
  )
}

function PbAuswertung({ berichte }: { berichte: Pruefbericht[] }) {
  const jahre = useMemo(
    () => Array.from(new Set(berichte.map(b => b.jahr).filter(Boolean))).sort() as number[],
    [berichte])
  const [jahr, setJahr] = useState('')
  const menge = useMemo(
    () => jahr ? berichte.filter(b => String(b.jahr) === jahr) : berichte,
    [berichte, jahr])

  const proHV = useMemo(() => {
    const m = new Map<string, { wert: number; ueber: number }>()
    for (const b of menge) {
      const k = b.hausverwaltung || '(ohne Hausverwaltung)'
      const e = m.get(k) ?? { wert: 0, ueber: 0 }
      e.wert++; if (b.ueberschreitung) e.ueber++
      m.set(k, e)
    }
    return [...m.entries()].map(([label, e]) => ({ label, wert: e.wert, nebenwert: e.ueber || undefined, nebenTitel: 'Überschreitungen' }))
  }, [menge])

  const zaehle = (fn: (b: Pruefbericht) => string | undefined, leer: string) => {
    const m = new Map<string, number>()
    for (const b of menge) { const k = fn(b) || leer; m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].map(([label, wert]) => ({ label, wert }))
  }

  const ueber = menge.filter(b => b.ueberschreitung).length
  const quote = menge.length ? ((ueber / menge.length) * 100).toFixed(1) : '0'

  return (
    <>
      <div className="filters no-print">
        <div className="pb-chips">
          <button className={`pb-chip ${!jahr ? 'active' : ''}`} onClick={() => setJahr('')}>Alle Jahre</button>
          {jahre.map(j => (
            <button key={j} className={`pb-chip ${jahr === String(j) ? 'active' : ''}`}
              onClick={() => setJahr(String(j))}>{j}</button>
          ))}
        </div>
      </div>
      <div className="cards">
        <div className="card"><div className="label">Berichte{jahr ? ` ${jahr}` : ''}</div><div className="value">{menge.length}</div></div>
        <div className="card pb-kpi-bad"><div className="label">Überschreitungen</div><div className="value">{ueber}</div></div>
        <div className="card"><div className="label">Quote</div><div className="value">{quote}&nbsp;%</div></div>
        <div className="card"><div className="label">Hausverwaltungen</div><div className="value">{proHV.length}</div></div>
      </div>
      <BalkenListe titel="Berichte je Hausverwaltung (rot = davon Überschreitungen)" zeilen={proHV} maxZeilen={25} />
      <div className="pb-auswertung-grid">
        <BalkenListe titel="Nach Untersuchungsart" zeilen={zaehle(b => b.untersuchungsart, 'Unbekannt')} />
        <BalkenListe titel="Nach Umfang" zeilen={zaehle(b => umfangKurz(b.umfang), '–')} />
        <BalkenListe titel="Nach Befund" zeilen={zaehle(b => b.ueberschreitung ? 'Überschreitung' : b.befund, 'unklar')} />
        <BalkenListe titel="Auftragsnummer gefunden in … (Scanner v1.9.0)"
          zeilen={zaehle(b => b.auftragsnummer ? (b.auftragsnummer_quelle || '(Quelle unbekannt, alter Scan)') : 'keine Nummer erkannt', '–')} />
      </div>
    </>
  )
}
