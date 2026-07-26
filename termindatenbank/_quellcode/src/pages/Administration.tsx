import { demoModus, supabase } from '../lib/data'
import { useEffect, useState } from 'react'

export default function Administration() {
  const [nutzer, setNutzer] = useState<{ anzeigename: string; rolle: string; aktiv: boolean }[]>([])
  useEffect(() => {
    if (supabase) supabase.from('td_profile').select('anzeigename, rolle, aktiv').then(({ data }) => setNutzer(data ?? []))
  }, [])

  return (
    <>
      <h1>Administration</h1>
      <p className="sub">Benutzer, Rollen und Sicherheit</p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Anmeldung &amp; Passwörter</h2>
        <p>Die Anmeldung läuft vollständig über <strong>Supabase Auth</strong>. Passwörter werden weder in der Anwendungsdatenbank noch im Frontend gespeichert. Neue Benutzer erhalten automatisch die Rolle „Lesend“ und werden von einem Admin hochgestuft.</p>
        {demoModus && <p className="hint">Im Demo-Modus ist keine Anmeldung aktiv. Nach Eintragen der Supabase-Zugangsdaten in <code>.env</code> greift die Authentifizierung inklusive Row Level Security.</p>}
      </div>

      <h2>Rollen</h2>
      <table className="tbl">
        <thead><tr><th>Rolle</th><th>Berechtigungen</th></tr></thead>
        <tbody>
          <tr><td><span className="badge active">Admin</span></td><td>Benutzer, Kunden, Anlagen, Daten und Einstellungen verwalten; Löschen von Datensätzen</td></tr>
          <tr><td><span className="badge high">Disposition</span></td><td>Kunden, Termine, Aufträge und Kalenderexporte anlegen und bearbeiten; Importe durchführen</td></tr>
          <tr><td><span className="badge medium">Probenehmer</span></td><td>Zugewiesene Termine einsehen; Ist-Probenzahlen, Proben und Status der eigenen Aufträge erfassen</td></tr>
          <tr><td><span className="badge neutral">Lesend</span></td><td>Freigegebene Daten nur einsehen</td></tr>
        </tbody>
      </table>

      {nutzer.length > 0 && (
        <>
          <h2>Benutzer</h2>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Rolle</th><th>Status</th></tr></thead>
            <tbody>
              {nutzer.map((n, i) => (
                <tr key={i}><td>{n.anzeigename}</td><td>{n.rolle}</td>
                  <td><span className={`badge ${n.aktiv ? 'closed' : 'neutral'}`}>{n.aktiv ? 'aktiv' : 'inaktiv'}</span></td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Nachvollziehbarkeit</h2>
      <div className="panel">
        <p style={{ margin: 0 }}>Alle wichtigen Datensätze führen <code>created_at/by</code> und <code>updated_at/by</code>. Kritische Änderungen (Auftragsnummer, Termindatum/-status, Ergebnisstatus) werden zusätzlich in der Änderungshistorie protokolliert. Vergebene Auftragsnummern werden zentral gezählt und nie wiederverwendet.</p>
      </div>
    </>
  )
}
