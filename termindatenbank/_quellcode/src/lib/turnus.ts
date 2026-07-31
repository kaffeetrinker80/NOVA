import type { Bereich, FachlicheUntersuchungsart, Turnusart, Ueberschreitungsphase } from './types'

const PHASE_ABGESCHLOSSEN = new Set(['regelturnus_bestaetigt', 'abgeschlossen'])

export function offenePhaseFuerBereich(
  bereichId: string,
  phasen: Ueberschreitungsphase[],
): Ueberschreitungsphase | undefined {
  return phasen
    .filter(p => p.bereich_id === bereichId && !PHASE_ABGESCHLOSSEN.has(p.status))
    .sort((a, b) => b.eroeffnet_am.localeCompare(a.eroeffnet_am))[0]
}

/** Drei Monate sind fachlich immer Nachuntersuchung, auch bei inkonsistenten Altdaten. */
export function istNachuntersuchungsTurnus(bereich?: Bereich): boolean {
  return !!bereich && (bereich.turnus_monate === 3 || bereich.turnus_art === 'nachuntersuchung')
}

/** Hält Turnusart und Monatswert beim Speichern zusammen. */
export function konsistenteTurnusart(monate: number | undefined, art?: Turnusart): Turnusart {
  if (monate === 3) return 'nachuntersuchung'
  if ((monate === 12 || monate === 36) && art === 'nachuntersuchung') return 'regelturnus'
  return art ?? 'regelturnus'
}

/** Einheitliche Vorbelegung für Dashboard- und Spontanplanung. */
export function naechsteFachlicheArt(
  bereich: Bereich | undefined,
  phasen: Ueberschreitungsphase[],
): FachlicheUntersuchungsart {
  if (!bereich) return 'orientierend'
  const phase = offenePhaseFuerBereich(bereich.id, phasen)
  if (phase?.status === 'nachuntersuchung' || istNachuntersuchungsTurnus(bereich)) return 'nachuntersuchung'
  if (phase) return 'weitergehend'
  return 'orientierend'
}

export function datumPlusMonate(datum: string, monate: number): string {
  const [jahr, monat, tag] = datum.split('-').map(Number)
  if (!jahr || !monat || !tag) return datum
  const ziel = new Date(Date.UTC(jahr, monat - 1 + monate, tag))
  return ziel.toISOString().slice(0, 10)
}

export function datumPlusTage(datum: string, tage: number): string {
  const wert = new Date(`${datum}T12:00:00Z`)
  if (Number.isNaN(wert.getTime())) return datum
  wert.setUTCDate(wert.getUTCDate() + tage)
  return wert.toISOString().slice(0, 10)
}
