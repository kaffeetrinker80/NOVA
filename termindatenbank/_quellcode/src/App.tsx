import { useEffect, useState } from 'react'
import { demoModus, supabase } from './lib/data'
import { useAuth } from './lib/auth'
import Login from './pages/Login'
import Planung from './pages/Planung'
import Auftragsbuch from './pages/Auftragsbuch'
import Pruefberichte from './pages/Pruefberichte'
import Stammdaten from './pages/Stammdaten'
import Auswertungen from './pages/Auswertungen'
import System from './pages/System'
import OnlineNutzer from './components/OnlineNutzer'

const ROLLE_LABEL: Record<string, string> = {
  admin: 'Admin', disposition: 'Disposition', probenehmer: 'Probenehmer', lesend: 'Lesend',
}

// [Route, Beschriftung, Font-Awesome-Icon]
const NAV: [string, string, string][] = [
  ['planung', 'Planung', 'fa-calendar-day'],
  ['auftragsbuch', 'Auftragsbuch', 'fa-book'],
  ['pruefberichte', 'Prüfberichte', 'fa-file-shield'],
  ['stammdaten', 'Stammdaten', 'fa-building-user'],
  ['auswertungen', 'Auswertungen', 'fa-chart-column'],
  ['system', 'System', 'fa-gear'],
]

export default function App() {
  const [route, setRoute] = useState(location.hash.replace('#/', '') || 'planung')
  const [nachObenSichtbar, setNachObenSichtbar] = useState(false)
  useEffect(() => {
    const fn = () => setRoute(location.hash.replace('#/', '') || 'planung')
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  useEffect(() => {
    const pruefen = () => setNachObenSichtbar(window.scrollY > 450)
    window.addEventListener('scroll', pruefen, { passive: true })
    pruefen()
    return () => window.removeEventListener('scroll', pruefen)
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
    planung: <Planung />, auftragsbuch: <Auftragsbuch />, pruefberichte: <Pruefberichte />,
    stammdaten: <Stammdaten />, auswertungen: <Auswertungen />, system: <System />,
  }[route] ?? <Planung />

  const stand = new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <>
      <header>
        <div className="header-top">
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
          {!demoModus && session && rolle && anzeigename && (
            <OnlineNutzer userId={session.user.id} anzeigename={anzeigename} rolle={rolle} />
          )}
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
      {nachObenSichtbar && <button className="nach-oben no-print"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title="Nach oben" aria-label="Nach oben scrollen">
        <i className="fas fa-arrow-up" aria-hidden="true"></i>
      </button>}
    </>
  )
}
