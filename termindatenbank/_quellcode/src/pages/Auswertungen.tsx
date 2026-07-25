import { useEffect, useState } from 'react'
import { db } from '../lib/data'
import type { Auftrag } from '../lib/types'
import { ART_LABEL } from '../lib/types'

export default function Auswertungen() {
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  useEffect(() => { db.auftraege().then(setAuftraege) }, [])

  const unter = auftraege.flatMap(a => a.unterauftraege.map(u => ({ jahr: a.jahr, ...u })))
  const jahre = [...new Set(unter.map(u => u.jahr))].sort().reverse()

  return (
    <>
      <h1>Auswertungen</h1>
      <p className="sub">Kennzahlen je Jahr und Untersuchungsart – Grundlage für spätere Überschreitungs- und Nachuntersuchungs-Auswertungen</p>
      {jahre.map(jahr => {
        const j = unter.filter(u => u.jahr === jahr)
        return (
          <div key={jahr} className="panel">
            <h2 style={{ marginTop: 0 }}>{jahr}</h2>
            <table className="tbl">
              <thead><tr><th>Untersuchungsart</th><th>Aufträge</th><th>Proben geplant</th><th>Proben ist</th><th>überschritten</th><th>Nachuntersuchung</th></tr></thead>
              <tbody>
                {Object.entries(ART_LABEL).map(([art, label]) => {
                  const x = j.filter(u => u.art === art)
                  if (!x.length) return null
                  return (
                    <tr key={art}>
                      <td>{label}</td>
                      <td>{x.length}</td>
                      <td>{x.reduce((s, u) => s + (u.proben_geplant ?? 0), 0)}</td>
                      <td>{x.reduce((s, u) => s + (u.proben_ist ?? 0), 0)}</td>
                      <td>{x.filter(u => u.ergebnis === 'ueberschritten').length}</td>
                      <td>{x.filter(u => u.ergebnis === 'nachuntersuchung_erforderlich').length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
      <p className="hint">Die vorhandenen Auswertungen aus den bestehenden Dashboards (Überschreitungsphasen, Quoten je Verwaltung, Turnusüberwachung) werden nach der Datenmigration hier abgebildet.</p>
    </>
  )
}
