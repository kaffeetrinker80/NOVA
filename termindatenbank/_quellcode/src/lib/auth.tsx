import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, demoModus } from './data'
import type { Rolle } from './types'

interface AuthState {
  session: Session | null
  rolle: Rolle | null
  anzeigename: string | null
  ladend: boolean
}

const AuthContext = createContext<AuthState>({ session: null, rolle: null, anzeigename: null, ladend: true })
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null, rolle: demoModus ? 'admin' : null, anzeigename: demoModus ? 'Demo' : null, ladend: !demoModus,
  })

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => ladeProfil(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => ladeProfil(session))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function ladeProfil(session: Session | null) {
    if (!supabase || !session) { setState({ session: null, rolle: null, anzeigename: null, ladend: false }); return }
    const { data } = await supabase.from('td_profile').select('rolle, anzeigename').eq('id', session.user.id).maybeSingle()
    setState({
      session,
      rolle: (data?.rolle as Rolle) ?? null,
      anzeigename: data?.anzeigename ?? session.user.email ?? null,
      ladend: false,
    })
  }

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
