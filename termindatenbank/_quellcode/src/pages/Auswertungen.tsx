import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Kunde, Termin } from '../lib/types'
import { fmtDatum } from '../lib/types'
import { Abschnitt } from '../components/ui'
import { phasenErmitteln, jahresStatistik, type AnlagenEingabe } from '../lib/phasen'

/** Schlichtes Balkendiagramm in NOVAplan-Farben (reines SVG, druckfähig). */
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
            <g key={d.label}>
              <rect x={x} y={h - bh + 8} width={bw} height={bh} rx={5} fill={d.farbe ?? '#2980b9'} />
              <text x={x + bw / 2} y={h - bh} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#2c3e50">
                {d.wert}{einheit}
              </text>
              <text x={x + bw / 2} y={h + 26} textAnchor="middle" fontSize="10.5" fill="#7f8c8d">{d.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Einklappbarer Diagramm-Abschnitt. */
function Klappe({ titel, offen = true, children }: { titel: string; offen?: boolean; children: React.ReactNode }) {
  return (
    <details className="klappe" open={offen}>
      <summary><i className="fas fa-chart-column" aria-hidden="true"></i> {titel}
        <i className="fas fa-chevron-down klappe-pfeil" aria-hidden="true"></i></summary>
      {children}
    </details>
  )
}

const STATUS_BADGE: Record<string, string> = {
  aktiv: 'active', abgeschlossen: 'closed', prueffall: 'check',
}
const STATUS_TEXT: Record<string, string> = {
  aktiv: 'aktiv', abgeschlossen: 'abgeschlossen', prueffall: 'Prüffall',
}

export default function Auswertungen() {
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [termine, setTermine] = useState<Termin[]>([])
  const [fKunde, setFKunde] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fJahr, setFJahr] = useState('')

  useEffect(() => {
    db.anlagen().then(setAnlagen); db.kunden().then(setKunden); db.termine().then(setTermine)
  }, [])

  const eingabe: AnlagenEingabe[] = useMemo(() => anlagen.map(a => ({
    id: a.id,
    name: a.name,
    kunde: kunden.find(k => k.id === a.kunde_id)?.name_kurz ?? '–',
    ort: a.ort,
    turnusMonate: a.turnus_monate,
    termine: termine.filter(t => t.anlage_id === a.id).map(t => t.datum),
  })), [anlagen, kunden, termine])

  const phasen = useMemo(() => phasenErmitteln(eingabe), [eingabe])
  const statistik = useMemo(() => jahresStatistik(eingabe, phasen), [eingabe, phasen])

  const jahre = [...new Set(phasen.map(p => p.ueberschreitungsjahr))].sort((a, b) => b - a)
  const gefiltert = phasen.filter(p =>
    (!fKunde || p.kunde === fKunde) &&
    (!fStatus || p.status === fStatus) &&
    (!fJahr || String(p.ueberschreitungsjahr) === fJahr))

  const aktiv = phasen.filter(p => p.status === 'aktiv').length
  const prueffaelle = phasen.filter(p => p.status === 'prueffall').length
  const betroffen = new Set(phasen.map(p => p.anlageId)).size
  const dauern = phasen.map(p => p.dauerMonate).filter((d): d is number => d != null).sort((a, b) => a - b)
  const median = dauern.length ? dauern[Math.floor(dauern.length / 2)] : null

  return (
    <>
      <h1>Auswertungen</h1>
      <p className="sub">
        Überschreitungsphasen werden aus den Untersuchungsterminen rekonstruiert: ein deutlich
        kürzerer Abstand als der Regelturnus gilt als Nachuntersuchung.
      </p>

      <div className="cards">
        <div className="card"><div className="label">Anlagen geprüft</div><div className="value">{eingabe.length}</div></div>
        <div className="card"><div className="label">Überschreitungsphasen</div><div className="value">{phasen.length}</div></div>
        <div className="card"><div className="label">Betroffene Anlagen</div><div className="value">{betroffen}</div></div>
        <div className="card"><div className="label">Aktive Phasen</div><div className="value">{aktiv}</div></div>
        <div className="card"><div className="label">Prüffälle</div><div className="value">{prueffaelle}</div></div>
        <div className="card"><div className="label">Median Dauer</div><div className="value">{median ?? '–'}{median != null && <span style={{ fontSize: '.8rem', fontWeight: 400 }}> Mon.</span>}</div></div>
      </div>

      <Klappe titel="Überschreitungsphasen je Jahr">
        <Balken daten={jahre.slice(0, 12).reverse().map(j => ({
          label: String(j), wert: phasen.filter(p => p.ueberschreitungsjahr === j).length, farbe: '#c0392b',
        }))} />
      </Klappe>

      <Klappe titel="Überschreitungsquote je Jahr (%)">
        <Balken einheit="%" daten={[...statistik].reverse().slice(-12).map(s => ({
          label: String(s.jahr), wert: s.quoteProzent, farbe: '#b45309',
        }))} />
      </Klappe>

      <Klappe titel="Dauer der Phasen (Monate bis zur letzten Nachuntersuchung)" offen={false}>
        <Balken daten={(() => {
          const gruppen: [string, (m: number) => boolean][] = [
            ['≤ 3', m => m <= 3], ['4–6', m => m >= 4 && m <= 6], ['7–12', m => m >= 7 && m <= 12],
            ['13–24', m => m >= 13 && m <= 24], ['> 24', m => m > 24]]
          return gruppen.map(([label, test]) => ({
            label, wert: dauern.filter(test).length, farbe: '#2980b9' }))
        })()} />
      </Klappe>

      <Klappe titel="Verwaltungen mit den meisten aktiven Phasen" offen={false}>
        <Balken daten={(() => {
          const zaehler = new Map<string, number>()
          for (const p of phasen.filter(x => x.status !== 'abgeschlossen'))
            zaehler.set(p.kunde, (zaehler.get(p.kunde) ?? 0) + 1)
          return [...zaehler.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
            .map(([label, wert]) => ({ label: label.slice(0, 9), wert, farbe: '#8e44ad' }))
        })()} />
      </Klappe>

      <Abschnitt titel="Jahresstatistik"
        aktionen={<button onClick={() => window.print()}><i className="fas fa-print" aria-hidden="true"></i> Drucken</button>}>
        <div className="table-container">
          <table>
            <thead><tr><th>Jahr</th><th>Untersuchte Anlagen</th><th>Überschrittene Anlagen</th><th>Überschreitungsquote</th></tr></thead>
            <tbody>
              {statistik.map(s => (
                <tr key={s.jahr}>
                  <td><strong>{s.jahr}</strong></td>
                  <td>{s.untersuchteAnlagen}</td>
                  <td>{s.ueberschritteneAnlagen}</td>
                  <td>{s.quoteProzent} %</td>
                </tr>
              ))}
              {statistik.length === 0 && <tr><td colSpan={4} className="hint">Noch keine Untersuchungsdaten vorhanden – nach dem Import erscheinen hier die Auswertungen.</td></tr>}
            </tbody>
          </table>
        </div>
      </Abschnitt>

      <Abschnitt titel={`Überschreitungsphasen (${gefiltert.length})`}
        legende={<>
          <span className="legend-chip legend-red">aktiv – Nachuntersuchungen laufen</span>
          <span className="legend-chip legend-yellow">Prüffall – lange keine Untersuchung</span>
          <span className="legend-chip legend-green">abgeschlossen – Turnus normalisiert</span>
        </>}>
        <div className="filters">
          <select value={fKunde} onChange={e => setFKunde(e.target.value)}>
            <option value="">Kunde: alle</option>
            {[...new Set(phasen.map(p => p.kunde))].sort().map(k => <option key={k}>{k}</option>)}
          </select>
          <select value={fJahr} onChange={e => setFJahr(e.target.value)}>
            <option value="">Jahr: alle</option>
            {jahre.map(j => <option key={j}>{j}</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">Status: alle</option>
            <option value="aktiv">aktiv</option>
            <option value="prueffall">Prüffall</option>
            <option value="abgeschlossen">abgeschlossen</option>
          </select>
        </div>
        <div className="table-container">
          <table>
            <thead><tr>
              <th>Anlage</th><th>Kunde</th><th>Ort</th><th>Regelturnus</th>
              <th>Überschreitung</th><th>Letzte Nachunters.</th><th>Nachunters.</th><th>Dauer</th><th>Status</th>
            </tr></thead>
            <tbody>
              {gefiltert.slice(0, 300).map((p, i) => (
                <tr key={p.anlageId + p.ueberschreitungsdatum + i}
                  className={p.status === 'aktiv' ? 'amp-red' : p.status === 'prueffall' ? 'amp-yellow' : ''}>
                  <td>{p.anlage}</td>
                  <td>{p.kunde}</td>
                  <td>{p.ort ?? '–'}</td>
                  <td>{p.regelturnusJahre === 1 ? '1 Jahr' : '3 Jahre'}</td>
                  <td>{fmtDatum(p.ueberschreitungsdatum)}</td>
                  <td>{p.letzteNachuntersuchung ? fmtDatum(p.letzteNachuntersuchung) : '–'}</td>
                  <td>{p.anzahlNachuntersuchungen}</td>
                  <td>{p.dauerMonate != null ? `${p.dauerMonate} Mon.` : '–'}</td>
                  <td><span className={`badge ${STATUS_BADGE[p.status]}`}>{STATUS_TEXT[p.status]}</span></td>
                </tr>
              ))}
              {gefiltert.length === 0 && <tr><td colSpan={9} className="hint">Keine Phasen für die gewählten Filter.</td></tr>}
            </tbody>
          </table>
        </div>
        {gefiltert.length > 300 && <p className="hint" style={{ padding: '10px 20px' }}>Angezeigt: erste 300 von {gefiltert.length}. Filter nutzen zum Eingrenzen.</p>}
      </Abschnitt>
    </>
  )
}
