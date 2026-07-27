import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Bereich, Kunde, Termin, Ueberschreitungsphase } from '../lib/types'
import { fmtDatum, kundeAnzeige } from '../lib/types'
import { Abschnitt } from '../components/ui'
import { phasenErmitteln, jahresStatistik, type AnlagenEingabe, type Phase } from '../lib/phasen'
import PhaseModal from '../components/PhaseModal'

/** SVG-Balkendiagramm in NOVAplan-Farben (druckfähig). */
function Balken({ daten, einheit = '' }: { daten: { label: string; wert: number; farbe?: string }[]; einheit?: string }) {
  if (!daten.length) return <p className="hint" style={{ padding: '0 20px 14px' }}>Noch keine Daten.</p>
  const max = Math.max(...daten.map(d => d.wert), 1)
  const bw = 44, gap = 18, h = 150
  const breite = daten.length * (bw + gap) + gap
  return (
    <div style={{ overflowX: 'auto', padding: '6px 20px 14px' }}>
      <svg width={breite} height={h + 42} role="img">
        {daten.map((d, i) => {
          const bh = Math.max(Math.round((d.wert / max) * h), d.wert > 0 ? 4 : 0)
          const x = gap + i * (bw + gap)
          return (
            <g key={d.label + i}>
              <rect x={x} y={h - bh + 8} width={bw} height={bh} rx={5} fill={d.farbe ?? '#2980b9'} />
              <text x={x + bw / 2} y={h - bh} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#2c3e50">{d.wert}{einheit}</text>
              <text x={x + bw / 2} y={h + 26} textAnchor="middle" fontSize="10.5" fill="#7f8c8d">{d.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Klappe({ titel, offen = true, children }: { titel: string; offen?: boolean; children: React.ReactNode }) {
  return (
    <details className="klappe" open={offen}>
      <summary><i className="fas fa-chart-column" aria-hidden="true"></i> {titel}
        <i className="fas fa-chevron-down klappe-pfeil" aria-hidden="true"></i></summary>
      {children}
    </details>
  )
}

const STATUS_BADGE: Record<string, string> = { aktiv: 'active', abgeschlossen: 'closed', prueffall: 'check' }
const STATUS_TEXT: Record<string, string> = { aktiv: 'aktiv', abgeschlossen: 'abgeschlossen', prueffall: 'Prüffall' }
const SICHER_TEXT: Record<string, string> = { hoch: 'Hoch', mittel: 'Mittel', pruefen: 'Prüfen' }

type KpiWahl = 'long12' | 'long24' | 'avgDuration' | 'maxDuration' | 'avgFollowups' | 'normalized' | 'managements'

export default function Auswertungen() {
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [termine, setTermine] = useState<Termin[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [fachPhasen, setFachPhasen] = useState<Ueberschreitungsphase[]>([])
  const [phaseBearbeiten, setPhaseBearbeiten] = useState<Ueberschreitungsphase | null>(null)

  const [suche, setSuche] = useState('')
  const [fKunde, setFKunde] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fJahr, setFJahr] = useState('')
  const [fSicher, setFSicher] = useState('')
  const [fDauer, setFDauer] = useState('')
  const [kpi, setKpi] = useState<KpiWahl>('long12')

  const laden = () => {
    db.anlagen().then(setAnlagen); db.kunden().then(setKunden); db.termine().then(setTermine)
    db.bereiche().then(setBereiche); db.phasen().then(setFachPhasen)
  }
  useEffect(laden, [])

  const eingabe: AnlagenEingabe[] = useMemo(() => anlagen.map(a => ({
    id: a.id, name: a.name, kunde: kundeAnzeige(kunden.find(k => k.id === a.kunde_id)),
    ort: a.ort, turnusMonate: a.turnus_monate,
    termine: termine.filter(t => t.anlage_id === a.id).map(t => t.datum),
  })), [anlagen, kunden, termine])

  const phasen = useMemo(() => phasenErmitteln(eingabe), [eingabe])
  const statistik = useMemo(() => jahresStatistik(eingabe, phasen), [eingabe, phasen])
  const jahre = [...new Set(phasen.map(p => p.ueberschreitungsjahr))].sort((a, b) => b - a)

  const dauerIn = (m: number | null, b: string): boolean => {
    if (!b) return true
    if (m == null) return false
    if (b === '0-6') return m <= 6
    if (b === '7-12') return m >= 7 && m <= 12
    if (b === '13-24') return m >= 13 && m <= 24
    if (b === '25-36') return m >= 25 && m <= 36
    if (b === '37+') return m >= 37
    return true
  }

  const gefiltert = useMemo(() => phasen.filter(p => {
    const q = suche.toLowerCase()
    return (!q || p.anlage.toLowerCase().includes(q) || p.kunde.toLowerCase().includes(q) || (p.ort ?? '').toLowerCase().includes(q))
      && (!fKunde || p.kunde === fKunde)
      && (!fStatus || p.status === fStatus)
      && (!fJahr || String(p.ueberschreitungsjahr) === fJahr)
      && (!fSicher || p.sicherheit === fSicher)
      && dauerIn(p.dauerMonate, fDauer)
  }), [phasen, suche, fKunde, fStatus, fJahr, fSicher, fDauer])

  const aktiv = gefiltert.filter(p => p.status === 'aktiv').length
  const prueffaelle = gefiltert.filter(p => p.status === 'prueffall').length
  const betroffen = new Set(gefiltert.map(p => p.anlageId)).size
  const dauern = gefiltert.map(p => p.dauerMonate).filter((d): d is number => d != null)
  const median = dauern.length ? [...dauern].sort((a, b) => a - b)[Math.floor(dauern.length / 2)] : null

  const kpiWert = (): string => {
    switch (kpi) {
      case 'long12': return String(gefiltert.filter(p => (p.dauerMonate ?? 0) >= 12).length)
      case 'long24': return String(gefiltert.filter(p => (p.dauerMonate ?? 0) >= 24).length)
      case 'avgDuration': return dauern.length ? (Math.round(dauern.reduce((s, d) => s + d, 0) / dauern.length * 10) / 10) + ' Mon.' : '–'
      case 'maxDuration': return dauern.length ? Math.max(...dauern) + ' Mon.' : '–'
      case 'avgFollowups': { const n = gefiltert.map(p => p.anzahlNachuntersuchungen); return n.length ? (Math.round(n.reduce((s, x) => s + x, 0) / n.length * 10) / 10).toString() : '–' }
      case 'normalized': return String(gefiltert.filter(p => p.status === 'abgeschlossen').length)
      case 'managements': return String(new Set(gefiltert.map(p => p.kunde)).size)
    }
  }
  const KPI_LABEL: Record<KpiWahl, string> = {
    long12: 'Phasen ab 12 Monaten', long24: 'Phasen ab 24 Monaten', avgDuration: 'Ø Phasendauer',
    maxDuration: 'Längste Phase', avgFollowups: 'Ø Nachuntersuchungen', normalized: 'Normalisiert', managements: 'Betroffene Verwaltungen',
  }

  const reset = () => { setSuche(''); setFKunde(''); setFStatus(''); setFJahr(''); setFSicher(''); setFDauer('') }
  const aktiveFilter = suche || fKunde || fStatus || fJahr || fSicher || fDauer

  const csvExport = () => {
    const zeile = (f: (string | number | null | undefined)[]) => f.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';')
    const rows = [zeile(['Anlage', 'Verwaltung', 'Ort', 'Regelturnus', 'Überschreitung', 'Letzte NU', 'Anzahl NU', 'Dauer (Mon.)', 'Status', 'Sicherheit'])]
    for (const p of gefiltert) rows.push(zeile([p.anlage, p.kunde, p.ort, p.regelturnusJahre === 1 ? '1 Jahr' : '3 Jahre',
      fmtDatum(p.ueberschreitungsdatum), p.letzteNachuntersuchung ? fmtDatum(p.letzteNachuntersuchung) : '', p.anzahlNachuntersuchungen,
      p.dauerMonate ?? '', STATUS_TEXT[p.status], SICHER_TEXT[p.sicherheit]]))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    a.download = `NOVAplan_Ueberschreitungen_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="global-actions no-print">
        <button onClick={() => window.print()}><i className="fas fa-print" aria-hidden="true"></i> Aktuelle Ansicht drucken</button>
        <button onClick={csvExport}><i className="fas fa-file-csv" aria-hidden="true"></i> Gefiltert als CSV</button>
        {aktiveFilter && <button onClick={reset}><i className="fas fa-filter-circle-xmark" aria-hidden="true"></i> Filter zurücksetzen</button>}
      </div>

      <div className="cards">
        <div className="card"><div className="label">Überschreitungsphasen</div><div className="value">{gefiltert.length}</div></div>
        <div className="card"><div className="label">Betroffene Anlagen</div><div className="value">{betroffen}</div></div>
        <div className="card"><div className="label">Aktive Phasen</div><div className="value">{aktiv}</div></div>
        <div className="card">
          <select className="kpi-select" value={kpi} onChange={e => setKpi(e.target.value as KpiWahl)} aria-label="Kennzahl">
            {Object.entries(KPI_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div className="value">{kpiWert()}</div>
        </div>
        <div className="card"><div className="label">Prüffälle</div><div className="value">{prueffaelle}</div></div>
        <div className="card"><div className="label">Median Dauer</div><div className="value">{median ?? '–'}{median != null && <span style={{ fontSize: '.75rem', fontWeight: 400 }}> Mon.</span>}</div></div>
      </div>

      <Abschnitt titel={`Fachlich geführte Überschreitungsphasen (${fachPhasen.filter(p => !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status)).length})`}>
        <div className="table-container"><table><thead><tr><th>Bereich</th><th>Eröffnet</th><th>Auslöser</th><th>Status</th><th>Abschlussregel</th><th className="no-print"></th></tr></thead><tbody>
          {fachPhasen.filter(p => !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status)).map(p => <tr key={p.id} className="amp-red"><td>{bereiche.find(b => b.id === p.bereich_id)?.name ?? '–'}</td><td>{fmtDatum(p.eroeffnet_am)}</td><td>{p.ausloeser}</td><td>{p.status.replace('_', ' ')}</td><td>{p.saubere_nu_erforderlich} saubere NUs oder GA</td><td className="no-print"><button className="zeile-btn" onClick={() => setPhaseBearbeiten(p)}><i className="fas fa-sitemap" aria-hidden="true"></i> Verwalten</button></td></tr>)}
          {fachPhasen.filter(p => !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status)).length === 0 && <tr><td colSpan={6} className="hint">Noch keine manuell erfasste Überschreitungsphase.</td></tr>}
        </tbody></table></div>
      </Abschnitt>

      <div className="filters panel no-print" style={{ borderRadius: 12, marginBottom: 14 }}>
        <div className="suchfeld" style={{ maxWidth: 260 }}>
          <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input placeholder="Verwaltung, Objekt, Ort …" value={suche} onChange={e => setSuche(e.target.value)} onKeyDown={e => e.key === 'Escape' && setSuche('')} />
          {suche && <button className="suchfeld-x" onClick={() => setSuche('')}>×</button>}
        </div>
        <select value={fJahr} onChange={e => setFJahr(e.target.value)}><option value="">Alle Jahre</option>{jahre.map(j => <option key={j}>{j}</option>)}</select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Alle Status</option><option value="aktiv">Aktiv</option><option value="prueffall">Prüffall</option><option value="abgeschlossen">Abgeschlossen</option></select>
        <select value={fSicher} onChange={e => setFSicher(e.target.value)}><option value="">Alle Sicherheit</option><option value="hoch">Hoch</option><option value="mittel">Mittel</option><option value="pruefen">Prüfen</option></select>
        <select value={fKunde} onChange={e => setFKunde(e.target.value)}><option value="">Alle Verwaltungen</option>{[...new Set(phasen.map(p => p.kunde))].sort().map(k => <option key={k}>{k}</option>)}</select>
        <select value={fDauer} onChange={e => setFDauer(e.target.value)}>
          <option value="">Alle Dauern</option><option value="0-6">bis 6 Monate</option><option value="7-12">7–12 Monate</option>
          <option value="13-24">13–24 Monate</option><option value="25-36">25–36 Monate</option><option value="37+">über 36 Monate</option>
        </select>
      </div>

      <Klappe titel="Überschreitungsphasen je Jahr">
        <Balken daten={jahre.slice(0, 12).reverse().map(j => ({ label: String(j), wert: gefiltert.filter(p => p.ueberschreitungsjahr === j).length, farbe: '#c0392b' }))} />
      </Klappe>
      <Klappe titel="Überschreitungsquote je Jahr (%)">
        <Balken einheit="%" daten={[...statistik].reverse().slice(-12).map(s => ({ label: String(s.jahr), wert: s.quoteProzent, farbe: '#b45309' }))} />
      </Klappe>
      <Klappe titel="Phasendauer-Verteilung (Monate)" offen={false}>
        <Balken daten={([['≤6', (m: number) => m <= 6], ['7–12', (m: number) => m >= 7 && m <= 12], ['13–24', (m: number) => m >= 13 && m <= 24], ['25–36', (m: number) => m >= 25 && m <= 36], ['>36', (m: number) => m > 36]] as [string, (m: number) => boolean][])
          .map(([label, test]) => ({ label, wert: dauern.filter(test).length, farbe: '#2980b9' }))} />
      </Klappe>
      <Klappe titel="Verwaltungen mit den meisten aktiven Phasen" offen={false}>
        <Balken daten={(() => {
          const z = new Map<string, number>()
          for (const p of gefiltert.filter(x => x.status !== 'abgeschlossen')) z.set(p.kunde, (z.get(p.kunde) ?? 0) + 1)
          return [...z.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, wert]) => ({ label: label.slice(0, 9), wert, farbe: '#8e44ad' }))
        })()} />
      </Klappe>

      <Abschnitt titel="Untersuchte Anlagen und Überschreitungsquote pro Jahr">
        <div className="table-container">
          <table>
            <thead><tr><th>Jahr</th><th>Regulär untersucht</th><th>Davon überschritten</th><th>Quote</th></tr></thead>
            <tbody>
              {statistik.map(s => (
                <tr key={s.jahr}><td><strong>{s.jahr}</strong></td><td>{s.untersuchteAnlagen}</td><td>{s.ueberschritteneAnlagen}</td><td>{s.quoteProzent} %</td></tr>
              ))}
              {statistik.length === 0 && <tr><td colSpan={4} className="hint">Nach dem Import erscheinen hier die Auswertungen.</td></tr>}
            </tbody>
          </table>
        </div>
      </Abschnitt>

      <Abschnitt titel={`Überschreitungsphasen (${gefiltert.length})`}
        legende={<>
          <span className="legend-chip legend-red">aktiv</span>
          <span className="legend-chip legend-yellow">Prüffall</span>
          <span className="legend-chip legend-green">abgeschlossen</span>
        </>}>
        <div className="table-container">
          <table>
            <thead><tr><th>Anlage</th><th>Verwaltung</th><th>Ort</th><th>Regelturnus</th><th>Überschreitung</th><th>Letzte NU</th><th>NU</th><th>Dauer</th><th>Sicherheit</th><th>Status</th></tr></thead>
            <tbody>
              {gefiltert.slice(0, 400).map((p, i) => (
                <tr key={p.anlageId + p.ueberschreitungsdatum + i} className={p.status === 'aktiv' ? 'amp-red' : p.status === 'prueffall' ? 'amp-yellow' : ''}>
                  <td>{p.anlage}</td><td>{p.kunde}</td><td>{p.ort ?? '–'}</td>
                  <td>{p.regelturnusJahre === 1 ? '1 Jahr' : '3 Jahre'}</td>
                  <td>{fmtDatum(p.ueberschreitungsdatum)}</td>
                  <td>{p.letzteNachuntersuchung ? fmtDatum(p.letzteNachuntersuchung) : '–'}</td>
                  <td>{p.anzahlNachuntersuchungen}</td>
                  <td>{p.dauerMonate != null ? `${p.dauerMonate} M.` : '–'}</td>
                  <td><span className={`badge ${p.sicherheit === 'hoch' ? 'closed' : p.sicherheit === 'mittel' ? 'medium' : 'check'}`}>{SICHER_TEXT[p.sicherheit]}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[p.status]}`}>{STATUS_TEXT[p.status]}</span></td>
                </tr>
              ))}
              {gefiltert.length === 0 && <tr><td colSpan={10} className="hint">Keine Phasen für die gewählten Filter.</td></tr>}
            </tbody>
          </table>
        </div>
        {gefiltert.length > 400 && <p className="hint" style={{ padding: '10px 20px' }}>Angezeigt: erste 400 von {gefiltert.length} – Filter nutzen.</p>}
      </Abschnitt>
      {phaseBearbeiten && <PhaseModal phase={phaseBearbeiten} bereichName={bereiche.find(b => b.id === phaseBearbeiten.bereich_id)?.name} onClose={() => setPhaseBearbeiten(null)} onSaved={laden} />}
    </>
  )
}
