import { useEffect, useState } from 'react'
import { demoModus } from './lib/data'
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
          <img src="/nova_logo.png" alt="" />
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
        <div className="foot">{demoModus ? 'Demo-Modus (ohne Supabase)' : 'Verbunden mit Supabase'}</div>
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
