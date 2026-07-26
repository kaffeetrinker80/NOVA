import { useState } from 'react'
import { db, demoModus } from '../lib/data'
import { vorschauErzeugen, type ImportVorschau, type LegacyDatensatz } from '../lib/legacyImport'
import { Abschnitt } from '../components/ui'
import { useAuth } from '../lib/auth'
import { fmtDatum } from '../lib/types'

export default function ImportSeite() {
  const { rolle } = useAuth()
  const [dateiname, setDateiname] = useState('')
  const [vorschau, setVorschau] = useState<ImportVorschau | null>(null)
  const [meldung, setMeldung] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [resetText, setResetText] = useState('')

  const lesen = async (file: File) => {
    setDateiname(file.name); setMeldung(''); setVorschau(null)
    try {
      let roh = await file.text()
      // Abgeschnittene Exporte (z. B. Kurzfassungen) tolerieren
      roh = roh.trim().replace(/,\s*\]?\s*$/, ']')
      if (!roh.endsWith(']') && roh.startsWith('[')) roh += ']'
      const inhalt = JSON.parse(roh)
      const liste: LegacyDatensatz[] = Array.isArray(inhalt) ? inhalt : [inhalt]
      setVorschau(vorschauErzeugen(liste))
    } catch (e: any) {
      setMeldung('Datei konnte nicht gelesen werden: ' + e.message)
    }
  }

  const uebernehmen = async () => {
    if (!vorschau) return
    setLaeuft(true); setMeldung('Übernahme läuft …')
    try {
      const ergebnis = await db.legacyUebernehmen(vorschau, setMeldung)
      setMeldung(ergebnis)
    } catch (e: any) {
      setMeldung('Fehler bei der Übernahme: ' + e.message)
    }
    setLaeuft(false)
  }

  const zuruecksetzen = async () => {
    if (resetText !== 'RESET') return
    setLaeuft(true)
    try {
      setMeldung(await db.resetAlleDaten(false))
      setVorschau(null); setResetText('')
    } catch (e: any) {
      setMeldung('Fehler beim Zurücksetzen: ' + e.message)
    }
    setLaeuft(false)
  }

  return (
    <>
      <h1>Import &amp; Migration</h1>
      <p className="sub">
        JSON-Export der Terminverwaltung V4 einlesen, Vorschau prüfen und übernehmen.
        Alt-Kennungen bleiben erhalten, ein erneuter Import überschreibt statt zu duplizieren.
      </p>

      {meldung && <div className="notice">{meldung}</div>}

      <Abschnitt titel="1. Datei einlesen">
        <div style={{ padding: '16px 20px' }}>
          <label className="f" style={{ maxWidth: 460 }}>
            JSON-Datei (z. B. Terminverwaltung_V4.json)
            <input type="file" accept=".json,application/json"
              onChange={e => e.target.files?.[0] && lesen(e.target.files[0])} />
          </label>
        </div>
      </Abschnitt>

      {vorschau && (
        <>
          <div className="cards">
            <div className="card"><div className="label">Kunden / Verwaltungen</div><div className="value">{vorschau.kunden.length}</div></div>
            <div className="card"><div className="label">Anlagen</div><div className="value">{vorschau.anlagen.length}</div></div>
            <div className="card"><div className="label">Historische Termine</div><div className="value">{vorschau.termine.length}</div></div>
            <div className="card"><div className="label">Übersprungen</div><div className="value">{vorschau.uebersprungen}</div></div>
          </div>

          <Abschnitt titel="2. Vorschau – Anlagen (erste 15)"
            aktionen={
              <button className="primary" onClick={uebernehmen}
                disabled={laeuft || demoModus || rolle === 'lesend' || rolle === 'probenehmer'}>
                <i className="fas fa-database" aria-hidden="true"></i>
                {laeuft ? 'Übernahme läuft …' : 'In die Datenbank übernehmen'}
              </button>
            }>
            <div className="table-container">
              <table>
                <thead><tr><th>Objekt</th><th>Verwaltung</th><th>PLZ</th><th>Ort</th><th>Turnus</th><th>Nächste Unters.</th></tr></thead>
                <tbody>
                  {vorschau.anlagen.slice(0, 15).map(a => (
                    <tr key={a.legacy_id}>
                      <td>{a.name}</td>
                      <td>{vorschau.kunden.find(k => k.legacy_id === a.kunde_legacy)?.name_lang ?? '–'}</td>
                      <td>{a.plz ?? '–'}</td>
                      <td>{a.ort ?? '–'}</td>
                      <td>{a.turnus_monate ? `${a.turnus_monate} Monate` : '–'}</td>
                      <td>{a.naechste_untersuchung ? fmtDatum(a.naechste_untersuchung) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Abschnitt>
        </>
      )}

      <Abschnitt titel="Testphase: Daten zurücksetzen">
        <div style={{ padding: '16px 20px' }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Löscht <strong>alle</strong> Kunden, Anlagen, Bereiche, Termine und Aufträge – für wiederholte
            Testläufe. Der Auftragsnummern-Zähler bleibt bewusst stehen, damit vergebene Nummern nie
            erneut vergeben werden. Nur für Admins.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="f">
              Zur Bestätigung „RESET“ eingeben
              <input value={resetText} onChange={e => setResetText(e.target.value)}
                placeholder="RESET" style={{ width: 160 }} disabled={rolle !== 'admin'} />
            </label>
            <button className="secondary" onClick={zuruecksetzen}
              disabled={laeuft || resetText !== 'RESET' || rolle !== 'admin' || demoModus}>
              <i className="fas fa-trash-can" aria-hidden="true"></i> Alle Daten zurücksetzen
            </button>
          </div>
          {rolle !== 'admin' && <p className="hint">Nur Admins können zurücksetzen.</p>}
        </div>
      </Abschnitt>
    </>
  )
}
