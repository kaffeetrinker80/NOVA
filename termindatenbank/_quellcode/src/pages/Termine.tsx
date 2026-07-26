import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Auftrag, Bereich, Kunde, Termin, Untersuchungsart } from '../lib/types'
import { ART_LABEL, fmtDatum } from '../lib/types'
import { Nr, TerminBadge } from '../components/ui'

interface ArtWahl { art: Untersuchungsart; suffix: string; umfang?: string; proben_geplant?: number; aktiv: boolean }
const artenStandard = (): ArtWahl[] => [
  { art: 'legionellen', suffix: '', aktiv: true, proben_geplant: undefined },
  { art: 'mibi', suffix: 'M', umfang: 'Standard', aktiv: false },
  { art: 'chemie', suffix: 'C', aktiv: false },
  { art: 'vorortparameter', suffix: 'V', aktiv: false },
  { art: 'sonstiges', suffix: 'S', aktiv: false },
]

export default function Termine() {
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [termine, setTermine] = useState<Termin[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [neu, setNeu] = useState(false)
  const [meldung, setMeldung] = useState('')

  // Formular
  const [kundeId, setKundeId] = useState('')
  const [anlageId, setAnlageId] = useState('')
  const [datum, setDatum] = useState('')
  const [beginn, setBeginn] = useState('09:00')
  const [ende, setEnde] = useState('12:00')
  const [frist, setFrist] = useState('')
  const [notizen, setNotizen] = useState('')
  const [bereichWahl, setBereichWahl] = useState<Record<string, ArtWahl[]>>({})

  const laden = () => {
    db.kunden().then(setKunden); db.anlagen().then(setAnlagen)
    db.bereiche().then(setBereiche); db.termine().then(setTermine); db.auftraege().then(setAuftraege)
  }
  useEffect(laden, [])

  const anlagenDesKunden = useMemo(() => anlagen.filter(a => a.kunde_id === kundeId), [anlagen, kundeId])
  const bereicheDerAnlage = useMemo(() => bereiche.filter(b => b.anlage_id === anlageId), [bereiche, anlageId])

  const toggleBereich = (id: string) =>
    setBereichWahl(w => (id in w ? Object.fromEntries(Object.entries(w).filter(([k]) => k !== id)) : { ...w, [id]: artenStandard() }))

  const speichern = async () => {
    if (!kundeId || !anlageId || !datum || Object.keys(bereichWahl).length === 0) {
      setMeldung('Bitte Kunde, Anlage, Datum und mindestens einen Untersuchungsbereich wählen.'); return
    }
    const terminId = await db.terminAnlegen({
      kunde_id: kundeId, anlage_id: anlageId, datum, beginn, ende,
      status: 'geplant', frist: frist || undefined, notizen: notizen || undefined,
    })
    const nummern: string[] = []
    for (const [bereichId, arten] of Object.entries(bereichWahl)) {
      const aktive = arten.filter(a => a.aktiv)
      if (!aktive.length) continue
      // Nur eine Art -> Hauptnummer ohne Suffix
      const payload = aktive.length === 1
        ? [{ ...aktive[0], suffix: '' }]
        : aktive.map((a, i) => ({ ...a, suffix: i === 0 ? '' : a.suffix }))
      const nr = await db.auftragAnlegen(bereichId, terminId, payload.map(({ aktiv, ...rest }) => rest))
      nummern.push(nr)
    }
    setMeldung(`Termin angelegt. Vergebene Auftragsnummern: ${nummern.join(', ')}`)
    setNeu(false); setBereichWahl({}); laden()
  }

  const kunde = (id: string) => kunden.find(k => k.id === id)
  const anlage = (id: string) => anlagen.find(a => a.id === id)
  const auftraegeZumTermin = (tid: string) => auftraege.filter(a => a.termin_id === tid)

  return (
    <>
      <h1>Termine</h1>
      <p className="sub">Beprobungstermine planen – je Untersuchungsbereich wird automatisch eine eigene Auftragsnummer vergeben</p>
      {meldung && <div className="notice">{meldung}</div>}
      {!neu && <p><button className="primary" onClick={() => setNeu(true)}>Neuen Termin planen</button></p>}

      {neu && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Neuer Termin</h2>
          <div className="grid2">
            <label className="f">Kunde
              <select value={kundeId} onChange={e => { setKundeId(e.target.value); setAnlageId(''); setBereichWahl({}) }}>
                <option value="">– wählen –</option>
                {kunden.filter(k => k.aktiv).map(k => <option key={k.id} value={k.id}>{k.name_kurz} – {k.name_lang}</option>)}
              </select>
            </label>
            <label className="f">Anlage
              <select value={anlageId} onChange={e => { setAnlageId(e.target.value); setBereichWahl({}) }} disabled={!kundeId}>
                <option value="">– wählen –</option>
                {anlagenDesKunden.map(a => <option key={a.id} value={a.id}>{a.name} ({a.ort})</option>)}
              </select>
            </label>
            <label className="f">Datum<input type="date" value={datum} onChange={e => setDatum(e.target.value)} /></label>
            <label className="f">Beginn<input type="time" value={beginn} onChange={e => setBeginn(e.target.value)} /></label>
            <label className="f">Ende<input type="time" value={ende} onChange={e => setEnde(e.target.value)} /></label>
            <label className="f">Frist / gesetzl. Zeitraum<input type="date" value={frist} onChange={e => setFrist(e.target.value)} /></label>
          </div>
          <label className="f" style={{ marginTop: 12 }}>Hinweise / Anweisungen
            <textarea rows={2} value={notizen} onChange={e => setNotizen(e.target.value)} />
          </label>

          {anlageId && (
            <>
              <h2>Untersuchungsbereiche und Untersuchungsarten</h2>
              {bereicheDerAnlage.length === 0 && <p className="hint">Diese Anlage hat noch keine Untersuchungsbereiche – zuerst unter „Untersuchungsbereiche / WWB“ anlegen.</p>}
              {bereicheDerAnlage.map(b => (
                <div key={b.id} className="panel" style={{ background: '#f8fafb' }}>
                  <label style={{ fontWeight: 600 }}>
                    <input type="checkbox" checked={b.id in bereichWahl} onChange={() => toggleBereich(b.id)} /> {b.name}
                    {b.beschreibung && <span className="hint"> – {b.beschreibung}</span>}
                  </label>
                  {b.id in bereichWahl && (
                    <table className="tbl" style={{ marginTop: 10 }}>
                      <thead><tr><th></th><th>Art</th><th>Umfang</th><th>Proben geplant</th></tr></thead>
                      <tbody>
                        {bereichWahl[b.id].map((a, i) => (
                          <tr key={a.art}>
                            <td><input type="checkbox" checked={a.aktiv} onChange={() =>
                              setBereichWahl(w => ({ ...w, [b.id]: w[b.id].map((x, j) => j === i ? { ...x, aktiv: !x.aktiv } : x) }))} /></td>
                            <td>{ART_LABEL[a.art]}</td>
                            <td>{a.art === 'mibi' ? (
                              <select value={a.umfang} onChange={e =>
                                setBereichWahl(w => ({ ...w, [b.id]: w[b.id].map((x, j) => j === i ? { ...x, umfang: e.target.value } : x) }))}>
                                <option>Standard</option><option>Komplett</option><option>inklusive Enterokokken</option><option value="">Freitext …</option>
                              </select>
                            ) : (a.art === 'sonstiges' ? (
                              <input placeholder="Beschreibung" value={a.umfang ?? ''} onChange={e =>
                                setBereichWahl(w => ({ ...w, [b.id]: w[b.id].map((x, j) => j === i ? { ...x, umfang: e.target.value } : x) }))} />
                            ) : '–')}</td>
                            <td><input type="number" min={0} style={{ width: 80 }} value={a.proben_geplant ?? ''} onChange={e =>
                              setBereichWahl(w => ({ ...w, [b.id]: w[b.id].map((x, j) => j === i ? { ...x, proben_geplant: e.target.value ? +e.target.value : undefined } : x) }))} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </>
          )}
          <p>
            <button className="primary" onClick={speichern}>Termin und Aufträge anlegen</button>{' '}
            <button className="ghost" onClick={() => setNeu(false)}>Abbrechen</button>
          </p>
        </div>
      )}

      <h2>Alle Termine</h2>
      <table className="tbl">
        <thead><tr><th>Datum</th><th>Zeit</th><th>Kunde</th><th>Anlage</th><th>Aufträge</th><th>Status</th></tr></thead>
        <tbody>
          {termine.map(t => (
            <tr key={t.id}>
              <td>{fmtDatum(t.datum)}</td>
              <td>{t.beginn ?? '–'} – {t.ende ?? '–'}</td>
              <td>{kunde(t.kunde_id)?.name_kurz}</td>
              <td>{anlage(t.anlage_id)?.name}</td>
              <td>{auftraegeZumTermin(t.id).map(a => <span key={a.id}><Nr>{a.auftragsnummer}</Nr>{' '}</span>)}</td>
              <td><TerminBadge s={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
