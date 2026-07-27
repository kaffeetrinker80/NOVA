import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Auftrag, Bereich, Kunde, Termin, Ueberschreitungsphase } from '../lib/types'
import { ART_LABEL, fmtDatum, nummerVoll, kundeAnzeige } from '../lib/types'
import { ErgebnisBadge } from './ui'
import { phasenErmitteln } from '../lib/phasen'

const heute = new Date().toISOString().slice(0, 10)
const turnusText = (m?: number) => m === 3 ? '3 Monate' : m === 12 ? '1 Jahr' : m === 36 ? '3 Jahre' : '–'
const tageSeit = (von: string, bis: string) => Math.round((+new Date(bis) - +new Date(von)) / 864e5)

/** Der gut lesbare Anlagen-Verlauf: Phase, NUs und aktueller Stand auf einen Blick. */
export default function HistorieModal({ anlage, kunde, termine, auftraege, bereiche, nurBereich, onClose }: {
  anlage: Anlage
  kunde?: Kunde
  termine: Termin[]
  auftraege: Auftrag[]
  bereiche: Bereich[]
  nurBereich?: string
  onClose: () => void
}) {
  const [fachPhasen, setFachPhasen] = useState<Ueberschreitungsphase[]>([])
  const bereicheDerAnlage = useMemo(() => bereiche.filter(b => b.anlage_id === anlage.id), [bereiche, anlage.id])
  const bereichIds = useMemo(() => nurBereich ? [nurBereich] : bereicheDerAnlage.map(b => b.id), [nurBereich, bereicheDerAnlage])
  const bereichName = nurBereich ? bereiche.find(b => b.id === nurBereich)?.name : undefined

  useEffect(() => {
    Promise.all(bereichIds.map(id => db.phasenFuerBereich(id))).then(x => setFachPhasen(x.flat())).catch(() => setFachPhasen([]))
  }, [bereichIds])

  const eigene = useMemo(() => termine.filter(t => {
    if (t.anlage_id !== anlage.id || t.status === 'abgesagt') return false
    if (!nurBereich) return true
    return t.bereich_id === nurBereich || (!t.bereich_id && bereicheDerAnlage.length === 1)
  }).sort((a, b) => a.datum.localeCompare(b.datum)), [termine, anlage.id, nurBereich, bereicheDerAnlage.length])

  const vergangene = useMemo(() => eigene.filter(t => t.datum <= heute), [eigene])
  const zukuenftige = useMemo(() => eigene.filter(t => t.datum > heute), [eigene])
  const eigeneAuftraege = useMemo(() => auftraege.filter(a => bereichIds.includes(a.bereich_id)), [auftraege, bereichIds])
  const phasen = useMemo(() => phasenErmitteln([{
    id: anlage.id, name: anlage.name, kunde: kundeAnzeige(kunde), ort: anlage.ort,
    turnusMonate: anlage.turnus_monate, termine: vergangene.map(t => t.datum),
  }]), [anlage, kunde, vergangene])

  const aktuelleFachphase = fachPhasen.find(p => !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status))
  const aktuellePhase = phasen.find(p => p.status === 'aktiv' || p.status === 'prueffall')
  const fokusPhase = aktuellePhase ?? phasen[phasen.length - 1]
  const relevanteTermine = useMemo(() => {
    if (!fokusPhase) return vergangene.slice(-8)
    const ende = fokusPhase.letzteNachuntersuchung ?? heute
    return vergangene.filter(t => t.datum >= fokusPhase.ueberschreitungsdatum && t.datum <= ende)
  }, [fokusPhase, vergangene])

  const rolle = (termin: Termin, index: number): { text: string; art: 'start' | 'nu' | 'normal' } => {
    const start = phasen.find(p => p.ueberschreitungsdatum === termin.datum)
    if (start) return { text: 'Überschreitung', art: 'start' }
    const phase = phasen.find(p => termin.datum > p.ueberschreitungsdatum && termin.datum <= (p.letzteNachuntersuchung ?? heute))
    if (phase) {
      const nr = relevanteTermine.filter(t => t.datum > phase.ueberschreitungsdatum && t.datum <= termin.datum).length
      const vorher = relevanteTermine[index - 1]
      const abstand = vorher ? tageSeit(vorher.datum, termin.datum) : 0
      const monate = Math.max(1, Math.round(abstand / 30.44))
      return { text: `${nr}. Nachuntersuchung · ${monate} ${monate === 1 ? 'Mon.' : 'Mon.'} nach der vorherigen${abstand ? ` (${abstand} Tage)` : ''}`, art: 'nu' }
    }
    return { text: 'Regeluntersuchung', art: 'normal' }
  }

  const statusText = aktuelleFachphase
    ? `Fachlich geführte Phase · ${aktuelleFachphase.status.replace('_', ' ')} · eröffnet ${fmtDatum(aktuelleFachphase.eroeffnet_am)}`
    : aktuellePhase?.status === 'aktiv'
      ? `Phase läuft noch · nächste Untersuchung: ${fmtDatum(anlage.naechste_untersuchung)}`
      : aktuellePhase?.status === 'prueffall'
        ? 'Prüffall · Verlauf bitte fachlich prüfen'
        : `Regelturnus · nächste Untersuchung: ${fmtDatum(anlage.naechste_untersuchung)}`

  const auftragZumTermin = (id: string) => eigeneAuftraege.filter(a => a.termin_id === id)

  return <div className="modal-hintergrund" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal historie-modal" role="dialog" aria-modal="true" aria-label={`Untersuchungsverlauf ${anlage.name}`}>
      <div className="modal-kopf">
        <div>
          <strong><i className="fas fa-clock-rotate-left" aria-hidden="true"></i> {anlage.name}{bereichName ? ` › ${bereichName}` : ''}</strong>
          <div className="hint">{kundeAnzeige(kunde)} | {[anlage.plz, anlage.ort].filter(Boolean).join(' ')} | Regelturnus: {turnusText(anlage.turnus_monate)}</div>
        </div>
        <button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button>
      </div>

      <div className={`hist-status ${aktuelleFachphase || aktuellePhase?.status === 'aktiv' ? 'aktiv' : aktuellePhase?.status === 'prueffall' ? 'prueffall' : ''}`}>
        <i className={`fas ${aktuelleFachphase || aktuellePhase?.status === 'aktiv' ? 'fa-triangle-exclamation' : aktuellePhase?.status === 'prueffall' ? 'fa-circle-question' : 'fa-circle-check'}`} aria-hidden="true"></i>
        {statusText}
      </div>

      <div className="hist-kennzahlen">
        <div><span>Letzte Untersuchung</span><strong>{fmtDatum(vergangene[vergangene.length - 1]?.datum)}</strong></div>
        <div><span>Nächster Termin</span><strong>{fmtDatum(zukuenftige[0]?.datum ?? anlage.naechste_untersuchung)}</strong></div>
        <div><span>Verlauf</span><strong>{fokusPhase ? `${fokusPhase.anzahlNachuntersuchungen} NU` : 'Regelturnus'}</strong></div>
      </div>

      {fachPhasen.length > 0 && <div className="hist-phasen">{fachPhasen.map(p => <span key={p.id} className={`badge ${['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status) ? 'closed' : 'active'}`}>Phase {fmtDatum(p.eroeffnet_am)} · {p.status.replace(/_/g, ' ')}</span>)}</div>}

      <div className="hist-liste">
        {relevanteTermine.map((t, i) => {
          const r = rolle(t, i); const zug = auftragZumTermin(t.id)
          return <div key={t.id} className={`hist-eintrag hist-${r.art}`}>
            <div className="hist-punkt" aria-hidden="true"></div>
            <div className="hist-inhalt">
              <div className="hist-zeile1"><strong>{fmtDatum(t.datum)}</strong></div>
              <div className="hist-rolle">{r.text}</div>
              {zug.map(a => <div key={a.id} className="hist-auftrag">{a.unterauftraege.map(u => <span key={u.id} className="hist-unterauftrag"><span className="nr">{nummerVoll(a, u)}</span> {ART_LABEL[u.art]}{u.proben_ist != null && <> · {u.proben_ist} Proben</>} <ErgebnisBadge s={u.ergebnis} /></span>)}</div>)}
              {t.notizen && !t.notizen.startsWith('Historischer Termin') && <div className="hint">{t.notizen}</div>}
            </div>
          </div>
        })}
        {relevanteTermine.length === 0 && <p className="hint">Noch keine Untersuchungen erfasst.</p>}
        {zukuenftige[0] && <div className="hist-ausblick"><i className="fas fa-calendar-check" aria-hidden="true"></i> Geplant: {fmtDatum(zukuenftige[0].datum)}</div>}
      </div>
    </div>
  </div>
}
