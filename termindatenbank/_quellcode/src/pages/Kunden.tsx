import { useEffect, useState } from 'react'
import { db } from '../lib/data'
import type { Kunde, Kundentyp } from '../lib/types'

const TYP: Record<Kundentyp, string> = {
  hausverwaltung: 'Hausverwaltung', pflegetraeger: 'Pflegeträger',
  wohnungsbau: 'Wohnungsbaugesellschaft', privatkunde: 'Privatkunde', sonstige: 'Sonstige',
}

export default function Kunden() {
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [neu, setNeu] = useState(false)
  const [f, setF] = useState({ name_lang: '', name_kurz: '', typ: 'hausverwaltung' as Kundentyp, strasse: '', plz: '', ort: '', telefon: '', email: '', notizen: '' })
  const laden = () => db.kunden().then(setKunden)
  useEffect(() => { laden() }, [])

  const speichern = async () => {
    if (!f.name_lang || !f.name_kurz) return
    await db.kundeAnlegen(f)
    setNeu(false); setF({ ...f, name_lang: '', name_kurz: '' }); laden()
  }

  return (
    <>
      <h1>Kunden &amp; Hausverwaltungen</h1>
      <p className="sub">Hausverwaltungen, Pflegeträger, Wohnungsbaugesellschaften und Privatkunden</p>
      {!neu && <p><button className="primary" onClick={() => setNeu(true)}>Neuen Kunden anlegen</button></p>}
      {neu && (
        <div className="panel">
          <div className="grid2">
            <label className="f">Vollständiger Name<input value={f.name_lang} onChange={e => setF({ ...f, name_lang: e.target.value })} placeholder="Augusta Hausverwaltung GmbH & Co. KG" /></label>
            <label className="f">Kurzname (Kalender)<input value={f.name_kurz} onChange={e => setF({ ...f, name_kurz: e.target.value })} placeholder="Augusta" /></label>
            <label className="f">Typ<select value={f.typ} onChange={e => setF({ ...f, typ: e.target.value as Kundentyp })}>{Object.entries(TYP).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="f">Straße<input value={f.strasse} onChange={e => setF({ ...f, strasse: e.target.value })} /></label>
            <label className="f">PLZ<input value={f.plz} onChange={e => setF({ ...f, plz: e.target.value })} /></label>
            <label className="f">Ort<input value={f.ort} onChange={e => setF({ ...f, ort: e.target.value })} /></label>
            <label className="f">Telefon<input value={f.telefon} onChange={e => setF({ ...f, telefon: e.target.value })} /></label>
            <label className="f">E-Mail<input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
          </div>
          <label className="f" style={{ marginTop: 12 }}>Notizen<textarea rows={2} value={f.notizen} onChange={e => setF({ ...f, notizen: e.target.value })} /></label>
          <p><button className="primary" onClick={speichern}>Speichern</button> <button className="ghost" onClick={() => setNeu(false)}>Abbrechen</button></p>
        </div>
      )}
      <table className="tbl">
        <thead><tr><th>Kurzname</th><th>Vollständiger Name</th><th>Typ</th><th>Ort</th><th>Kontakt</th><th>Status</th></tr></thead>
        <tbody>
          {kunden.map(k => (
            <tr key={k.id}>
              <td style={{ fontWeight: 600 }}>{k.name_kurz}</td>
              <td>{k.name_lang}</td>
              <td>{TYP[k.typ]}</td>
              <td>{k.ort ?? '–'}</td>
              <td>{k.telefon ?? ''}{k.telefon && k.email ? ' · ' : ''}{k.email ?? ''}</td>
              <td><span className={`badge ${k.aktiv ? 'closed' : 'neutral'}`}>{k.aktiv ? 'aktiv' : 'inaktiv'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
