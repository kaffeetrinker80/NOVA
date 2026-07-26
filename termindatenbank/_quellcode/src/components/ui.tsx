import { ReactNode } from 'react'
import type { Auftragsstatus, Ergebnisstatus, Terminstatus } from '../lib/types'
import { ERGEBNIS_LABEL, STATUS_LABEL, TERMIN_LABEL } from '../lib/types'

export const Nr = ({ children }: { children: ReactNode }) => <span className="nr">{children}</span>

import { useEffect } from 'react'
/** Kurze Erfolgs-/Hinweismeldung, blendet sich nach einigen Sekunden selbst aus. */
export function Meldung({ text, onWeg }: { text: string; onWeg: () => void }) {
  useEffect(() => {
    if (!text) return
    const id = setTimeout(onWeg, 5000)
    return () => clearTimeout(id)
  }, [text])
  if (!text) return null
  return (
    <div className="notice notice-fade" role="status">
      <span>{text}</span>
      <button className="notice-x" onClick={onWeg} aria-label="Schließen">×</button>
    </div>
  )
}

/** Weißer Karten-Abschnitt mit Kopfzeile – Struktur wie in den NOVAplan-Dashboards. */
export function Abschnitt({ titel, aktionen, legende, children }: {
  titel: string; aktionen?: ReactNode; legende?: ReactNode; children: ReactNode
}) {
  return (
    <section className="table-section">
      <div className="section-header">
        <div className="section-header-left">
          <h3>{titel}</h3>
          {legende && <div className="legend">{legende}</div>}
        </div>
        {aktionen}
      </div>
      {children}
    </section>
  )
}

export function StatusBadge({ s }: { s: Auftragsstatus }) {
  const k = { offen: 'neutral', beprobt: 'high', im_labor: 'medium', abgeschlossen: 'closed', storniert: 'active' }[s]
  return <span className={`badge ${k}`}>{STATUS_LABEL[s]}</span>
}
export function ErgebnisBadge({ s }: { s: Ergebnisstatus }) {
  const k = { offen: 'neutral', unauffaellig: 'closed', ueberschritten: 'active', nachuntersuchung_erforderlich: 'medium' }[s]
  return <span className={`badge ${k}`}>{ERGEBNIS_LABEL[s]}</span>
}
export function TerminBadge({ s }: { s: Terminstatus }) {
  const k = { geplant: 'neutral', bestaetigt: 'high', abgeschlossen: 'closed', abgesagt: 'active', verschoben: 'medium' }[s]
  return <span className={`badge ${k}`}>{TERMIN_LABEL[s]}</span>
}
