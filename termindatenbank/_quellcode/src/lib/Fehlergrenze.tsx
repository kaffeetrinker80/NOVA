import { Component, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { fehler: Error | null }

export class Fehlergrenze extends Component<Props, State> {
  state: State = { fehler: null }

  static getDerivedStateFromError(fehler: Error) {
    return { fehler }
  }

  componentDidCatch(fehler: Error, info: unknown) {
    console.error('Unerwarteter Fehler:', fehler, info)
  }

  render() {
    if (this.state.fehler) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="panel" style={{ maxWidth: 480 }}>
            <p style={{ fontWeight: 600, marginTop: 0 }}>Etwas ist schiefgelaufen.</p>
            <p className="hint">{this.state.fehler.message}</p>
            <button className="primary" onClick={() => location.reload()}>Seite neu laden</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
