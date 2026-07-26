/**
 * Überschreitungsphasen aus Untersuchungsterminen rekonstruieren.
 * Logik übernommen aus generate_ueberschreitungen_dashboard.py.
 *
 * Grundgedanke: Liegt zwischen zwei Untersuchungen ein deutlich kürzerer Abstand
 * als der Regelturnus, war das eine Nachuntersuchung – also eine Überschreitung.
 * Kehrt der Abstand wieder auf Regelmaß zurück, gilt die Phase als abgeschlossen.
 */

export interface Phase {
  anlageId: string
  anlage: string
  kunde: string
  ort?: string
  regelturnusJahre: number | null
  turnusHerkunft: string
  ueberschreitungsdatum: string
  ueberschreitungsjahr: number
  ersteNachuntersuchung?: string
  letzteNachuntersuchung?: string
  anzahlNachuntersuchungen: number
  dauerMonate: number | null
  status: 'aktiv' | 'abgeschlossen' | 'prueffall'
  sicherheit: 'hoch' | 'mittel' | 'pruefen'
  abstandTage: number      // Abstand, der die Überschreitung ausgelöst hat
}

const TAG = 864e5
const tage = (a: string, b: string) => Math.round((+new Date(b) - +new Date(a)) / TAG)

function monateZwischen(a: string, b: string): number {
  const d1 = new Date(a), d2 = new Date(b)
  let m = (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth()
  if (d2.getDate() < d1.getDate()) m--
  return Math.max(m, 0)
}

/** Erkennt eindeutige historische Regelabstände. */
function regelabstand(t: number): number | null {
  if (t >= 300 && t <= 460) return 1
  if (t >= 900 && t <= 1280) return 3
  return null
}

function istRegelabstand(t: number, basis: number): boolean {
  return basis === 1 ? (t >= 270 && t <= 550) : (t >= 800 && t <= 1450)
}

function istNachuntersuchung(t: number, basis: number): boolean {
  if (t <= 0) return false
  return basis === 1 ? t < 270 : t < 800
}

/** Regelturnus aus Stammdaten oder aus den historischen Abständen ableiten. */
function basisTurnus(turnusMonate: number | undefined, daten: string[]): [number | null, string] {
  if (turnusMonate === 12) return [1, 'aktueller Turnus']
  if (turnusMonate === 36) return [3, 'aktueller Turnus']

  const abstaende = daten.slice(0, -1).map((d, i) => tage(d, daten[i + 1]))
  const kandidaten = abstaende.map(regelabstand).filter((x): x is number => x !== null)
  if (kandidaten.length) {
    const ein = kandidaten.filter(k => k === 1).length
    const drei = kandidaten.filter(k => k === 3).length
    if (ein !== drei) return [ein > drei ? 1 : 3, 'historische Abstände']
    for (let i = abstaende.length - 1; i >= 0; i--) {
      const k = regelabstand(abstaende[i])
      if (k) return [k, 'jüngster Regelabstand']
    }
  }
  return [null, 'nicht sicher ableitbar']
}

export interface AnlagenEingabe {
  id: string
  name: string
  kunde: string
  ort?: string
  turnusMonate?: number
  termine: string[]   // ISO-Daten aller Untersuchungen
}

export function phasenErmitteln(anlagen: AnlagenEingabe[]): Phase[] {
  const phasen: Phase[] = []
  const heute = new Date().toISOString().slice(0, 10)

  for (const a of anlagen) {
    const daten = [...new Set(a.termine)].sort()
    if (daten.length < 2) continue

    const [basis, herkunft] = basisTurnus(a.turnusMonate, daten)
    if (basis === null) continue

    let i = 0
    while (i < daten.length - 1) {
      const abstand = tage(daten[i], daten[i + 1])

      if (istNachuntersuchung(abstand, basis)) {
        const erkennung = daten[i]
        const nachunters: string[] = []
        let j = i

        // Alle folgenden kurzen Abstände gehören zur selben Phase
        while (j < daten.length - 1 && istNachuntersuchung(tage(daten[j], daten[j + 1]), basis)) {
          nachunters.push(daten[j + 1])
          j++
        }

        const letzte = nachunters[nachunters.length - 1]
        const normalisiert = j < daten.length - 1 && istRegelabstand(tage(daten[j], daten[j + 1]), basis)
        const tageSeitLetzter = tage(letzte, heute)

        let status: Phase['status']
        if (normalisiert) status = 'abgeschlossen'
        else if (tageSeitLetzter > (basis === 1 ? 550 : 1450)) status = 'prueffall'
        else status = 'aktiv'

        // Sicherheit der Ableitung: klarer Regelturnus aus Stammdaten = hoch
        const ausl = tage(daten[i], daten[i + 1])
        let sicherheit: Phase['sicherheit']
        if (herkunft === 'aktueller Turnus') sicherheit = 'hoch'
        else if (herkunft === 'historische Abstände') sicherheit = 'mittel'
        else sicherheit = 'pruefen'

        phasen.push({
          sicherheit, abstandTage: ausl,
          anlageId: a.id, anlage: a.name, kunde: a.kunde, ort: a.ort,
          regelturnusJahre: basis, turnusHerkunft: herkunft,
          ueberschreitungsdatum: erkennung,
          ueberschreitungsjahr: +erkennung.slice(0, 4),
          ersteNachuntersuchung: nachunters[0],
          letzteNachuntersuchung: letzte,
          anzahlNachuntersuchungen: nachunters.length,
          dauerMonate: letzte ? monateZwischen(erkennung, letzte) : null,
          status,
        })
        i = j
      }
      i++
    }
  }

  return phasen.sort((a, b) => b.ueberschreitungsdatum.localeCompare(a.ueberschreitungsdatum))
}

export interface JahresStatistik {
  jahr: number
  untersuchteAnlagen: number
  ueberschritteneAnlagen: number
  quoteProzent: number
}

export function jahresStatistik(anlagen: AnlagenEingabe[], phasen: Phase[]): JahresStatistik[] {
  const proJahr = new Map<number, { unters: Set<string>; ueber: Set<string> }>()
  const holen = (j: number) => {
    if (!proJahr.has(j)) proJahr.set(j, { unters: new Set(), ueber: new Set() })
    return proJahr.get(j)!
  }

  for (const a of anlagen) {
    for (const t of new Set(a.termine)) holen(+t.slice(0, 4)).unters.add(a.id)
  }
  for (const p of phasen) holen(p.ueberschreitungsjahr).ueber.add(p.anlageId)

  return [...proJahr.entries()]
    .map(([jahr, v]) => ({
      jahr,
      untersuchteAnlagen: v.unters.size,
      ueberschritteneAnlagen: v.ueber.size,
      quoteProzent: v.unters.size ? Math.round((v.ueber.size / v.unters.size) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.jahr - a.jahr)
}
