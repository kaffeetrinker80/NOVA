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
import Aushang from './pages/Aushang'
import Auswertungen from './pages/Auswertungen'
import ImportSeite from './pages/ImportSeite'
import Administration from './pages/Administration'

const ROLLE_LABEL: Record<string, string> = {
  admin: 'Admin', disposition: 'Disposition', probenehmer: 'Probenehmer', lesend: 'Lesend',
}

// [Route, Beschriftung, Font-Awesome-Icon]
const NAV: [string, string, string][] = [
  ['dashboard', 'Dashboard', 'fa-gauge-high'],
  ['termine', 'Termine', 'fa-calendar-day'],
  ['auftragsbuch', 'Auftragsbuch', 'fa-book'],
  ['kunden', 'Kunden & Hausverwaltungen', 'fa-building-user'],
  ['anlagen', 'Anlagen', 'fa-building'],
  ['bereiche', 'Untersuchungsbereiche', 'fa-diagram-project'],
  ['aushang', 'Aushang', 'fa-print'],
  ['kalender', 'Kalenderexport', 'fa-calendar-plus'],
  ['auswertungen', 'Auswertungen', 'fa-chart-column'],
  ['import', 'Import & Migration', 'fa-file-import'],
  ['admin', 'Administration', 'fa-gear'],
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
    return <div className="login-wrap"><span className="hint">Wird geladen …</span></div>
  }
  if (!demoModus && !session) {
    return <Login />
  }
  if (!demoModus && !rolle) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <p>Anmeldung erfolgreich – dein Zugang wartet noch auf Freischaltung durch einen Admin.</p>
          <button onClick={() => supabase?.auth.signOut()}>Abmelden</button>
        </div>
      </div>
    )
  }

  const seite = {
    dashboard: <Dashboard />, termine: <Termine />, auftragsbuch: <Auftragsbuch />,
    kunden: <Kunden />, anlagen: <Anlagen />, bereiche: <Bereiche />,
    aushang: <Aushang />, kalender: <Kalenderexport />, auswertungen: <Auswertungen />,
    import: <ImportSeite />, admin: <Administration />,
  }[route] ?? <Dashboard />

  const stand = new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <>
      <header>
        <div className="header-inner">
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}nova_logo_web.png`} alt=""
             onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        <div className="header-text">
        <div className="product-header">
          <h1 className="dashboard-title">
            <span className="product-name">NOVAplan</span>
            <span className="dashboard-title-separator" aria-hidden="true">·</span>
            <span className="dashboard-description">Termin- &amp; Probenmanagement</span>
          </h1>
        </div>
        <div className="company-header">
          <div className="company-name">NOVA Praxis-Hygiene GmbH</div>
          <p className="company-subtitle">Experten für Trinkwasserhygiene</p>
          <p className="dashboard-meta">Stand: {stand}</p>
        </div>
        </div>
        </div>
        <div className="header-user">
          {demoModus ? 'Demo-Modus (ohne Supabase)' : (
            <>
              Angemeldet: {anzeigename} · {ROLLE_LABEL[rolle ?? ''] ?? rolle}
              {' · '}
              <a href="#" onClick={e => { e.preventDefault(); supabase?.auth.signOut() }}>Abmelden</a>
            </>
          )}
        </div>
      </header>

      <nav className="tabs">
        {NAV.map(([id, label, icon]) => (
          <button key={id} className={`tab ${route === id ? 'active' : ''}`}
            onClick={() => { location.hash = `#/${id}` }}>
            <i className={`fas ${icon}`} aria-hidden="true"></i>
            {label}
          </button>
        ))}
      </nav>

      <main>{seite}</main>
    </>
  )
}
