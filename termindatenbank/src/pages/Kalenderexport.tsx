import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Auftrag, Bereich, Kunde, Termin } from '../lib/types'
import { fmtDatum } from '../lib/types'
import { icsHerunterladen, kalenderBeschreibung, kalenderTitel, KalenderKontext } from '../lib/ics'

export default function Kalenderexport() {
  const [termine, setTermine] = useState<Termin[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [terminId, setTerminId] = useState('')
  const [kopiert, setKopiert] = useState(false)

  useEffect(() => {
    db.termine().then(setTermine); db.kunden().then(setKunden); db.anlagen().then(setAnlagen)
    db.bereiche().then(setBereiche); db.auftraege().then(setAuftraege)
  }, [])

  const kontext: KalenderKontext | null = useMemo(() => {
    const t = termine.find(x => x.id === terminId)
    if (!t) return null
    const kunde = kunden.find(k => k.id === t.kunde_id)
    const anlage = anlagen.find(a => a.id === t.anlage_id)
    if (!kunde || !anlage) return null
    const zug = auftraege.filter(a => a.termin_id === t.id)
      .map(auftrag => ({ auftrag, bereich: bereiche.find(b => b.id === auftrag.bereich_id)! }))
      .filter(x => x.bereich)
    return { termin: t, kunde, anlage, auftraege: zug }
  }, [terminId, termine, kunden, anlagen, bereiche, auftraege])

  const volltext = kontext ? kalenderTitel(kontext) + '\n\n' + kalenderBeschreibung(kontext) : ''

  const kopieren = async () => {
    await navigator.clipboard.writeText(volltext)
    setKopiert(true); setTimeout(() => setKopiert(false), 2000)
  }

  return (
    <>
      <h1>Kalenderexport</h1>
      <p className="sub">Termintext für Outlook erzeugen – zum Kopieren oder als ICS-Datei</p>
      <div className="panel">
        <label className="f">Termin wählen
          <select value={terminId} onChange={e => setTerminId(e.target.value)}>
            <option value="">– wählen –</option>
            {termine.map(t => {
              const k = kunden.find(x => x.id === t.kunde_id)
              const a = anlagen.find(x => x.id === t.anlage_id)
              return <option key={t.id} value={t.id}>{fmtDatum(t.datum)} – {k?.name_kurz} – {a?.name}</option>
            })}
          </select>
        </label>
      </div>

      {kontext && (
        <>
          <div className="panel">
            <div className="hint">Kalendertitel</div>
            <p style={{ fontWeight: 600, margin: '6px 0 0' }}>{kalenderTitel(kontext)}</p>
          </div>
          <pre className="cal">{kalenderBeschreibung(kontext)}</pre>
          <p>
            <button className="primary" onClick={kopieren}>{kopiert ? 'Kopiert ✓' : 'Kalendertext kopieren'}</button>{' '}
            <button className="ghost" onClick={() => icsHerunterladen(kontext)}>ICS-Datei herunterladen</button>
          </p>
        </>
      )}
      {terminId && !kontext?.auftraege.length && kontext && (
        <p className="hint">Hinweis: Zu diesem Termin sind noch keine Aufträge vorhanden.</p>
      )}
    </>
  )
}
