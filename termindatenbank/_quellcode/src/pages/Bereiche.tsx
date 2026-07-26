import { useEffect, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Bereich, Kunde } from '../lib/types'

export default function Bereiche() {
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [neu, setNeu] = useState(false)
  const [f, setF] = useState({ anlage_id: '', name: '', beschreibung: '', wwb_details: '', notizen: '' })
  const laden = () => { db.bereiche().then(setBereiche); db.anlagen().then(setAnlagen); db.kunden().then(setKunden) }
  useEffect(laden, [])

  const speichern = async () => {
    if (!f.anlage_id || !f.name) return
    await db.bereichAnlegen(f)
    setNeu(false); setF({ ...f, name: '' }); laden()
  }

  return (
    <>
      <h1>Untersuchungsbereiche / WWB</h1>
      <p className="sub">Die operative Einheit, die beprobt und bewertet wird – jedes eigenständige Warmwassersystem als eigener Bereich. Bereiche können auch nachträglich aufgeteilt werden.</p>
      {!neu && <p><button className="primary" onClick={() => setNeu(true)}>Neuen Bereich anlegen</button></p>}
      {neu && (
        <div className="panel">
          <div className="grid2">
            <label className="f">Anlage<select value={f.anlage_id} onChange={e => setF({ ...f, anlage_id: e.target.value })}>
              <option value="">– wählen –</option>
              {anlagen.map(a => <option key={a.id} value={a.id}>{a.name} ({kunden.find(k => k.id === a.kunde_id)?.name_kurz})</option>)}</select></label>
            <label className="f">Bezeichnung<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Haus 3–5" /></label>
            <label className="f">Gebäude / Hausnummernbereich<input value={f.beschreibung} onChange={e => setF({ ...f, beschreibung: e.target.value })} /></label>
            <label className="f">WW-System-Details<input value={f.wwb_details} onChange={e => setF({ ...f, wwb_details: e.target.value })} /></label>
          </div>
          <p><button className="primary" onClick={speichern}>Speichern</button> <button className="ghost" onClick={() => setNeu(false)}>Abbrechen</button></p>
        </div>
      )}
      <table className="tbl">
        <thead><tr><th>Bereich</th><th>Anlage</th><th>Kunde</th><th>Beschreibung</th><th>Status</th></tr></thead>
        <tbody>
          {bereiche.map(b => {
            const a = anlagen.find(x => x.id === b.anlage_id)
            return (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.name}</td>
                <td>{a?.name ?? '–'}</td>
                <td>{kunden.find(k => k.id === a?.kunde_id)?.name_kurz ?? '–'}</td>
                <td>{b.beschreibung ?? '–'}</td>
                <td><span className={`badge ${b.aktiv ? 'closed' : 'neutral'}`}>{b.aktiv ? 'aktiv' : 'inaktiv'}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
