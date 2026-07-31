import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Bereich, Kunde, Termin, Untersuchungsbewertung, Ueberschreitungsphase } from '../lib/types'
import { ART_LABEL, fmtDatum, kundeAnzeige } from '../lib/types'
import PlanModal from '../components/PlanModal'
import HistorieModal from '../components/HistorieModal'
import BerichtModal from '../components/BerichtModal'
import type { Auftrag } from '../lib/types'
import { db as db2 } from '../lib/data'
import { istNachuntersuchungsTurnus } from '../lib/turnus'

type SubTab = 'next90' | 'nachunters' | 'berichte' | 'geplant' | 'alle'

interface Zeile {
  anlage: Anlage
  bereich: Bereich
  kunde?: Kunde
  geplantAm?: string        // nächster zukünftiger Termin
  geplantText?: string      // Freitext-Planungsvermerk am Objekt
  faellig?: string          // bereich.naechste_untersuchung
  pruefbericht?: string     // letzter erfasster Prüfbericht, sonst letzter Untersuchungstermin
}

const heuteIso = new Date().toISOString().slice(0, 10)
const plusTage = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

function turnusText(m?: number): string {
  if (m === 3) return '3 Monate'
  if (m === 12) return '1 Jahr'
  if (m === 36) return '3 Jahre'
  return m ? `${m} Monate` : '–'
}

function istGesamtbereich(bereich: Bereich, anlage: Anlage): boolean {
  const name = bereich.name.trim().toLocaleLowerCase('de')
  const anlagenname = anlage.name.trim().toLocaleLowerCase('de')
  return name === 'gesamtanlage'
    || /(?:–|-)\s*gesamtanlage$/.test(name)
    || name === `${anlagenname} – gesamtanlage`
    || name === `${anlagenname} - gesamtanlage`
    || name === anlagenname
}

function googleMapsLink(anlage: Anlage, bereich: Bereich): string {
  const bereichAdresse = [bereich.strasse, bereich.hausnummer]
    .filter(Boolean)
    .join(' ')
    .trim()
  const suchAdresse = [
    bereichAdresse || anlage.strasse || anlage.name,
    anlage.plz,
    anlage.ort,
  ].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suchAdresse)}`
}

function InfoEditor({ anlage, onSaved }: { anlage: Anlage; onSaved: () => void }) {
  const [text, setText] = useState(anlage.info ?? '')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState('')
  useEffect(() => setText(anlage.info ?? ''), [anlage.id, anlage.info])
  const geaendert = text !== (anlage.info ?? '')
  const speichern = async () => {
    setSpeichert(true)
    setFehler('')
    try {
      await db.anlageAktualisieren(anlage.id, { info: text.trim() || null })
      onSaved()
    } catch (e: any) {
      setFehler(e.message ?? String(e))
    } finally {
      setSpeichert(false)
    }
  }
  return <div className="planung-info-editor"
    onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
    <textarea rows={2} value={text} placeholder="Info eingeben …"
      onChange={e => setText(e.target.value)} />
    {geaendert && <button onClick={speichern} disabled={speichert}
      title="Info speichern" aria-label="Info speichern">
      <i className="fas fa-floppy-disk" aria-hidden="true"></i>
    </button>}
    {fehler && <span className="planung-info-fehler" title={fehler}>!</span>}
  </div>
}

/** Ampel-Logik 1:1 aus dem alten Dashboard. */
function zeilenKlasse(z: Zeile, modus: SubTab): string {
  const f = z.faellig
  if (modus === 'nachunters') {
    return f && f < heuteIso ? 'amp-red' : 'amp-yellow'
  }
  if (modus === 'next90') {
    const istNach = istNachuntersuchungsTurnus(z.bereich)
    if (istNach) return 'amp-yellow'                             // 3-Monats-Turnus: immer gelb
    if (f && f <= heuteIso) return 'amp-red overdue-row'         // überfällig: rot (standardmäßig versteckt)
    const istOrient = z.bereich.turnus_monate === 12 || z.bereich.turnus_monate === 36
    if (istOrient && f && f > heuteIso && f <= plusTage(90)) return 'amp-green'
    return ''
  }
  if (modus === 'alle' && f) {                                   // Alt-Logik: rot/gelb(45 Tage)/grün
    const tage = Math.round((+new Date(f) - +new Date(heuteIso)) / 864e5)
    if (tage < 0) return 'amp-red'
    if (tage <= 45) return 'amp-yellow'
    return 'amp-green'
  }
  return ''
}

export default function Planung() {
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [termine, setTermine] = useState<Termin[]>([])
  const [tab, setTab] = useState<SubTab>('next90')
  const [suche, setSuche] = useState('')
  const [ueberfaelligeAnzeigen, setUeberfaelligeAnzeigen] = useState(false)
  const [vonDatum, setVonDatum] = useState('')
  const [bisDatum, setBisDatum] = useState('')
  const [sortSpalte, setSortSpalte] = useState<keyof Zeile | 'kundeName' | 'ort'>('faellig')
  const [infoAnzeigen, setInfoAnzeigen] = useState(true)
  const [inaktiveAnzeigen, setInaktiveAnzeigen] = useState(false)
  const [sortAuf, setSortAuf] = useState(true)
  const [modalAnlage, setModalAnlage] = useState<Anlage | null>(null)
  const [historie, setHistorie] = useState<{ anlage: Anlage; bereich: Bereich } | null>(null)
  const [planBereichId, setPlanBereichId] = useState('')
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [bewertungen, setBewertungen] = useState<Untersuchungsbewertung[]>([])
  const [phasen, setPhasen] = useState<Ueberschreitungsphase[]>([])
  const [berichtAuftrag, setBerichtAuftrag] = useState<Auftrag | null>(null)

  const laden = () => {
    db.anlagen().then(setAnlagen); db.kunden().then(setKunden)
    db.bereiche().then(setBereiche); db.termine().then(setTermine)
    db.phasen().then(setPhasen).catch(() => setPhasen([]))
    db.auftraege().then(a => {
      setAuftraege(a)
      const ids = a.flatMap(x => x.unterauftraege.map(u => u.id))
      if (ids.length) db.bewertungenFuerUnterauftraege(ids).then(setBewertungen)
      else setBewertungen([])
    })
  }
  useEffect(laden, [])

  const zeilen: Zeile[] = useMemo(() => bereiche.filter(b => b.aktiv).flatMap(b => {
    const a = anlagen.find(a => a.id === b.anlage_id)
    if (!a || (inaktiveAnzeigen ? a.aktiv : !a.aktiv)) return []
    const terminIds = new Set(auftraege.filter(o => o.bereich_id === b.id && o.termin_id).map(o => o.termin_id))
    const bereichTermine = termine
      .filter(t => (t.bereich_id === b.id || terminIds.has(t.id)) && t.status !== 'abgesagt')
    const zukunft = bereichTermine
      .filter(t => t.datum >= heuteIso && (t.status === 'geplant' || t.status === 'bestaetigt'))
      .map(t => t.datum).sort()
    const vergangen = bereichTermine
      .filter(t => t.status === 'abgeschlossen' || t.datum < heuteIso)
      .sort((x, y) => y.datum.localeCompare(x.datum))
    const letzterMitPruefbericht = vergangen.find(t => t.pruefbericht_datum)
    const unterauftragIds = new Set(auftraege.filter(o => o.bereich_id === b.id).flatMap(o => o.unterauftraege.map(u => u.id)))
    const letzterAuftragsbericht = bewertungen
      .filter(x => unterauftragIds.has(x.unterauftrag_id) && x.pruefbericht_datum)
      .sort((x, y) => (y.pruefbericht_datum ?? '').localeCompare(x.pruefbericht_datum ?? ''))[0]
    return [{
      anlage: a,
      bereich: b,
      kunde: kunden.find(k => k.id === a.kunde_id),
      geplantAm: zukunft[0],
      geplantText: b.planungsnotiz || a.planungsnotiz || undefined,
      faellig: b.naechste_untersuchung,
      pruefbericht: letzterAuftragsbericht?.pruefbericht_datum || letzterMitPruefbericht?.pruefbericht_datum || vergangen[0]?.datum,
    }]
  }), [anlagen, bereiche, kunden, termine, auftraege, bewertungen, inaktiveAnzeigen])

  // Untersuchungstermin liegt zurück, aber mindestens ein Unterauftrag hat noch keinen Befund.
  const berichteOffen = useMemo(() => auftraege.flatMap(a => {
    const termin = termine.find(t => t.id === a.termin_id)
    const bereich = bereiche.find(b => b.id === a.bereich_id)
    const anlage = anlagen.find(x => x.id === bereich?.anlage_id)
    const kunde = kunden.find(k => k.id === anlage?.kunde_id)
    const offen = a.unterauftraege.some(u => u.status !== 'storniert' && u.ergebnis === 'offen')
    return termin && termin.status !== 'abgesagt' && termin.datum <= heuteIso && offen && bereich && anlage
      ? [{ auftrag: a, termin, bereich, anlage, kunde }] : []
  }), [auftraege, termine, bereiche, anlagen, kunden])

  const gefiltert = useMemo(() => {
    let z = zeilen

    if (tab === 'next90') {
      z = z.filter(x => !x.geplantAm && !x.geplantText && x.faellig && x.faellig <= plusTage(90))
      if (!ueberfaelligeAnzeigen) z = z.filter(x => !(x.faellig! <= heuteIso && !istNachuntersuchungsTurnus(x.bereich)))
    } else if (tab === 'nachunters') {
      z = z.filter(x => istNachuntersuchungsTurnus(x.bereich) && !x.geplantAm && !x.geplantText)
    } else if (tab === 'berichte') {
      z = []
    } else if (tab === 'geplant') {
      z = z.filter(x => !!x.geplantAm || !!x.geplantText)
    } else if (tab === 'alle') {
      if (vonDatum) z = z.filter(x => x.faellig && x.faellig >= vonDatum)
      if (bisDatum) z = z.filter(x => x.faellig && x.faellig <= bisDatum)
    }

    if (suche.trim()) {
      const q = suche.toLowerCase()
      z = z.filter(x =>
        x.anlage.name.toLowerCase().includes(q) ||
        (x.kunde?.name_lang ?? '').toLowerCase().includes(q) ||
        kundeAnzeige(x.kunde).toLowerCase().includes(q) ||
        (x.anlage.ort ?? '').toLowerCase().includes(q) ||
        x.bereich.name.toLowerCase().includes(q) ||
        (x.anlage.plz ?? '').toLowerCase().includes(q))
    }

    const wert = (x: Zeile): string => {
      if (sortSpalte === 'kundeName') return kundeAnzeige(x.kunde)
      if (sortSpalte === 'ort') return x.anlage.ort ?? ''
      if (sortSpalte === 'geplantAm') return x.geplantAm ?? '9999'
      if (sortSpalte === 'faellig') return x.faellig ?? '9999'
      return x.anlage.name
    }
    return [...z].sort((a, b) => (sortAuf ? 1 : -1) * wert(a).localeCompare(wert(b), 'de'))
  }, [zeilen, tab, suche, ueberfaelligeAnzeigen, vonDatum, bisDatum, sortSpalte, sortAuf])

  const anz = {
    next90: zeilen.filter(x => !x.geplantAm && !x.geplantText && x.faellig && x.faellig <= plusTage(90)).length,
    nachunters: zeilen.filter(x => istNachuntersuchungsTurnus(x.bereich) && !x.geplantAm && !x.geplantText).length,
    berichte: berichteOffen.length,
    geplant: zeilen.filter(x => !!x.geplantAm || !!x.geplantText).length,
    alle: zeilen.length,
  }
  const ueberfaellig = zeilen.filter(x => !x.geplantAm && x.faellig && x.faellig <= heuteIso && !istNachuntersuchungsTurnus(x.bereich)).length

  const sortieren = (s: typeof sortSpalte) => {
    if (s === sortSpalte) setSortAuf(!sortAuf)
    else { setSortSpalte(s); setSortAuf(true) }
  }
  const Pfeil = ({ s }: { s: typeof sortSpalte }) =>
    sortSpalte === s ? <i className={`fas fa-caret-${sortAuf ? 'up' : 'down'}`} aria-hidden="true"></i> : null

  const ST = ({ id, icon, label, zahl }: { id: SubTab; icon: string; label: string; zahl: number }) => (
    <button className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
      <i className={`fas ${icon}`} aria-hidden="true"></i> {label} ({zahl})
    </button>
  )

  return (
    <>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <ST id="next90" icon="fa-calendar-day" label="Nächste 3 Monate" zahl={anz.next90} />
        <ST id="nachunters" icon="fa-flask" label="Nachuntersuchungen" zahl={anz.nachunters} />
        <ST id="berichte" icon="fa-file-circle-exclamation" label="Bericht offen" zahl={anz.berichte} />
        <ST id="geplant" icon="fa-calendar-check" label="Geplant" zahl={anz.geplant} />
        <ST id="alle" icon="fa-list" label="Alle Anlagen" zahl={anz.alle} />
      </div>

      <div className="planung-werkzeuge no-print">
        <div className="suchfeld">
          <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input placeholder="Suche: Objekt, Verwaltung, Ort, PLZ …" value={suche}
            onChange={e => setSuche(e.target.value)} onKeyDown={e => e.key === 'Escape' && setSuche('')} />
          {suche && <button className="suchfeld-x" onClick={() => setSuche('')} aria-label="Suche leeren">×</button>}
        </div>
        {tab === 'next90' && (
          <button onClick={() => setUeberfaelligeAnzeigen(!ueberfaelligeAnzeigen)}>
            <i className={`fas ${ueberfaelligeAnzeigen ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
            Überfällige {ueberfaelligeAnzeigen ? 'ausblenden' : `anzeigen (${ueberfaellig})`}
          </button>
        )}
        {tab === 'alle' && (
          <>
            <label className="f">Fällig von<input type="date" value={vonDatum} onChange={e => setVonDatum(e.target.value)} /></label>
            <label className="f">bis<input type="date" value={bisDatum} onChange={e => setBisDatum(e.target.value)} /></label>
            {(vonDatum || bisDatum) && <button onClick={() => { setVonDatum(''); setBisDatum('') }}>Filter leeren</button>}
          </>
        )}
        <button onClick={() => setInfoAnzeigen(!infoAnzeigen)}>
          <i className={`fas ${infoAnzeigen ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
          Info {infoAnzeigen ? 'ausblenden' : 'anzeigen'}
        </button>
        <button onClick={() => setInaktiveAnzeigen(!inaktiveAnzeigen)}
          style={inaktiveAnzeigen ? { background: '#6c757d', color: '#fff', borderColor: '#6c757d' } : undefined}>
          <i className="fas fa-eye-slash" aria-hidden="true"></i>
          {inaktiveAnzeigen ? 'Aktive Anlagen zeigen' : 'Ausgeblendete verwalten'}
        </button>
        <button onClick={() => window.print()}>
          <i className="fas fa-print" aria-hidden="true"></i> Gefilterte Einträge drucken
        </button>
      </div>

      <section className="table-section">
        <div className="section-header">
          <div className="section-header-left">
            <h3>
              {tab === 'next90' && 'Nächste 3 Monate'}
              {tab === 'nachunters' && 'Fällige Nachuntersuchungen (3-Monats-Turnus)'}
              {tab === 'berichte' && 'Untersuchungen mit offenem Prüfbericht'}
              {tab === 'geplant' && 'Geplante Anlagen'}
              {tab === 'alle' && 'Alle Anlagen'}
              {' '}({tab === 'berichte' ? berichteOffen.length : gefiltert.length})
            </h3>
            {tab === 'next90' && (
              <div className="legend">
                <span className="legend-chip legend-yellow">3-Monats-Turnus</span>
                <span className="legend-chip legend-red">überfällig</span>
                <span className="legend-chip legend-green">orientierend ≤ 90 Tage</span>
              </div>
            )}
          </div>
        </div>
        {tab === 'berichte' ? <div className="table-container"><table><thead><tr><th>Termin</th><th>Verwaltung</th><th>Anlage</th><th>Bereich</th><th>Auftrag</th><th>Offene Untersuchungsarten</th><th className="no-print"></th></tr></thead><tbody>
          {berichteOffen.map(x => <tr key={x.auftrag.id} className="amp-yellow"><td>{fmtDatum(x.termin.datum)}</td><td>{kundeAnzeige(x.kunde)}</td><td>{x.anlage.name}</td><td>{istGesamtbereich(x.bereich, x.anlage) ? '–' : x.bereich.name}</td><td className="nr">{x.auftrag.auftragsnummer}</td><td>{x.auftrag.unterauftraege.filter(u => u.status !== 'storniert' && u.ergebnis === 'offen').map(u => ART_LABEL[u.art]).join(', ')}</td><td className="no-print"><button className="zeile-btn" onClick={() => setBerichtAuftrag(x.auftrag)}><i className="fas fa-file-circle-check" aria-hidden="true"></i> Prüfbericht erfassen</button></td></tr>)}
          {berichteOffen.length === 0 && <tr><td colSpan={7} className="hint">Keine offenen Prüfberichte.</td></tr>}
        </tbody></table></div> : <div className="table-container">
          <table>
            <thead><tr>
              <th onClick={() => sortieren('kundeName')} style={{ cursor: 'pointer' }}>Verwaltung <Pfeil s="kundeName" /></th>
              <th onClick={() => sortieren('anlage')} style={{ cursor: 'pointer' }}>Wohnanlage/Objekt <Pfeil s="anlage" /></th>
              <th className="zahl-zelle">Proben</th>
              <th>PLZ</th>
              <th onClick={() => sortieren('ort')} style={{ cursor: 'pointer' }}>Ort <Pfeil s="ort" /></th>
              <th>Turnus</th>
              <th>Prüfbericht</th>
              <th onClick={() => sortieren('faellig')} style={{ cursor: 'pointer' }}>Nächste Untersuchung <Pfeil s="faellig" /></th>
              {infoAnzeigen && <th>Info</th>}
              <th onClick={() => sortieren('geplantAm')} style={{ cursor: 'pointer' }}>Geplant <Pfeil s="geplantAm" /></th>
              <th className="no-print aktion-kopf">Planen</th>
              <th className="no-print aktion-kopf">Verlauf</th>
              <th className="no-print aktion-kopf" aria-label="Ausblenden"></th>
            </tr></thead>
            <tbody>
              {gefiltert.slice(0, 500).map(z => (
                <tr key={z.bereich.id} className={zeilenKlasse(z, tab)}
                  onDoubleClick={() => { setPlanBereichId(z.bereich.id); setModalAnlage(z.anlage) }} title="Doppelklick: Termin für diesen Bereich planen">
                  <td>{kundeAnzeige(z.kunde)}</td>
                  <td className="planung-objekt">
                    <a className="planung-objekt-link"
                      href={googleMapsLink(z.anlage, z.bereich)}
                      target="_blank" rel="noopener noreferrer"
                      title={`${z.anlage.name} in Google Maps öffnen`}
                      onClick={e => e.stopPropagation()}
                      onDoubleClick={e => e.stopPropagation()}>
                      {z.anlage.name}
                    </a>
                    {!istGesamtbereich(z.bereich, z.anlage) && (
                      <small><i className="fas fa-code-branch" aria-hidden="true"></i> {z.bereich.name}</small>
                    )}
                  </td>
                  <td className="zahl-zelle">{z.bereich.proben_anzahl ?? '–'}</td>
                  <td>{z.anlage.plz ?? '–'}</td>
                  <td>{z.anlage.ort ?? '–'}</td>
                  <td>{turnusText(z.bereich.turnus_monate)}</td>
                  <td>{fmtDatum(z.pruefbericht)}</td>
                  <td>{fmtDatum(z.faellig)}</td>
                  {infoAnzeigen && <td className="info-zelle">
                    <InfoEditor anlage={z.anlage} onSaved={laden} />
                  </td>}
                  <td className="planung-geplant">
                    {z.geplantAm
                      ? <strong>{fmtDatum(z.geplantAm)}</strong>
                      : z.geplantText
                        ? <span className="hint">{z.geplantText}</span>
                        : <span className="hint">–</span>}
                  </td>
                  <td className="no-print aktion-zelle">
                    {inaktiveAnzeigen ? (
                      <button className="zeile-btn icon-aktion" onClick={async () => { await db2.anlageAktualisieren(z.anlage.id, { aktiv: true }); laden() }}
                        title="Anlage wieder einblenden" aria-label="Anlage wieder einblenden">
                        <i className="fas fa-eye" aria-hidden="true"></i>
                      </button>
                    ) : (
                      <button className="zeile-btn icon-aktion" onClick={() => { setPlanBereichId(z.bereich.id); setModalAnlage(z.anlage) }}
                        title="Diesen Bereich planen" aria-label="Diesen Bereich planen">
                        <i className="fas fa-calendar-plus" aria-hidden="true"></i>
                      </button>
                    )}
                  </td>
                  <td className="no-print aktion-zelle">
                    {!inaktiveAnzeigen && <button className="zeile-btn icon-aktion verlauf-aktion"
                      onClick={() => setHistorie({ anlage: z.anlage, bereich: z.bereich })}
                      title="Untersuchungsverlauf dieses Bereichs öffnen" aria-label="Verlauf öffnen">
                      <i className="fas fa-clock-rotate-left" aria-hidden="true"></i>
                    </button>}
                  </td>
                  <td className="no-print aktion-zelle">
                    {!inaktiveAnzeigen && <button className="zeile-btn icon-aktion ausblenden-aktion"
                      onClick={async () => { await db2.anlageAktualisieren(z.anlage.id, { aktiv: false }); laden() }}
                      title="Anlage ausblenden (inaktiv setzen)" aria-label="Anlage ausblenden">
                      <i className="fas fa-eye-slash" aria-hidden="true"></i>
                    </button>}
                  </td>
                </tr>
              ))}
              {gefiltert.length === 0 && <tr><td colSpan={infoAnzeigen ? 13 : 12} className="hint">Keine Einträge für die aktuelle Auswahl.</td></tr>}
            </tbody>
          </table>
        </div>}
        {gefiltert.length > 500 && <p className="hint" style={{ padding: '10px 20px' }}>Angezeigt: erste 500 von {gefiltert.length} – Suche zum Eingrenzen nutzen.</p>}
      </section>

      {historie && (
        <HistorieModal anlage={historie.anlage} kunde={kunden.find(k => k.id === historie.anlage.kunde_id)}
          termine={termine} auftraege={auftraege} bereiche={bereiche} nurBereich={historie.bereich.id}
          onClose={() => setHistorie(null)} onSaved={laden} />
      )}
      {modalAnlage && (
        <PlanModal
          anlage={modalAnlage}
          kunde={kunden.find(k => k.id === modalAnlage.kunde_id)}
          bereiche={bereiche}
          phasen={phasen}
          startBereichId={planBereichId}
          onClose={() => setModalAnlage(null)}
          onSaved={laden}
        />
      )}
      {berichtAuftrag && (
        <BerichtModal auftrag={berichtAuftrag}
          bereichId={berichtAuftrag.bereich_id}
          bereichName={bereiche.find(b => b.id === berichtAuftrag.bereich_id)?.name}
          kundeKurz={(() => { const b = bereiche.find(x => x.id === berichtAuftrag.bereich_id); const a = anlagen.find(x => x.id === b?.anlage_id); return kundeAnzeige(kunden.find(k => k.id === a?.kunde_id)) })()}
          onClose={() => setBerichtAuftrag(null)} onSaved={laden} />
      )}
    </>
  )
}
