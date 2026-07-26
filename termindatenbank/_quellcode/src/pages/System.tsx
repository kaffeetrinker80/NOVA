import { useEffect, useState } from 'react'
import { db, demoModus, supabase } from '../lib/data'
import { vorschauErzeugen, type ImportVorschau, type LegacyDatensatz } from '../lib/legacyImport'
import { Abschnitt } from '../components/ui'
import { useAuth } from '../lib/auth'
import { fmtDatum } from '../lib/types'

export default function System() {
  const { rolle } = useAuth()
  const [dateiname, setDateiname] = useState('')
  const [vorschau, setVorschau] = useState<ImportVorschau | null>(null)
  const [meldung, setMeldung] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [resetText, setResetText] = useState('')
  const [nutzer, setNutzer] = useState<{ anzeigename: string; rolle: string; aktiv: boolean }[]>([])

  useEffect(() => {
    if (supabase) supabase.from('td_profile').select('anzeigename, rolle, aktiv')
      .then(({ data }) => setNutzer((data as any[]) ?? []))
  }, [])

  const lesen = async (file: File) => {
    setDateiname(file.name); setMeldung(''); setVorschau(null)
    try {
      let roh = (await file.text()).trim().replace(/,\s*\]?\s*$/, ']')
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
    try { setMeldung(await db.legacyUebernehmen(vorschau, setMeldung)) }
    catch (e: any) { setMeldung('Fehler bei der Übernahme: ' + e.message) }
    setLaeuft(false)
  }

  const zuruecksetzen = async () => {
    if (resetText !== 'RESET') return
    setLaeuft(true)
    try { setMeldung(await db.resetAlleDaten(false)); setVorschau(null); setResetText('') }
    catch (e: any) { setMeldung('Fehler beim Zurücksetzen: ' + e.message) }
    setLaeuft(false)
  }

  return (
    <>
      {meldung && <div className="notice">{meldung}</div>}

      <Abschnitt titel="Import: Terminverwaltung V4 (JSON)"
        aktionen={vorschau ? (
          <button className="primary" onClick={uebernehmen}
            disabled={laeuft || demoModus || rolle === 'lesend' || rolle === 'probenehmer'}>
            <i className="fas fa-database" aria-hidden="true"></i>
            {laeuft ? 'Übernahme läuft …' : 'In die Datenbank übernehmen'}
          </button>
        ) : undefined}>
        <div style={{ padding: '16px 20px' }}>
          <label className="f" style={{ maxWidth: 460 }}>
            JSON-Datei wählen
            <input type="file" accept=".json,application/json"
              onChange={e => e.target.files?.[0] && lesen(e.target.files[0])} />
          </label>
          {vorschau && (
            <div className="cards" style={{ marginTop: 14 }}>
              <div className="card"><div className="label">Verwaltungen</div><div className="value">{vorschau.kunden.length}</div></div>
              <div className="card"><div className="label">Anlagen</div><div className="value">{vorschau.anlagen.length}</div></div>
              <div className="card"><div className="label">Termine (inkl. geplant)</div><div className="value">{vorschau.termine.length}</div></div>
              <div className="card"><div className="label">Übersprungen</div><div className="value">{vorschau.uebersprungen}</div></div>
            </div>
          )}
          <p className="hint" style={{ marginBottom: 0 }}>
            Verwaltung → Kunde, Objekt → Anlage (+ Standard-Bereich), Historie/„Geplant" → Termine.
            Erneuter Import überschreibt statt zu duplizieren; Alt-Kennungen bleiben erhalten.
          </p>
        </div>
        {vorschau && (
          <div className="table-container">
            <table>
              <thead><tr><th>Objekt</th><th>Verwaltung</th><th>Ort</th><th>Turnus</th><th>Nächste Unters.</th></tr></thead>
              <tbody>
                {vorschau.anlagen.slice(0, 10).map(a => (
                  <tr key={a.legacy_id}>
                    <td>{a.name}</td>
                    <td>{vorschau.kunden.find(k => k.legacy_id === a.kunde_legacy)?.name_lang ?? '–'}</td>
                    <td>{a.ort ?? '–'}</td>
                    <td>{a.turnus_monate ? `${a.turnus_monate} Mon.` : '–'}</td>
                    <td>{a.naechste_untersuchung ? fmtDatum(a.naechste_untersuchung) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Abschnitt>

      <Abschnitt titel="Benutzer & Rollen">
        <div className="table-container">
          <table>
            <thead><tr><th>Name</th><th>Rolle</th><th>Status</th></tr></thead>
            <tbody>
              {nutzer.map((n, i) => (
                <tr key={i}>
                  <td>{n.anzeigename}</td>
                  <td>{{ admin: 'Admin', disposition: 'Disposition', probenehmer: 'Probenehmer', lesend: 'Lesend' }[n.rolle] ?? n.rolle}</td>
                  <td><span className={`badge ${n.aktiv ? 'closed' : 'neutral'}`}>{n.aktiv ? 'aktiv' : 'inaktiv'}</span></td>
                </tr>
              ))}
              {nutzer.length === 0 && <tr><td colSpan={3} className="hint">Nur mit Supabase-Verbindung sichtbar.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ padding: '10px 20px' }}>
          Anmeldung ausschließlich über Supabase Auth (E-Mail + Passwort). Rollen ändern:
          Tabelle <code>td_profile</code>, Feld <code>rolle</code>. Alle wichtigen Änderungen werden
          mit Zeitstempel und Nutzer protokolliert.
        </p>
      </Abschnitt>

      <Abschnitt titel="Testphase: Daten zurücksetzen">
        <div style={{ padding: '16px 20px' }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Löscht <strong>alle</strong> Kunden, Anlagen, Bereiche, Termine und Aufträge für einen
            frischen Testlauf. Der Auftragsnummern-Zähler bleibt stehen – vergebene Nummern werden
            nie erneut vergeben. Nur für Admins.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="f">Zur Bestätigung „RESET" eingeben
              <input value={resetText} onChange={e => setResetText(e.target.value)}
                placeholder="RESET" style={{ width: 160 }} disabled={rolle !== 'admin'} />
            </label>
            <button className="secondary" onClick={zuruecksetzen}
              disabled={laeuft || resetText !== 'RESET' || rolle !== 'admin' || demoModus}>
              <i className="fas fa-trash-can" aria-hidden="true"></i> Alle Daten zurücksetzen
            </button>
          </div>
        </div>
      </Abschnitt>
    </>
  )
}
