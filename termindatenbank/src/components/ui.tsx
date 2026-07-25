import { ReactNode } from 'react'
import type { Auftragsstatus, Ergebnisstatus, Terminstatus } from '../lib/types'
import { ERGEBNIS_LABEL, STATUS_LABEL, TERMIN_LABEL } from '../lib/types'

export const Nr = ({ children }: { children: ReactNode }) => <span className="nr">{children}</span>

export function StatusBadge({ s }: { s: Auftragsstatus }) {
  const farbe = { offen: 'gray', beprobt: 'blue', im_labor: 'amber', abgeschlossen: 'green', storniert: 'red' }[s]
  return <span className={`badge ${farbe}`}>{STATUS_LABEL[s]}</span>
}
export function ErgebnisBadge({ s }: { s: Ergebnisstatus }) {
  const farbe = { offen: 'gray', unauffaellig: 'green', ueberschritten: 'red', nachuntersuchung_erforderlich: 'amber' }[s]
  return <span className={`badge ${farbe}`}>{ERGEBNIS_LABEL[s]}</span>
}
export function TerminBadge({ s }: { s: Terminstatus }) {
  const farbe = { geplant: 'gray', bestaetigt: 'blue', abgeschlossen: 'green', abgesagt: 'red', verschoben: 'amber' }[s]
  return <span className={`badge ${farbe}`}>{TERMIN_LABEL[s]}</span>
}
