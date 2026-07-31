import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Bereich, Ueberschreitungsphase, Untersuchungsbewertung } from '../lib/types'
import { fmtDatum } from '../lib/types'
import { datumPlusMonate } from '../lib/turnus'

/** Abschluss einer Phase: erst Maßnahmen, dann NUs ohne Befund oder ausdrückliche GA-Freigabe. */
export default function PhaseModal({ phase, bereich, bereichName, onClose, onSaved }: {
  phase: Ueberschreitungsphase; bereich?: Bereich; bereichName?: string; onClose: () => void; onSaved: () => void
}) {
  const [bewertungen, setBewertungen] = useState<Untersuchungsbewertung[]>([])
  const [massnahmenAm, setMassnahmenAm] = useState(phase.massnahmen_abschluss_am ?? '')
  const [gaAm, setGaAm] = useState(phase.gesundheitsamt_freigabe_am ?? '')
  const [gaAz, setGaAz] = useState(phase.gesundheitsamt_aktenzeichen ?? '')
  const [gaGrund, setGaGrund] = useState(phase.begruendung_abweichung ?? '')
  const [notiz, setNotiz] = useState(phase.notizen ?? '')
  const [regelturnus, setRegelturnus] = useState<'12' | '36' | ''>(
    bereich?.turnus_monate === 12 ? '12' : bereich?.turnus_monate === 36 ? '36' : ''
  )
  const [fehler, setFehler] = useState(''); const [laeuft, setLaeuft] = useState(false)
  useEffect(() => { db.bewertungenFuerPhase(phase.id).then(setBewertungen).catch(e => setFehler(e.message ?? String(e))) }, [phase.id])
  const saubere = useMemo(() => bewertungen.filter(b => b.befund === 'sauber' && b.zaehlt_als_saubere_nachuntersuchung), [bewertungen])
  const heute = new Date().toISOString().slice(0, 10)
  const speichern = async (aktion: 'massnahmen' | 'regelturnus' | 'abschluss') => {
    if (aktion === 'abschluss' && saubere.length < phase.saubere_nu_erforderlich) { setFehler(`Für den Standardabschluss fehlen noch ${phase.saubere_nu_erforderlich - saubere.length} Nachuntersuchung(en) ohne Befund.`); return }
    if (aktion === 'regelturnus' && !gaAm) { setFehler('Für die vorzeitige Rückkehr zum Regelturnus bitte das Datum der GA-Freigabe eintragen.'); return }
    if (aktion === 'regelturnus' && !gaGrund.trim()) { setFehler('Bitte die Entscheidung bzw. Begründung des Gesundheitsamts dokumentieren.'); return }
    if (aktion !== 'massnahmen' && !regelturnus) { setFehler('Bitte den anschließenden Regelturnus 1 Jahr oder 3 Jahre wählen.'); return }
    setLaeuft(true); setFehler('')
    try {
      if (aktion === 'massnahmen') {
        const basis = massnahmenAm || heute
        await db.phaseAktualisieren(phase.id, { status: 'nachuntersuchung', massnahmen_abschluss_am: basis, notizen: notiz || undefined })
        await db.bereichAktualisieren(phase.bereich_id, {
          turnus_art: 'nachuntersuchung', turnus_monate: 3,
          naechste_untersuchung: datumPlusMonate(basis, 3),
        })
      }
      if (aktion === 'regelturnus') await db.phaseAktualisieren(phase.id, {
        status: 'regelturnus_bestaetigt',
        gesundheitsamt_freigabe_am: gaAm,
        gesundheitsamt_aktenzeichen: gaAz || undefined,
        begruendung_abweichung: gaGrund.trim(),
        abgeschlossen_am: gaAm,
        notizen: notiz || undefined,
      })
      if (aktion === 'abschluss') await db.phaseAktualisieren(phase.id, { status: 'abgeschlossen', massnahmen_abschluss_am: massnahmenAm || undefined, abgeschlossen_am: heute, notizen: notiz || undefined })
      if (aktion !== 'massnahmen') {
        const basis = aktion === 'regelturnus' ? gaAm : heute
        await db.bereichAktualisieren(phase.bereich_id, {
          turnus_art: 'regelturnus', turnus_monate: Number(regelturnus),
          naechste_untersuchung: datumPlusMonate(basis, Number(regelturnus)),
        })
      }
      onSaved(); onClose()
    } catch (e: any) { setFehler(e.message ?? String(e)); setLaeuft(false) }
  }
  return <div className="modal-hintergrund" onClick={e => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label="Überschreitungsphase">
    <div className="modal-kopf"><div><strong>Überschreitungsphase verwalten</strong><div className="hint">{bereichName ?? 'Untersuchungsbereich'} · eröffnet {fmtDatum(phase.eroeffnet_am)} · {phase.ausloeser}</div></div><button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button></div>
    {fehler && <div className="notice" style={{ margin: '12px 24px 0' }}>{fehler}</div>}
    <div style={{ padding: '16px 24px 4px' }}>
      <div className="notice" style={{ margin: 0 }}>
        Anerkannte saubere Nachuntersuchungen: <strong>{saubere.length} / {phase.saubere_nu_erforderlich}</strong>
      </div>
      <div className="hint" style={{ margin: '8px 0 12px' }}>
        Standardablauf: weitergehende Untersuchung + drei saubere NUs. Eine saubere weitergehende
        Untersuchung zählt nur nach ausdrücklicher Anerkennung durch das Gesundheitsamt als NU.
        {saubere.length
          ? <> Gezählt: {saubere.map(b => fmtDatum(b.bewertungsdatum)).join(' · ')}</>
          : ' Noch keine Untersuchung als saubere NU anerkannt.'}
      </div>
      <label className="f">Maßnahmen abgeschlossen am<input type="date" value={massnahmenAm} onChange={e => setMassnahmenAm(e.target.value)} /></label>
      <label className="f">Notiz<input value={notiz} onChange={e => setNotiz(e.target.value)} placeholder="optional" /></label>
      <div className="pm-fuss" style={{ margin: '8px 0 0' }}><button onClick={() => speichern('massnahmen')} disabled={laeuft}><i className="fas fa-screwdriver-wrench" aria-hidden="true"></i> Maßnahmenabschluss setzen</button></div>
      <hr style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '16px 0' }} />
      <strong>Vorzeitige Rückkehr in den Regelturnus</strong>
      <p className="hint">Das Gesundheitsamt kann die Phase auch vor 3/3 beenden. Diese Entscheidung wird mit Datum und Begründung dokumentiert.</p>
      <label className="f">Datum der GA-Freigabe<input type="date" value={gaAm} onChange={e => setGaAm(e.target.value)} /></label>
      <label className="f">Aktenzeichen<input value={gaAz} onChange={e => setGaAz(e.target.value)} placeholder="optional" /></label>
      <label className="f">Entscheidung / Begründung<input value={gaGrund} onChange={e => setGaGrund(e.target.value)} placeholder="z. B. Rückkehr nach WGU + 2 sauberen NUs freigegeben" /></label>
      <label className="f">Regelturnus nach Phasenabschluss<select value={regelturnus} onChange={e => setRegelturnus(e.target.value as '12' | '36' | '')}>
        <option value="">bitte wählen</option>
        <option value="12">1 Jahr – öffentliche Abgabe</option>
        <option value="36">3 Jahre – gewerblich, nicht öffentlich</option>
      </select></label>
    </div>
    <div className="pm-fuss"><button onClick={() => speichern('abschluss')} disabled={laeuft || !regelturnus || saubere.length < phase.saubere_nu_erforderlich}><i className="fas fa-check-double" aria-hidden="true"></i> Nach {phase.saubere_nu_erforderlich} anerkannten NUs abschließen</button><button onClick={() => speichern('regelturnus')} disabled={laeuft || !regelturnus || !gaAm || !gaGrund.trim()}><i className="fas fa-landmark" aria-hidden="true"></i> Vorzeitige GA-Freigabe übernehmen</button><button onClick={onClose}>Abbrechen</button></div>
  </div></div>
}
