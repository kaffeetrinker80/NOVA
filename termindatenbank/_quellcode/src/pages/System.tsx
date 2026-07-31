import { useEffect, useState } from 'react'
import { db, demoModus, supabase } from '../lib/data'
import { vorschauErzeugen, type ImportVorschau, type LegacyDatensatz } from '../lib/legacyImport'
import { Abschnitt, Meldung } from '../components/ui'
import { useAuth } from '../lib/auth'
import { fmtDatum, nummerVoll, ART_LABEL } from '../lib/types'

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

  const nutzerEindeutig = Array.from(nutzer.reduce((map, eintrag) => {
    const key = eintrag.anzeigename.trim().toLocaleLowerCase('de-DE')
    const vorhanden = map.get(key)
    if (!vorhanden || (!vorhanden.aktiv && eintrag.aktiv)) map.set(key, eintrag)
    return map
  }, new Map<string, (typeof nutzer)[number]>()).values())

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

  const historieNachtragen = async () => {
    if (!vorschau) return
    setLaeuft(true); setMeldung('Historie-Nachtrag läuft …')
    try { setMeldung(await db.legacyHistorieNachtragen(vorschau, setMeldung)) }
    catch (e: any) { setMeldung('Fehler beim Historie-Nachtrag: ' + e.message) }
    setLaeuft(false)
  }

  const herunterladen = (inhalt: string, name: string, typ: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + inhalt], { type: typ }))
    a.download = name; a.click(); URL.revokeObjectURL(a.href)
  }
  const csvZeile = (felder: (string | number | null | undefined)[]) =>
    felder.map(f => '"' + String(f ?? '').replace(/"/g, '""') + '"').join(';')

  const exportJson = async () => {
    setMeldung('Gesamtsicherung wird erstellt …')
    const [kunden, anlagen, bereiche, termine, auftraege] = await Promise.all([
      db.kunden(), db.anlagen(), db.bereiche(), db.termine(), db.auftraege()])
    const stand = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    herunterladen(JSON.stringify({ exportiert_am: new Date().toISOString(),
      kunden, anlagen, bereiche, termine, auftraege }, null, 1),
      `NOVAplan_Gesamtsicherung_${stand}.json`, 'application/json')
    setMeldung(`Gesamtsicherung erstellt: ${kunden.length} Kunden, ${anlagen.length} Anlagen, ${termine.length} Termine, ${auftraege.length} Aufträge.`)
  }

  const exportCsv = async (was: 'anlagen' | 'termine' | 'auftragsbuch') => {
    setMeldung('CSV wird erstellt …')
    const [kunden, anlagen, bereiche, termine, auftraege] = await Promise.all([
      db.kunden(), db.anlagen(), db.bereiche(), db.termine(), db.auftraege()])
    const kName = (id: string) => kunden.find(k => k.id === id)?.name_kurz ?? ''
    const stand = new Date().toISOString().slice(0, 10)
    let zeilen: string[] = []
    if (was === 'anlagen') {
      zeilen = [csvZeile(['Verwaltung', 'Objekt', 'PLZ', 'Ort', 'Turnus (Monate)', 'Nächste Untersuchung', 'Planungsvermerk', 'Notizen', 'Aktiv'])]
      for (const a of anlagen) zeilen.push(csvZeile([kName(a.kunde_id), a.name, a.plz, a.ort, a.turnus_monate, fmtDatum(a.naechste_untersuchung), a.planungsnotiz, a.notizen, a.aktiv ? 'ja' : 'nein']))
    } else if (was === 'termine') {
      zeilen = [csvZeile(['Datum', 'Verwaltung', 'Objekt', 'Status'])]
      const aName = new Map(anlagen.map(a => [a.id, a.name]))
      for (const t of termine) zeilen.push(csvZeile([fmtDatum(t.datum), kName(t.kunde_id), aName.get(t.anlage_id), t.status]))
    } else {
      zeilen = [csvZeile(['Nummer', 'Verwaltung', 'Objekt', 'Bereich', 'Art', 'Umfang', 'Proben Soll', 'Proben Ist', 'Status', 'Ergebnis'])]
      const bMap = new Map(bereiche.map(b => [b.id, b])); const aMap = new Map(anlagen.map(a => [a.id, a]))
      for (const a of auftraege) for (const u of a.unterauftraege) {
        const b = bMap.get(a.bereich_id); const anl = b ? aMap.get(b.anlage_id) : undefined
        zeilen.push(csvZeile([nummerVoll(a, u), anl ? kName(anl.kunde_id) : '', anl?.name, b?.name, ART_LABEL[u.art], u.umfang, u.proben_geplant, u.proben_ist, u.status, u.ergebnis]))
      }
    }
    herunterladen(zeilen.join('\r\n'), `NOVAplan_${was}_${stand}.csv`, 'text/csv;charset=utf-8')
    setMeldung(`CSV exportiert: ${zeilen.length - 1} Zeilen.`)
  }

  const zuruecksetzen = async () => {
    if (resetText !== 'RESET') return
    setLaeuft(true)
    try { setMeldung(await db.resetAlleDaten(true)); setVorschau(null); setResetText('') }
    catch (e: any) { setMeldung('Fehler beim Zurücksetzen: ' + e.message) }
    setLaeuft(false)
  }

  return (
    <>
      <Meldung text={meldung} onWeg={() => setMeldung('')} />

      <Abschnitt titel="Import: Terminverwaltung V4 (JSON)"
        aktionen={vorschau ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={historieNachtragen}
              disabled={laeuft || demoModus || rolle === 'lesend' || rolle === 'probenehmer'}
              title="Schreibt nur fehlende Termine aus der JSON nach. Kunden, Anlagen und Bereiche bleiben unverändert.">
              <i className="fas fa-clock-rotate-left" aria-hidden="true"></i>
              Nur Historie nachtragen
            </button>
            <button className="primary" onClick={uebernehmen}
              disabled={laeuft || demoModus || rolle === 'lesend' || rolle === 'probenehmer'}>
              <i className="fas fa-database" aria-hidden="true"></i>
              {laeuft ? 'Übernahme läuft …' : 'Vollimport übernehmen'}
            </button>
          </div>
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
              <div className="card"><div className="label">Bereiche / WWB</div><div className="value">{vorschau.bereiche.length}</div></div>
              <div className="card"><div className="label">Termine (inkl. geplant)</div><div className="value">{vorschau.termine.length}</div></div>
              <div className="card"><div className="label">Übersprungen</div><div className="value">{vorschau.uebersprungen}</div></div>
            </div>
          )}
          <p className="hint" style={{ marginBottom: 0 }}>
            Verwaltung → Kunde, Objekt → Anlage (+ Standard-Bereich), Historie/„Geplant" → Termine.
            „Nur Historie nachtragen" ist für Teststände mit schon bearbeiteten Stammdaten gedacht.
            Der Vollimport sollte nach einem Reset oder vor manuellen Merges verwendet werden.
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
              {nutzerEindeutig.map((n, i) => (
                <tr key={i}>
                  <td>{n.anzeigename}</td>
                  <td>{{ admin: 'Admin', disposition: 'Disposition', probenehmer: 'Probenehmer', lesend: 'Lesend' }[n.rolle] ?? n.rolle}</td>
                  <td><span className={`badge ${n.aktiv ? 'closed' : 'neutral'}`}>{n.aktiv ? 'aktiv' : 'inaktiv'}</span></td>
                </tr>
              ))}
              {nutzerEindeutig.length === 0 && <tr><td colSpan={3} className="hint">Nur mit Supabase-Verbindung sichtbar.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ padding: '10px 20px' }}>
          Anmeldung ausschließlich über Supabase Auth (E-Mail + Passwort). Rollen ändern:
          Tabelle <code>td_profile</code>, Feld <code>rolle</code>. Alle wichtigen Änderungen werden
          mit Zeitstempel und Nutzer protokolliert.
        </p>
      </Abschnitt>

      <Abschnitt titel="Wartung">
        <div style={{ padding: '16px 20px' }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Ordnet Termine, die durch früheres Zusammenführen keinem Bereich zugewiesen wurden,
            nachträglich dem Bereich zu (bei Anlagen mit genau einem Bereich). Behebt fehlende
            Historie in zusammengeführten Bereichen.
          </p>
          <button onClick={async () => { try { setMeldung(await db.historieNachzuordnen()) } catch (e: any) { setMeldung('Fehler: ' + e.message) } }}>
            <i className="fas fa-wand-magic-sparkles" aria-hidden="true"></i> Historie-Zuordnung reparieren
          </button>
        </div>
      </Abschnitt>

      <Abschnitt titel="Datensicherung & Export">
        <div style={{ padding: '16px 20px' }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Kompletter Datenstand zum Herunterladen – als Gesamtsicherung (JSON, alles inklusive
            Verknüpfungen) oder als CSV-Tabellen für Excel. Regelmäßig sichern = maximale Absicherung.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="primary" onClick={exportJson}>
              <i className="fas fa-file-shield" aria-hidden="true"></i> Gesamtsicherung (JSON)
            </button>
            <button onClick={() => exportCsv('anlagen')}><i className="fas fa-file-csv" aria-hidden="true"></i> Anlagen (CSV)</button>
            <button onClick={() => exportCsv('termine')}><i className="fas fa-file-csv" aria-hidden="true"></i> Termine (CSV)</button>
            <button onClick={() => exportCsv('auftragsbuch')}><i className="fas fa-file-csv" aria-hidden="true"></i> Auftragsbuch (CSV)</button>
          </div>
        </div>
      </Abschnitt>

      <Abschnitt titel="Testphase: Daten zurücksetzen">
        <div style={{ padding: '16px 20px' }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Löscht <strong>alle</strong> Kunden, Anlagen, Bereiche, Termine, Aufträge, Unteraufträge,
            Berichte und Überschreitungsphasen für einen frischen Testlauf. Auch das Auftragsbuch
            einschließlich Nummernzähler wird geleert; die nächste Nummer des Jahres beginnt wieder
            bei <code>0001</code>. Benutzerkonten und Rollen bleiben erhalten. Nur für Admins.
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
