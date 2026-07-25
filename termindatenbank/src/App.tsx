import { useEffect, useState } from 'react'
import { demoModus, supabase } from './lib/data'
import { useAuth } from './lib/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Termine from './pages/Termine'
import Auftragsbuch from './pages/Auftragsbuch'
import Kunden from './pages/Kunden'
import Anlagen from './pages/Anlagen'
import Bereiche from './pages/Bereiche'
import Kalenderexport from './pages/Kalenderexport'
import Auswertungen from './pages/Auswertungen'
import ImportSeite from './pages/ImportSeite'
import Administration from './pages/Administration'

const ROLLE_LABEL: Record<string, string> = { admin: 'Admin', disposition: 'Disposition', probenehmer: 'Probenehmer', lesend: 'Lesend' }

const NAV: [string, string][] = [
  ['dashboard', 'Dashboard'],
  ['termine', 'Termine'],
  ['auftragsbuch', 'Auftragsbuch'],
  ['kunden', 'Kunden & Hausverwaltungen'],
  ['anlagen', 'Anlagen'],
  ['bereiche', 'Untersuchungsbereiche / WWB'],
  ['kalender', 'Kalenderexport'],
  ['auswertungen', 'Auswertungen'],
  ['import', 'Import & Migration'],
  ['admin', 'Administration'],
]

export default function App() {
  const [route, setRoute] = useState(location.hash.replace('#/', '') || 'dashboard')
  useEffect(() => {
    const fn = () => setRoute(location.hash.replace('#/', '') || 'dashboard')
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])

  const { session, rolle, anzeigename, ladend } = useAuth()

  if (!demoModus && ladend) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)' }}>Wird geladen …</div>
  }
  if (!demoModus && !session) {
    return <Login />
  }
  if (!demoModus && !rolle) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="panel" style={{ width: 380, textAlign: 'center' }}>
          <p>Anmeldung erfolgreich – dein Zugang wartet noch auf Freischaltung durch einen Admin.</p>
          <button className="ghost" onClick={() => supabase?.auth.signOut()}>Abmelden</button>
        </div>
      </div>
    )
  }

  const seite = {
    dashboard: <Dashboard />, termine: <Termine />, auftragsbuch: <Auftragsbuch />,
    kunden: <Kunden />, anlagen: <Anlagen />, bereiche: <Bereiche />,
    kalender: <Kalenderexport />, auswertungen: <Auswertungen />,
    import: <ImportSeite />, admin: <Administration />,
  }[route] ?? <Dashboard />

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}nova_logo.png`} alt="" />
          <div>
            <strong>NOVA Wasser</strong>
            <span>Untersuchungsverwaltung</span>
          </div>
        </div>
        <nav>
          {NAV.map(([id, label]) => (
            <a key={id} href={`#/${id}`} className={route === id ? 'active' : ''}>{label}</a>
          ))}
        </nav>
        <div className="foot">
          {demoModus ? 'Demo-Modus (ohne Supabase)' : (
            <>
              {anzeigename} · {ROLLE_LABEL[rolle ?? ''] ?? rolle}
              <br /><a href="#" onClick={e => { e.preventDefault(); supabase?.auth.signOut() }} style={{ color: '#8fb0b8' }}>Abmelden</a>
            </>
          )}
        </div>
      </aside>
      <main className="main">
        {demoModus && (
          <div className="demoflag">
            Demo-Modus: Es sind keine Supabase-Zugangsdaten hinterlegt (.env). Änderungen werden nicht gespeichert.
          </div>
        )}
        {seite}
      </main>
    </div>
  )
}
