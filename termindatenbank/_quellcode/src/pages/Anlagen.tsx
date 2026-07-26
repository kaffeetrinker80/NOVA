import { useEffect, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Kunde } from '../lib/types'
import { fmtDatum } from '../lib/types'

export default function Anlagen() {
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [neu, setNeu] = useState(false)
  const [f, setF] = useState({ kunde_id: '', name: '', strasse: '', plz: '', ort: '', objekt_referenz: '', turnus_monate: 36, naechste_untersuchung: '', notizen: '' })
  const laden = () => { db.anlagen().then(setAnlagen); db.kunden().then(setKunden) }
  useEffect(laden, [])

  const speichern = async () => {
    if (!f.kunde_id || !f.name) return
    await db.anlageAnlegen({ ...f, naechste_untersuchung: f.naechste_untersuchung || undefined })
    setNeu(false); laden()
  }

  return (
    <>
      <h1>Anlagen</h1>
      <p className="sub">Objekte der Kunden – jedes Objekt kann mehrere unabhängig untersuchbare Warmwassersysteme enthalten</p>
      {!neu && <p><button className="primary" onClick={() => setNeu(true)}>Neue Anlage anlegen</button></p>}
      {neu && (
        <div className="panel">
          <div className="grid2">
            <label className="f">Kunde<select value={f.kunde_id} onChange={e => setF({ ...f, kunde_id: e.target.value })}>
              <option value="">– wählen –</option>{kunden.map(k => <option key={k.id} value={k.id}>{k.name_kurz}</option>)}</select></label>
            <label className="f">Anlagenname<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Straßbergerstr. 11–47" /></label>
            <label className="f">Straße<input value={f.strasse} onChange={e => setF({ ...f, strasse: e.target.value })} /></label>
            <label className="f">PLZ<input value={f.plz} onChange={e => setF({ ...f, plz: e.target.value })} /></label>
            <label className="f">Ort<input value={f.ort} onChange={e => setF({ ...f, ort: e.target.value })} /></label>
            <label className="f">Objekt-/Kundenreferenz<input value={f.objekt_referenz} onChange={e => setF({ ...f, objekt_referenz: e.target.value })} /></label>
            <label className="f">Turnus (Monate)<input type="number" value={f.turnus_monate} onChange={e => setF({ ...f, turnus_monate: +e.target.value })} /></label>
            <label className="f">Nächste Untersuchung<input type="date" value={f.naechste_untersuchung} onChange={e => setF({ ...f, naechste_untersuchung: e.target.value })} /></label>
          </div>
          <p><button className="primary" onClick={speichern}>Speichern</button> <button className="ghost" onClick={() => setNeu(false)}>Abbrechen</button></p>
        </div>
      )}
      <table className="tbl">
        <thead><tr><th>Anlage</th><th>Kunde</th><th>Adresse</th><th>Turnus</th><th>Nächste Untersuchung</th><th>Status</th></tr></thead>
        <tbody>
          {anlagen.map(a => (
            <tr key={a.id}>
              <td style={{ fontWeight: 600 }}>{a.name}</td>
              <td>{kunden.find(k => k.id === a.kunde_id)?.name_kurz ?? '–'}</td>
              <td>{[a.strasse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</td>
              <td>{a.turnus_monate ? `${a.turnus_monate / 12} Jahre` : '–'}</td>
              <td>{fmtDatum(a.naechste_untersuchung)}</td>
              <td><span className={`badge ${a.aktiv ? 'closed' : 'neutral'}`}>{a.aktiv ? 'aktiv' : 'inaktiv'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
