import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Kunde, Termin } from '../lib/types'
import { fmtDatum } from '../lib/types'
import { Abschnitt } from '../components/ui'
import {
  ACHTUNG_VARIANTEN, ART_VARIANTEN, PROBENEHMER,
  aushangDrucken, aushangHtml, type AushangDaten,
} from '../lib/aushang'

export default function Aushang() {
  const [termine, setTermine] = useState<Termin[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])

  const [terminId, setTerminId] = useState('')
  const [achtungId, setAchtungId] = useState('1')
  const [artId, setArtId] = useState('1')
  const [pnIndex, setPnIndex] = useState(0)
  const [von, setVon] = useState('09:00')
  const [bis, setBis] = useState('12:00')

  useEffect(() => {
    db.termine().then(setTermine); db.kunden().then(setKunden); db.anlagen().then(setAnlagen)
  }, [])

  const termin = termine.find(t => t.id === terminId)

  // Beim Terminwechsel Zeiten aus dem Termin übernehmen
  useEffect(() => {
    if (termin?.beginn) setVon(termin.beginn.slice(0, 5))
    if (termin?.ende) setBis(termin.ende.slice(0, 5))
  }, [terminId])

  const daten: AushangDaten | null = useMemo(() => {
    if (!termin) return null
    const kunde = kunden.find(k => k.id === termin.kunde_id)
    const anlage = anlagen.find(a => a.id === termin.anlage_id)
    return {
      achtungId, artId,
      verwaltung: kunde?.name_lang ?? '',
      objekt: anlage?.name ?? '',
      ort: anlage?.ort ?? '',
      datum: termin.datum,
      von, bis,
      probenehmer: PROBENEHMER[pnIndex],
      logoUrl: `${import.meta.env.BASE_URL}nova_logo.png`,
    }
  }, [termin, kunden, anlagen, achtungId, artId, pnIndex, von, bis])

  const kommend = termine
    .filter(t => t.status !== 'abgesagt')
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, 200)

  return (
    <>
      <h1>Aushang für Hausbewohner</h1>
      <p className="sub">
        Ankündigung der Probenahme zum Aushängen im Treppenhaus – Inhalt und Layout wie gewohnt.
      </p>

      <Abschnitt titel="Aushang zusammenstellen"
        aktionen={
          <button className="primary" disabled={!daten} onClick={() => daten && aushangDrucken(daten)}>
            <i className="fas fa-print" aria-hidden="true"></i> Aushang drucken
          </button>
        }>
        <div style={{ padding: '16px 20px' }}>
          <div className="grid2">
            <label className="f">Termin
              <select value={terminId} onChange={e => setTerminId(e.target.value)}>
                <option value="">– wählen –</option>
                {kommend.map(t => {
                  const k = kunden.find(x => x.id === t.kunde_id)
                  const a = anlagen.find(x => x.id === t.anlage_id)
                  return <option key={t.id} value={t.id}>
                    {fmtDatum(t.datum)} · {k?.name_kurz ?? '?'} · {a?.name ?? '?'}
                  </option>
                })}
              </select>
            </label>
            <label className="f">Betroffene Wohnungen
              <select value={achtungId} onChange={e => setAchtungId(e.target.value)}>
                {ACHTUNG_VARIANTEN.map(a => <option key={a.id} value={a.id}>{a.kurz}</option>)}
              </select>
            </label>
            <label className="f">Art der Untersuchung
              <select value={artId} onChange={e => setArtId(e.target.value)}>
                {ART_VARIANTEN.map(a => <option key={a.id} value={a.id}>{a.kurz}</option>)}
              </select>
            </label>
            <label className="f">Ansprechpartner
              <select value={pnIndex} onChange={e => setPnIndex(+e.target.value)}>
                {PROBENEHMER.map((p, i) => <option key={p.name} value={i}>{p.name} · {p.tel}</option>)}
              </select>
            </label>
            <label className="f">Von
              <input type="time" value={von} onChange={e => setVon(e.target.value)} />
            </label>
            <label className="f">Bis
              <input type="time" value={bis} onChange={e => setBis(e.target.value)} />
            </label>
          </div>
        </div>
      </Abschnitt>

      {daten && (
        <Abschnitt titel="Vorschau">
          <div style={{ padding: 20, background: '#fff', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 520, border: '1px solid var(--border)', padding: 18, borderRadius: 8 }}
              dangerouslySetInnerHTML={{ __html: aushangHtml(daten, true) }} />
          </div>
        </Abschnitt>
      )}
      {!daten && <p className="hint">Bitte zuerst einen Termin wählen.</p>}
    </>
  )
}
