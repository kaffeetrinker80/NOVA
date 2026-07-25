import { useState } from 'react'
import { db, demoModus } from '../lib/data'

export default function ImportSeite() {
  const [zeilen, setZeilen] = useState<any[]>([])
  const [dateiname, setDateiname] = useState('')
  const [meldung, setMeldung] = useState('')

  const lesen = async (file: File) => {
    setDateiname(file.name)
    try {
      const inhalt = JSON.parse(await file.text())
      setZeilen(Array.isArray(inhalt) ? inhalt : [inhalt])
      setMeldung('')
    } catch {
      setMeldung('Datei konnte nicht als JSON gelesen werden.')
      setZeilen([])
    }
  }

  const uebernehmen = async () => {
    const n = await db.importStaging(dateiname, 'legacy_json', zeilen)
    setMeldung(demoModus
      ? `${n} Datensätze gelesen. Im Demo-Modus werden sie nicht gespeichert – mit Supabase landen sie in der Staging-Tabelle zur Prüfung.`
      : `${n} Datensätze in die Staging-Tabelle übernommen. Sie können dort geprüft und schrittweise als Live-Daten übernommen werden.`)
  }

  const spalten = zeilen.length ? Object.keys(zeilen[0]).slice(0, 8) : []

  return (
    <>
      <h1>Import &amp; Migration</h1>
      <p className="sub">Bestehende JSON-Exporte (z.&nbsp;B. Terminverwaltung V4) werden zuerst in eine Staging-Tabelle geladen, dort geprüft und erst danach als Live-Daten übernommen. Original-Kennungen und Quellinformationen bleiben erhalten. Der Import ist schrittweise und rückgängig machbar.</p>

      <div className="panel">
        <label className="f">Legacy-JSON-Datei wählen
          <input type="file" accept=".json,application/json" onChange={e => e.target.files?.[0] && lesen(e.target.files[0])} />
        </label>
      </div>

      {meldung && <div className="demoflag">{meldung}</div>}

      {zeilen.length > 0 && (
        <>
          <p className="hint">{zeilen.length} Datensätze aus „{dateiname}“ – Vorschau der ersten 10 Zeilen:</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr>{spalten.map(s => <th key={s}>{s}</th>)}</tr></thead>
              <tbody>
                {zeilen.slice(0, 10).map((z, i) => (
                  <tr key={i}>{spalten.map(s => <td key={s}>{String(z[s] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p><button className="primary" onClick={uebernehmen}>In Staging-Tabelle übernehmen</button></p>
        </>
      )}

      <h2>Migrationsablauf</h2>
      <div className="panel">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>JSON-Export hochladen → Rohdaten landen unverändert in <code>staging_import</code>.</li>
          <li>Prüfung: Zuordnung Verwaltung → Kunde, Objekt → Anlage, WW-System → Untersuchungsbereich.</li>
          <li>Übernahme je Datensatz; <code>legacy_id</code> und <code>legacy_quelle</code> werden mitgeführt.</li>
          <li>Historische Untersuchungstermine werden als abgeschlossene Termine/Aufträge übernommen – nichts wird gelöscht oder überschrieben.</li>
          <li>Fehlerhafte Übernahmen lassen sich über die Staging-Referenz zurücknehmen.</li>
        </ol>
      </div>
    </>
  )
}
