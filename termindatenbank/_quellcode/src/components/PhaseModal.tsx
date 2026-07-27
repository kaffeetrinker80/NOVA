import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Ueberschreitungsphase, Untersuchungsbewertung } from '../lib/types'
import { fmtDatum } from '../lib/types'

/** Abschluss einer Phase: erst Maßnahmen, dann saubere NUs oder ausdrückliche GA-Freigabe. */
export default function PhaseModal({ phase, bereichName, onClose, onSaved }: {
  phase: Ueberschreitungsphase; bereichName?: string; onClose: () => void; onSaved: () => void
}) {
  const [bewertungen, setBewertungen] = useState<Untersuchungsbewertung[]>([])
  const [massnahmenAm, setMassnahmenAm] = useState(phase.massnahmen_abschluss_am ?? '')
  const [gaAm, setGaAm] = useState(phase.gesundheitsamt_freigabe_am ?? '')
  const [gaAz, setGaAz] = useState(phase.gesundheitsamt_aktenzeichen ?? '')
  const [notiz, setNotiz] = useState(phase.notizen ?? '')
  const [fehler, setFehler] = useState(''); const [laeuft, setLaeuft] = useState(false)
  useEffect(() => { db.bewertungenFuerPhase(phase.id).then(setBewertungen).catch(e => setFehler(e.message ?? String(e))) }, [phase.id])
  const saubere = useMemo(() => bewertungen.filter(b => b.befund === 'sauber' && b.zaehlt_als_saubere_nachuntersuchung), [bewertungen])
  const heute = new Date().toISOString().slice(0, 10)
  const speichern = async (aktion: 'massnahmen' | 'regelturnus' | 'abschluss') => {
    if (aktion === 'abschluss' && saubere.length < phase.saubere_nu_erforderlich) { setFehler(`Für den Standardabschluss fehlen noch ${phase.saubere_nu_erforderlich - saubere.length} saubere Nachuntersuchung(en).`); return }
    if (aktion === 'regelturnus' && !gaAm) { setFehler('Für die vorzeitige Rückkehr zum Regelturnus bitte das Datum der GA-Freigabe eintragen.'); return }
    setLaeuft(true); setFehler('')
    try {
      if (aktion === 'massnahmen') await db.phaseAktualisieren(phase.id, { status: 'nachuntersuchung', massnahmen_abschluss_am: massnahmenAm || heute, notizen: notiz || undefined })
      if (aktion === 'regelturnus') await db.phaseAktualisieren(phase.id, { status: 'regelturnus_bestaetigt', gesundheitsamt_freigabe_am: gaAm, gesundheitsamt_aktenzeichen: gaAz || undefined, abgeschlossen_am: gaAm, notizen: notiz || undefined })
      if (aktion === 'abschluss') await db.phaseAktualisieren(phase.id, { status: 'abgeschlossen', massnahmen_abschluss_am: massnahmenAm || undefined, abgeschlossen_am: heute, notizen: notiz || undefined })
      onSaved(); onClose()
    } catch (e: any) { setFehler(e.message ?? String(e)); setLaeuft(false) }
  }
  return <div className="modal-hintergrund" onClick={e => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label="Überschreitungsphase">
    <div className="modal-kopf"><div><strong>Überschreitungsphase verwalten</strong><div className="hint">{bereichName ?? 'Untersuchungsbereich'} · eröffnet {fmtDatum(phase.eroeffnet_am)} · {phase.ausloeser}</div></div><button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button></div>
    {fehler && <div className="notice" style={{ margin: '12px 24px 0' }}>{fehler}</div>}
    <div style={{ padding: '16px 24px 4px' }}><div className="notice" style={{ margin: 0 }}>Saubere Nachuntersuchungen: <strong>{saubere.length} / {phase.saubere_nu_erforderlich}</strong></div>
      <div className="hint" style={{ margin: '8px 0 12px' }}>{saubere.length ? saubere.map(b => fmtDatum(b.bewertungsdatum)).join(' · ') : 'Noch keine als sauber gezählte Nachuntersuchung.'}</div>
      <label className="f">Maßnahmen abgeschlossen am<input type="date" value={massnahmenAm} onChange={e => setMassnahmenAm(e.target.value)} /></label>
      <label className="f">Notiz<input value={notiz} onChange={e => setNotiz(e.target.value)} placeholder="optional" /></label>
      <div className="pm-fuss" style={{ margin: '8px 0 0' }}><button onClick={() => speichern('massnahmen')} disabled={laeuft}><i className="fas fa-screwdriver-wrench" aria-hidden="true"></i> Maßnahmenabschluss setzen</button></div>
      <hr style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />
      <label className="f">GA-Freigabe für Regelturnus<input type="date" value={gaAm} onChange={e => setGaAm(e.target.value)} /></label>
      <label className="f">Aktenzeichen / Hinweis<input value={gaAz} onChange={e => setGaAz(e.target.value)} placeholder="optional" /></label>
    </div>
    <div className="pm-fuss"><button onClick={() => speichern('abschluss')} disabled={laeuft || saubere.length < phase.saubere_nu_erforderlich}><i className="fas fa-check-double" aria-hidden="true"></i> Nach 3 sauberen NUs abschließen</button><button onClick={() => speichern('regelturnus')} disabled={laeuft || !gaAm}><i className="fas fa-landmark" aria-hidden="true"></i> GA-Freigabe übernehmen</button><button onClick={onClose}>Abbrechen</button></div>
  </div></div>
}
