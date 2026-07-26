import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Bereich, Kunde, Termin } from '../lib/types'
import { fmtDatum } from '../lib/types'
import PlanModal from '../components/PlanModal'

type SubTab = 'next90' | 'nachunters' | 'geplant' | 'alle'

interface Zeile {
  anlage: Anlage
  kunde?: Kunde
  geplantAm?: string        // nächster zukünftiger Termin
  geplantText?: string      // Freitext-Planungsvermerk am Objekt
  faellig?: string          // anlage.naechste_untersuchung
}

const heuteIso = new Date().toISOString().slice(0, 10)
const plusTage = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

function turnusText(m?: number): string {
  if (m === 3) return '3 Monate'
  if (m === 12) return '1 Jahr'
  if (m === 36) return '3 Jahre'
  return m ? `${m} Monate` : '–'
}

/** Ampel-Logik 1:1 aus dem alten Dashboard. */
function zeilenKlasse(z: Zeile, modus: SubTab): string {
  const f = z.faellig
  if (modus === 'nachunters') {
    return f && f < heuteIso ? 'amp-red' : 'amp-yellow'
  }
  if (modus === 'next90') {
    const istNach = z.anlage.turnus_monate === 3
    if (istNach) return 'amp-yellow'                             // 3-Monats-Turnus: immer gelb
    if (f && f <= heuteIso) return 'amp-red overdue-row'         // überfällig: rot (standardmäßig versteckt)
    const istOrient = z.anlage.turnus_monate === 12 || z.anlage.turnus_monate === 36
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
  const [sortAuf, setSortAuf] = useState(true)
  const [modalAnlage, setModalAnlage] = useState<Anlage | null>(null)

  const laden = () => {
    db.anlagen().then(setAnlagen); db.kunden().then(setKunden)
    db.bereiche().then(setBereiche); db.termine().then(setTermine)
  }
  useEffect(laden, [])

  const zeilen: Zeile[] = useMemo(() => anlagen.filter(a => a.aktiv).map(a => {
    const zukunft = termine
      .filter(t => t.anlage_id === a.id && t.datum >= heuteIso && (t.status === 'geplant' || t.status === 'bestaetigt'))
      .map(t => t.datum).sort()
    return {
      anlage: a,
      kunde: kunden.find(k => k.id === a.kunde_id),
      geplantAm: zukunft[0],
      geplantText: a.planungsnotiz || undefined,
      faellig: a.naechste_untersuchung,
    }
  }), [anlagen, kunden, termine])

  const gefiltert = useMemo(() => {
    let z = zeilen

    if (tab === 'next90') {
      z = z.filter(x => !x.geplantAm && !x.geplantText && x.faellig && x.faellig <= plusTage(90))
      if (!ueberfaelligeAnzeigen) z = z.filter(x => !(x.faellig! <= heuteIso && x.anlage.turnus_monate !== 3))
    } else if (tab === 'nachunters') {
      z = z.filter(x => x.anlage.turnus_monate === 3 && !x.geplantAm && !x.geplantText)
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
        (x.kunde?.name_kurz ?? '').toLowerCase().includes(q) ||
        (x.anlage.ort ?? '').toLowerCase().includes(q) ||
        (x.anlage.plz ?? '').toLowerCase().includes(q))
    }

    const wert = (x: Zeile): string => {
      if (sortSpalte === 'kundeName') return x.kunde?.name_kurz ?? ''
      if (sortSpalte === 'ort') return x.anlage.ort ?? ''
      if (sortSpalte === 'geplantAm') return x.geplantAm ?? '9999'
      if (sortSpalte === 'faellig') return x.faellig ?? '9999'
      return x.anlage.name
    }
    return [...z].sort((a, b) => (sortAuf ? 1 : -1) * wert(a).localeCompare(wert(b), 'de'))
  }, [zeilen, tab, suche, ueberfaelligeAnzeigen, vonDatum, bisDatum, sortSpalte, sortAuf])

  const anz = {
    next90: zeilen.filter(x => !x.geplantAm && !x.geplantText && x.faellig && x.faellig <= plusTage(90)).length,
    nachunters: zeilen.filter(x => x.anlage.turnus_monate === 3 && !x.geplantAm && !x.geplantText).length,
    geplant: zeilen.filter(x => !!x.geplantAm || !!x.geplantText).length,
    alle: zeilen.length,
  }
  const ueberfaellig = zeilen.filter(x => !x.geplantAm && x.faellig && x.faellig <= heuteIso && x.anlage.turnus_monate !== 3).length

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
        <ST id="geplant" icon="fa-calendar-check" label="Geplant" zahl={anz.geplant} />
        <ST id="alle" icon="fa-list" label="Alle Anlagen" zahl={anz.alle} />
      </div>

      <div className="planung-werkzeuge no-print">
        <div className="suchfeld">
          <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input placeholder="Suche: Objekt, Verwaltung, Ort, PLZ …" value={suche} onChange={e => setSuche(e.target.value)} />
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
              {tab === 'geplant' && 'Geplante Anlagen'}
              {tab === 'alle' && 'Alle Anlagen'}
              {' '}({gefiltert.length})
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
        <div className="table-container">
          <table>
            <thead><tr>
              <th onClick={() => sortieren('kundeName')} style={{ cursor: 'pointer' }}>Verwaltung <Pfeil s="kundeName" /></th>
              <th onClick={() => sortieren('anlage')} style={{ cursor: 'pointer' }}>Wohnanlage/Objekt <Pfeil s="anlage" /></th>
              <th>PLZ</th>
              <th onClick={() => sortieren('ort')} style={{ cursor: 'pointer' }}>Ort <Pfeil s="ort" /></th>
              <th>Turnus</th>
              <th onClick={() => sortieren('faellig')} style={{ cursor: 'pointer' }}>Nächste Untersuchung <Pfeil s="faellig" /></th>
              {tab === 'geplant' && <th onClick={() => sortieren('geplantAm')} style={{ cursor: 'pointer' }}>Geplant <Pfeil s="geplantAm" /></th>}
              {infoAnzeigen && <th>Info</th>}
              <th className="no-print"></th>
            </tr></thead>
            <tbody>
              {gefiltert.slice(0, 500).map(z => (
                <tr key={z.anlage.id} className={zeilenKlasse(z, tab)}
                  onDoubleClick={() => setModalAnlage(z.anlage)} title="Doppelklick: Termin planen">
                  <td>{z.kunde?.name_kurz ?? '–'}</td>
                  <td style={{ fontWeight: 600 }}>{z.anlage.name}</td>
                  <td>{z.anlage.plz ?? '–'}</td>
                  <td>{z.anlage.ort ?? '–'}</td>
                  <td>{turnusText(z.anlage.turnus_monate)}</td>
                  <td>{fmtDatum(z.faellig)}</td>
                  {tab === 'geplant' && <td style={{ fontWeight: 600 }}>{z.geplantAm ? fmtDatum(z.geplantAm) : <span className="hint">{z.geplantText}</span>}</td>}
                  {infoAnzeigen && <td className="info-zelle">
                    {[z.anlage.planungsnotiz && tab !== 'geplant' ? `⏸ ${z.anlage.planungsnotiz}` : null, z.anlage.notizen]
                      .filter(Boolean).join(' · ') || ''}
                  </td>}
                  <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                    <button className="zeile-btn" onClick={() => setModalAnlage(z.anlage)}>
                      <i className="fas fa-calendar-plus" aria-hidden="true"></i> Planen
                    </button>
                  </td>
                </tr>
              ))}
              {gefiltert.length === 0 && <tr><td colSpan={9} className="hint">Keine Einträge für die aktuelle Auswahl.</td></tr>}
            </tbody>
          </table>
        </div>
        {gefiltert.length > 500 && <p className="hint" style={{ padding: '10px 20px' }}>Angezeigt: erste 500 von {gefiltert.length} – Suche zum Eingrenzen nutzen.</p>}
      </section>

      {modalAnlage && (
        <PlanModal
          anlage={modalAnlage}
          kunde={kunden.find(k => k.id === modalAnlage.kunde_id)}
          bereiche={bereiche}
          onClose={() => setModalAnlage(null)}
          onSaved={laden}
        />
      )}
    </>
  )
}
