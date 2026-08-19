/**
 * Automatischer 1:1-Abgleich zwischen Prüfberichten (Scanner-Import) und dem
 * Auftragsbuch. Seit Scanner 1.15 steht in jedem Bericht die Kundennummer,
 * der exakte Befund und die Untersuchungsart – es muss also nichts mehr
 * geraten werden:
 *
 *  1. Ergebnis-Übernahme: Befund laut Bericht → Ergebnis der Unteraufträge
 *     (Überschreitung / ohne Befund), Untersuchungsart → fachliche Art.
 *  2. Rückwirkende Phasen: Überschreitung eröffnet eine Phase, der nächste
 *     saubere Bericht schließt sie – alles datumsgenau aus den Berichten.
 *
 * Es wird NIE stillschweigend geschrieben: beide Funktionen liefern nur
 * Vorschläge, die Übernahme erfolgt per Klick auf der Abgleich-Seite.
 */

import type {
  Auftrag, FachlicheUntersuchungsart, Pruefbericht, Ueberschreitungsphase,
  Untersuchungsart, Unterauftrag,
} from './types'
import { umfangZuArten } from './types'

/* ---------- Zuordnungstabellen ---------- */

/** Untersuchungsart laut Bericht → fachliche Art des Auftragsbuchs. */
export function fachartAusBericht(s?: string): FachlicheUntersuchungsart | undefined {
  const t = (s ?? '').toLowerCase()
  if (!t) return undefined
  if (t.includes('orientier')) return 'orientierend'
  if (t.includes('weiterge')) return 'weitergehend'
  if (t.includes('nachunter')) return 'nachuntersuchung'
  if (t.includes('eigenprobe') || t.includes('nichtamtlich')) return 'nichtamtliche_eigenprobe'
  return undefined
}

/** Parametergruppe einer Überschreitung → Untersuchungsart. */
function gruppeZuArt(g?: string): Untersuchungsart | undefined {
  const t = (g ?? '').toLowerCase()
  if (t.startsWith('legio')) return 'legionellen'
  if (t.startsWith('mikro') || t.startsWith('mibi')) return 'mibi'
  if (t.startsWith('chem')) return 'chemie'
  return undefined
}

/* ---------- 1. Ergebnis-Übernahme ---------- */

export interface ErgebnisVorschlag {
  bericht: Pruefbericht
  auftrag: Auftrag
  unterauftrag: Unterauftrag
  neuesErgebnis: 'ueberschritten' | 'unauffaellig'
  /** Fachliche Art, falls am Auftrag noch keine gesetzt ist. */
  fachart?: FachlicheUntersuchungsart
  hinweis?: string
}

/**
 * Für jeden zugeordneten Bericht mit eindeutigem Befund: offene Unteraufträge
 * passender Art bekommen ihr Ergebnis vorgeschlagen. Bei kombinierten
 * Berichten entscheidet die Parametergruppe der Überschreitungen, welche Art
 * überschritten ist – alle übrigen Arten des Berichts sind sauber.
 */
export function ergebnisVorschlaege(
  berichte: Pruefbericht[],
  auftragNachId: Map<string, Auftrag>,
): ErgebnisVorschlag[] {
  const out: ErgebnisVorschlag[] = []
  for (const b of berichte) {
    if (!b.auftrag_id) continue
    if (b.befund !== 'Überschreitung' && b.befund !== 'Ohne Befund') continue // "Unklar" nie automatisch
    const a = auftragNachId.get(b.auftrag_id)
    if (!a) continue

    const berichtArten = new Set(umfangZuArten(b.umfang))
    if (!berichtArten.size) continue

    // Welche Arten sind laut strukturierter Überschreitungsliste betroffen?
    const ueberArten = new Set<Untersuchungsart>()
    let unbekannteGruppe = false
    for (const u of b.ueberschreitungen ?? []) {
      const art = gruppeZuArt(u.gruppe) ?? (u.parameter?.toLowerCase().includes('legionellen') ? 'legionellen' : undefined)
      if (art) ueberArten.add(art)
      else unbekannteGruppe = true
    }
    // Überschreitung ohne auswertbare Parameterliste → nicht automatisch entscheiden
    if (b.ueberschreitung && !ueberArten.size) continue

    const fachart = a.fachliche_untersuchungsart ? undefined : fachartAusBericht(b.untersuchungsart)

    for (const u of a.unterauftraege ?? []) {
      if (u.status === 'storniert' || u.ergebnis !== 'offen') continue
      if (!berichtArten.has(u.art)) continue
      // Bei unbekannter Gruppe nur die sicher überschrittenen Arten anfassen
      if (unbekannteGruppe && !ueberArten.has(u.art)) continue
      out.push({
        bericht: b, auftrag: a, unterauftrag: u,
        neuesErgebnis: ueberArten.has(u.art) ? 'ueberschritten' : 'unauffaellig',
        fachart,
        hinweis: b.ueberschreitung && !ueberArten.has(u.art)
          ? 'Bericht hat eine Überschreitung, aber nicht in dieser Untersuchungsart' : undefined,
      })
    }
  }
  return out
}

/* ---------- 2. Rückwirkende Phasen ---------- */

export interface PhasenVorschlag {
  bereichId: string
  eroeffnetAm: string            // Probenahmedatum des überschrittenen Berichts
  abgeschlossenAm?: string       // Probenahmedatum des ersten sauberen Folgeberichts
  status: 'aktiv' | 'abgeschlossen'
  berichte: Pruefbericht[]       // alle Berichte der Phase (inkl. Auslöser und Abschluss)
  ausloeser: Pruefbericht
  saubereNachweise: number       // saubere Berichte innerhalb der Phase
  uebersprungen?: string         // gesetzt, wenn eine bestehende Phase kollidiert
}

const TAG = 864e5
const tageDiff = (a: string, b: string) => Math.abs(Math.round((+new Date(b) - +new Date(a)) / TAG))

/**
 * Rekonstruiert Überschreitungsphasen je Bereich rein aus den zugeordneten
 * Prüfberichten – datumsgenau, ohne Turnus-Schätzung:
 * Überschreitung eröffnet, der erste saubere Folgebericht schließt.
 */
export function phasenVorschlaege(
  berichte: Pruefbericht[],
  auftragNachId: Map<string, Auftrag>,
  bestehendePhasen: Ueberschreitungsphase[],
): PhasenVorschlag[] {
  // Berichte je Bereich sammeln (nur zugeordnete mit Datum und klarem Befund)
  const proBereich = new Map<string, Pruefbericht[]>()
  for (const b of berichte) {
    if (!b.auftrag_id || !b.probenahmedatum) continue
    if (b.befund !== 'Überschreitung' && b.befund !== 'Ohne Befund') continue
    const a = auftragNachId.get(b.auftrag_id)
    if (!a) continue
    if (!proBereich.has(a.bereich_id)) proBereich.set(a.bereich_id, [])
    proBereich.get(a.bereich_id)!.push(b)
  }

  const phasenProBereich = new Map<string, Ueberschreitungsphase[]>()
  for (const p of bestehendePhasen) {
    if (!phasenProBereich.has(p.bereich_id)) phasenProBereich.set(p.bereich_id, [])
    phasenProBereich.get(p.bereich_id)!.push(p)
  }

  const out: PhasenVorschlag[] = []
  for (const [bereichId, liste] of proBereich) {
    liste.sort((a, b) => a.probenahmedatum!.localeCompare(b.probenahmedatum!))
    let offen: PhasenVorschlag | null = null

    for (const b of liste) {
      if (b.ueberschreitung) {
        if (!offen) {
          offen = {
            bereichId, eroeffnetAm: b.probenahmedatum!, status: 'aktiv',
            berichte: [b], ausloeser: b, saubereNachweise: 0,
          }
        } else offen.berichte.push(b)   // weitere Überschreitung → Phase läuft weiter
      } else if (offen) {
        // erster sauberer Bericht schließt die Phase (datumsgenau)
        offen.berichte.push(b)
        offen.saubereNachweise++
        offen.abgeschlossenAm = b.probenahmedatum!
        offen.status = 'abgeschlossen'
        out.push(offen)
        offen = null
      }
    }
    if (offen) out.push(offen)   // keine saubere Folgeuntersuchung → noch aktiv

    // Kollision mit bestehenden Phasen markieren (±120 Tage um die Eröffnung)
    const vorhandene = phasenProBereich.get(bereichId) ?? []
    for (const v of out.filter(x => x.bereichId === bereichId)) {
      const treffer = vorhandene.find(p =>
        tageDiff(p.eroeffnet_am, v.eroeffnetAm) <= 120 ||
        (p.status !== 'abgeschlossen' && p.eroeffnet_am <= v.eroeffnetAm))
      if (treffer) v.uebersprungen = `Phase vom ${treffer.eroeffnet_am} existiert bereits`
    }
  }

  return out.sort((a, b) => b.eroeffnetAm.localeCompare(a.eroeffnetAm))
}
