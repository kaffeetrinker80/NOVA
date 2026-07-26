import { useEffect, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Auftrag, Kunde, Termin } from '../lib/types'
import { fmtDatum, nummerVoll, ART_LABEL } from '../lib/types'
import { Abschnitt, Nr, StatusBadge, TerminBadge, ErgebnisBadge } from '../components/ui'

/** Ampel-Klasse wie im bestehenden Dashboard: überfällig rot, bald gelb, sonst grün. */
function ampel(datum?: string): string {
  if (!datum) return ''
  const heute = new Date().toISOString().slice(0, 10)
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
  if (datum < heute) return 'amp-red'
  if (datum <= in30) return 'amp-yellow'
  return 'amp-green'
}

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
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

  const kommend = termine.filter(t => t.datum >= heute && t.status !== 'abgesagt')
  const unter = auftraege.flatMap(a => a.unterauftraege.map(u => ({ a, u })))
  const offen = unter.filter(x => x.u.status !== 'abgeschlossen' && x.u.status !== 'storniert')
  const nachverfolgung = unter.filter(x => x.u.ergebnis === 'nachuntersuchung_erforderlich' || x.u.ergebnis === 'ueberschritten')
  const fertig = unter.filter(x => x.u.status === 'abgeschlossen')
  const baldFaellig = anlagen.filter(a => a.naechste_untersuchung && a.naechste_untersuchung <= in30)

  const kunde = (id: string) => kunden.find(k => k.id === id)
  const anlage = (id: string) => anlagen.find(a => a.id === id)

  return (
    <>
      <div className="cards">
        <div className="card"><div className="label">Anstehende Termine</div><div className="value">{kommend.length}</div></div>
        <div className="card"><div className="label">Offene Aufträge</div><div className="value">{offen.length}</div></div>
        <div className="card"><div className="label">In 30 Tagen fällig</div><div className="value">{baldFaellig.length}</div></div>
        <div className="card"><div className="label">Abgeschlossen</div><div className="value">{fertig.length}</div></div>
        <div className="card"><div className="label">Nachverfolgung</div><div className="value">{nachverfolgung.length}</div></div>
      </div>

      <Abschnitt
        titel={`Anstehende Termine (${kommend.length})`}
        legende={<>
          <span className="legend-chip legend-red">überfällig</span>
          <span className="legend-chip legend-yellow">innerhalb 30 Tagen</span>
          <span className="legend-chip legend-green">später</span>
        </>}>
        <div className="table-container">
          <table>
            <thead><tr><th>Datum</th><th>Zeit</th><th>Kunde</th><th>Anlage</th><th>Ort</th><th>Status</th></tr></thead>
            <tbody>
              {kommend.slice(0, 12).map(t => (
                <tr key={t.id} className={ampel(t.datum)}>
                  <td>{fmtDatum(t.datum)}</td>
                  <td>{t.beginn ?? '–'} – {t.ende ?? '–'}</td>
                  <td>{kunde(t.kunde_id)?.name_kurz ?? '–'}</td>
                  <td>{anlage(t.anlage_id)?.name ?? '–'}</td>
                  <td>{anlage(t.anlage_id)?.ort ?? '–'}</td>
                  <td><TerminBadge s={t.status} /></td>
                </tr>
              ))}
              {kommend.length === 0 && <tr><td colSpan={6} className="hint">Keine anstehenden Termine. Neue Termine im Reiter „Termine" anlegen.</td></tr>}
            </tbody>
          </table>
        </div>
      </Abschnitt>

      <Abschnitt titel={`Offene Aufträge (${offen.length})`}>
        <div className="table-container">
          <table>
            <thead><tr><th>Auftrags-Nr.</th><th>Untersuchungsart</th><th>Umfang</th><th>Proben geplant</th><th>Status</th><th>Ergebnis</th></tr></thead>
            <tbody>
              {offen.slice(0, 12).map(({ a, u }) => (
                <tr key={u.id}>
                  <td><Nr>{nummerVoll(a, u)}</Nr></td>
                  <td>{ART_LABEL[u.art]}</td>
                  <td>{u.umfang ?? '–'}</td>
                  <td>{u.proben_geplant ?? '–'}</td>
                  <td><StatusBadge s={u.status} /></td>
                  <td><ErgebnisBadge s={u.ergebnis} /></td>
                </tr>
              ))}
              {offen.length === 0 && <tr><td colSpan={6} className="hint">Keine offenen Aufträge.</td></tr>}
            </tbody>
          </table>
        </div>
      </Abschnitt>

      {nachverfolgung.length > 0 && (
        <Abschnitt titel={`Nachverfolgung erforderlich (${nachverfolgung.length})`}>
          <div className="table-container">
            <table>
              <thead><tr><th>Auftrags-Nr.</th><th>Untersuchungsart</th><th>Ergebnis</th></tr></thead>
              <tbody>
                {nachverfolgung.map(({ a, u }) => (
                  <tr key={u.id} className="amp-red">
                    <td><Nr>{nummerVoll(a, u)}</Nr></td>
                    <td>{ART_LABEL[u.art]}</td>
                    <td><ErgebnisBadge s={u.ergebnis} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Abschnitt>
      )}
    </>
  )
}
