import { useState } from 'react'
import { supabase } from '../lib/data'

export default function Login() {
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState('')
  const [sendet, setSendet] = useState(false)

  const anmelden = async () => {
    if (!supabase || !email || !passwort) return
    setSendet(true); setFehler('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
    setSendet(false)
    if (error) setFehler(error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : error.message)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #16232b 0%, #1d3a5f 50%, #0f2744 100%)', padding: '20px 12px',
    }}>
      <form onSubmit={e => { e.preventDefault(); anmelden() }}
        style={{ width: '100%', maxWidth: 380, background: 'var(--surface)', borderRadius: 16, padding: '32px 32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 10 }}>🔐</div>
        <div style={{ fontSize: 18, fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>NOVA Wasser – Untersuchungsverwaltung</div>
        <div className="hint" style={{ textAlign: 'center', marginBottom: 20 }}>NOVA Praxis-Hygiene – Supabase Login</div>

        <label className="f" style={{ marginBottom: 12 }}>
          E-Mail
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            autoComplete="email" placeholder="deine@nova-praxis.de" autoFocus />
        </label>
        <label className="f" style={{ marginBottom: 8 }}>
          Passwort
          <input type="password" value={passwort} onChange={e => setPasswort(e.target.value)}
            autoComplete="current-password" placeholder="••••••••" />
        </label>
        {fehler && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 8px' }}>{fehler}</p>}
        <button type="submit" className="primary" disabled={sendet || !email || !passwort} style={{ width: '100%', marginTop: 8 }}>
          {sendet ? 'Wird geprüft …' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
