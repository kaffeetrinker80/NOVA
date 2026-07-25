import { useEffect, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Auftrag, Kunde, Termin } from '../lib/types'
import { fmtDatum, nummerVoll, ART_LABEL } from '../lib/types'
import { Nr, StatusBadge, TerminBadge, ErgebnisBadge } from '../components/ui'

export default function Dashboard() {
  const [termine, setTermine] = useState<Termin[]>([])
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])

  useEffect(() => {
    db.termine().then(setTermine)
    db.auftraege().then(setAuftraege)
    db.kunden().then(setKunden)
    db.anlagen().then(setAnlagen)
  }, [])

  const heute = new Date().toISOString().slice(0, 10)
  const kommend = termine.filter(t => t.datum >= heute && !['abgesagt'].includes(t.status)).slice(0, 6)
  const unter = auftraege.flatMap(a => a.unterauftraege.map(u => ({ a, u })))
  const offen = unter.filter(x => x.u.status !== 'abgeschlossen' && x.u.status !== 'storniert')
  const nachverfolgung = unter.filter(x => x.u.ergebnis === 'nachuntersuchung_erforderlich' || x.u.ergebnis === 'ueberschritten')
  const fertig = unter.filter(x => x.u.status === 'abgeschlossen')
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
  const baldFaellig = anlagen.filter(a => a.naechste_untersuchung && a.naechste_untersuchung <= in30)

  const kunde = (id: string) => kunden.find(k => k.id === id)
  const anlage = (id: string) => anlagen.find(a => a.id === id)

  return (
    <>
      <h1>Dashboard</h1>
      <p className="sub">Überblick über Termine, Aufträge und fällige Untersuchungen</p>
      <div className="cards">
        <div className="card"><div className="num">{kommend.length}</div><div className="lbl">anstehende Termine</div></div>
        <div className="card"><div className="num">{offen.length}</div><div className="lbl">offene Aufträge</div></div>
        <div className="card"><div className="num">{baldFaellig.length}</div><div className="lbl">in 30 Tagen fällig</div></div>
        <div className="card"><div className="num">{fertig.length}</div><div className="lbl">kürzlich abgeschlossen</div></div>
        <div className="card"><div className="num">{nachverfolgung.length}</div><div className="lbl">Nachverfolgung nötig</div></div>
      </div>

      <h2>Anstehende Termine</h2>
      <table className="tbl">
        <thead><tr><th>Datum</th><th>Zeit</th><th>Kunde</th><th>Anlage</th><th>Status</th></tr></thead>
        <tbody>
          {kommend.map(t => (
            <tr key={t.id}>
              <td>{fmtDatum(t.datum)}</td>
              <td>{t.beginn ?? '–'} – {t.ende ?? '–'}</td>
              <td>{kunde(t.kunde_id)?.name_kurz ?? '–'}</td>
              <td>{anlage(t.anlage_id)?.name ?? '–'}</td>
              <td><TerminBadge s={t.status} /></td>
            </tr>
          ))}
          {kommend.length === 0 && <tr><td colSpan={5} className="hint">Keine anstehenden Termine. Neue Termine unter „Termine“ anlegen.</td></tr>}
        </tbody>
      </table>

      <h2>Offene Aufträge</h2>
      <table className="tbl">
        <thead><tr><th>Nr.</th><th>Art</th><th>Status</th><th>Ergebnis</th></tr></thead>
        <tbody>
          {offen.slice(0, 8).map(({ a, u }) => (
            <tr key={u.id}>
              <td><Nr>{nummerVoll(a, u)}</Nr></td>
              <td>{ART_LABEL[u.art]}{u.umfang ? ` (${u.umfang})` : ''}</td>
              <td><StatusBadge s={u.status} /></td>
              <td><ErgebnisBadge s={u.ergebnis} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
