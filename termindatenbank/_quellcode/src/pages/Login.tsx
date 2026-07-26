import { useState } from 'react'
import { supabase } from '../lib/data'

export default function Login() {
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState('')
  const [sendet, setSendet] = useState(false)
  const [zeigen, setZeigen] = useState(false)

  const anmelden = async () => {
    if (!supabase || !email || !passwort) return
    setSendet(true); setFehler('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
    setSendet(false)
    if (error) setFehler(error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : error.message)
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={e => { e.preventDefault(); anmelden() }}>
        <img className="login-logo" src={`${import.meta.env.BASE_URL}nova_logo_web.png`} alt=""
             onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        <h1 className="dashboard-title" style={{ marginBottom: 2 }}>
          <span className="product-name" style={{ color: 'var(--color-primary-dark)' }}>NOVAplan</span>
          <span className="dashboard-title-separator" style={{ color: 'var(--text-muted)' }}>·</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '.95rem' }}>Termin- &amp; Probenmanagement</span>
        </h1>
        <p className="hint" style={{ margin: '0 0 20px' }}>NOVA Praxis-Hygiene GmbH</p>

        <label className="f" style={{ marginBottom: 12 }}>
          E-Mail
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            autoComplete="email" placeholder="name@nova-praxis.de" autoFocus />
        </label>
        <label className="f" style={{ marginBottom: 10 }}>
          Passwort
          <div className="pw-feld">
            <input type={zeigen ? 'text' : 'password'} value={passwort} onChange={e => setPasswort(e.target.value)}
              autoComplete="current-password" placeholder="••••••••" />
            <button type="button" className="pw-auge" onClick={() => setZeigen(!zeigen)}
              aria-label={zeigen ? 'Passwort verbergen' : 'Passwort anzeigen'} tabIndex={-1}>
              <i className={`fas ${zeigen ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
            </button>
          </div>
        </label>
        {fehler && <p style={{ color: '#99342e', fontSize: '.8rem', margin: '0 0 10px' }}>{fehler}</p>}
        <button type="submit" className="primary" disabled={sendet || !email || !passwort}
          style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
          <i className="fas fa-right-to-bracket" aria-hidden="true"></i>
          {sendet ? 'Wird geprüft …' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
