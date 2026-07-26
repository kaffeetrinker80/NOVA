import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Auftrag, Bereich, Kunde, Termin } from '../lib/types'
import { ART_LABEL, ERGEBNIS_LABEL, STATUS_LABEL, fmtDatum, nummerVoll } from '../lib/types'
import { Abschnitt, ErgebnisBadge, Nr, StatusBadge } from '../components/ui'

export default function Auftragsbuch() {
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [termine, setTermine] = useState<Termin[]>([])
  const [suche, setSuche] = useState('')
  const [fJahr, setFJahr] = useState(''); const [fKunde, setFKunde] = useState('')
  const [fArt, setFArt] = useState(''); const [fStatus, setFStatus] = useState('')
  const [fErgebnis, setFErgebnis] = useState('')
  const [bearbeite, setBearbeite] = useState<string | null>(null)

  const laden = () => {
    db.auftraege().then(setAuftraege); db.kunden().then(setKunden)
    db.anlagen().then(setAnlagen); db.bereiche().then(setBereiche); db.termine().then(setTermine)
  }
  useEffect(laden, [])

  const zeilen = useMemo(() => auftraege.flatMap(a => {
    const bereich = bereiche.find(b => b.id === a.bereich_id)
    const anlage = anlagen.find(x => x.id === bereich?.anlage_id)
    const kunde = kunden.find(k => k.id === anlage?.kunde_id)
    const termin = termine.find(t => t.id === a.termin_id)
    return a.unterauftraege.map(u => ({ a, u, bereich, anlage, kunde, termin, nummer: nummerVoll(a, u) }))
  }), [auftraege, bereiche, anlagen, kunden, termine])

  const gefiltert = zeilen.filter(z =>
    (!suche || z.nummer.toLowerCase().includes(suche.toLowerCase())
      || z.kunde?.name_lang.toLowerCase().includes(suche.toLowerCase())
      || z.anlage?.name.toLowerCase().includes(suche.toLowerCase()))
    && (!fJahr || String(z.a.jahr) === fJahr)
    && (!fKunde || z.kunde?.id === fKunde)
    && (!fArt || z.u.art === fArt)
    && (!fStatus || z.u.status === fStatus)
    && (!fErgebnis || z.u.ergebnis === fErgebnis),
  )

  const jahre = [...new Set(zeilen.map(z => z.a.jahr))].sort().reverse()

  const speichern = async (id: string, feld: string, wert: string) => {
    await db.unterauftragAktualisieren(id, { [feld]: feld === 'proben_ist' ? +wert : wert } as any)
    laden()
  }

  return (
    <>
      <Abschnitt titel={`Auftragsbuch (${gefiltert.length})`}
        aktionen={<button onClick={() => window.print()}>
          <i className="fas fa-print" aria-hidden="true"></i> Gefilterte Liste drucken
        </button>}>
      <div className="filters">
        <input placeholder="Suche: Auftragsnummer, Kunde, Anlage …" value={suche} onChange={e => setSuche(e.target.value)} style={{ minWidth: 260 }} />
        <select value={fJahr} onChange={e => setFJahr(e.target.value)}><option value="">Jahr: alle</option>{jahre.map(j => <option key={j}>{j}</option>)}</select>
        <select value={fKunde} onChange={e => setFKunde(e.target.value)}><option value="">Kunde: alle</option>{kunden.map(k => <option key={k.id} value={k.id}>{k.name_kurz}</option>)}</select>
        <select value={fArt} onChange={e => setFArt(e.target.value)}><option value="">Art: alle</option>{Object.entries(ART_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Status: alle</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={fErgebnis} onChange={e => setFErgebnis(e.target.value)}><option value="">Ergebnis: alle</option>{Object.entries(ERGEBNIS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>

      <div className="table-container">
      <table>
        <thead><tr>
          <th>Nr.</th><th>Kunde</th><th>Anlage</th><th>Bereich</th><th>Termin</th>
          <th>Art / Umfang</th><th>Proben (Soll/Ist)</th><th>Status</th><th>Ergebnis</th><th></th>
        </tr></thead>
        <tbody>
          {gefiltert.map(z => (
            <tr key={z.u.id}>
              <td><Nr>{z.nummer}</Nr></td>
              <td>{z.kunde?.name_kurz ?? '–'}</td>
              <td>{z.anlage?.name ?? '–'}</td>
              <td>{z.bereich?.name ?? '–'}</td>
              <td>{fmtDatum(z.termin?.datum)}</td>
              <td>{ART_LABEL[z.u.art]}{z.u.umfang ? <div className="hint">{z.u.umfang}</div> : null}</td>
              <td>
                {z.u.proben_geplant ?? '–'} / {bearbeite === z.u.id
                  ? <input type="number" style={{ width: 64 }} defaultValue={z.u.proben_ist ?? ''} onBlur={e => { speichern(z.u.id, 'proben_ist', e.target.value); setBearbeite(null) }} autoFocus />
                  : <span onClick={() => setBearbeite(z.u.id)} style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}>{z.u.proben_ist ?? '–'}</span>}
              </td>
              <td><StatusBadge s={z.u.status} /></td>
              <td><ErgebnisBadge s={z.u.ergebnis} /></td>
              <td>
                <select value={z.u.ergebnis} onChange={e => speichern(z.u.id, 'ergebnis', e.target.value)} title="Ergebnis setzen">
                  {Object.entries(ERGEBNIS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {gefiltert.length === 0 && <tr><td colSpan={10} className="hint">Keine Aufträge für die gewählten Filter.</td></tr>}
        </tbody>
      </table>
      </div>
      </Abschnitt>
    </>
  )
}
