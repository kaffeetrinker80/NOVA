import { useMemo } from 'react'
import type { Anlage, Auftrag, Bereich, Kunde, Termin } from '../lib/types'
import { ART_LABEL, fmtDatum, nummerVoll } from '../lib/types'
import { ErgebnisBadge } from './ui'
import { phasenErmitteln } from '../lib/phasen'

/** Kompletter Untersuchungsverlauf einer Anlage – Abstände, Phasen, Aufträge, Ergebnisse. */
export default function HistorieModal({ anlage, kunde, termine, auftraege, bereiche, onClose }: {
  anlage: Anlage
  kunde?: Kunde
  termine: Termin[]
  auftraege: Auftrag[]
  bereiche: Bereich[]
  onClose: () => void
}) {
  const eigene = useMemo(() =>
    termine.filter(t => t.anlage_id === anlage.id && t.status !== 'abgesagt')
      .sort((a, b) => b.datum.localeCompare(a.datum)),
    [termine, anlage])

  const bereichIds = new Set(bereiche.filter(b => b.anlage_id === anlage.id).map(b => b.id))
  const eigeneAuftraege = auftraege.filter(a => bereichIds.has(a.bereich_id))

  const phasen = useMemo(() => phasenErmitteln([{
    id: anlage.id, name: anlage.name, kunde: kunde?.name_kurz ?? '',
    ort: anlage.ort, turnusMonate: anlage.turnus_monate,
    termine: eigene.map(t => t.datum),
  }]), [anlage, kunde, eigene])

  // Datum -> Phase-Rolle ("Überschreitung erkannt" / "Nachuntersuchung")
  const rolle = new Map<string, string>()
  for (const p of phasen) {
    rolle.set(p.ueberschreitungsdatum, 'Überschreitung erkannt')
    let d = p.ersteNachuntersuchung
    for (const t of eigene.map(x => x.datum)) {
      if (d && t >= d && p.letzteNachuntersuchung && t <= p.letzteNachuntersuchung) {
        if (!rolle.has(t)) rolle.set(t, 'Nachuntersuchung')
      }
    }
  }

  const abstand = (i: number): string => {
    if (i >= eigene.length - 1) return ''
    const tage = Math.round((+new Date(eigene[i].datum) - +new Date(eigene[i + 1].datum)) / 864e5)
    if (tage >= 330) return `${Math.round(tage / 365.25 * 10) / 10} Jahre`
    return `${Math.round(tage / 30.44)} Monate`
  }

  return (
    <div className="modal-hintergrund" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }} role="dialog" aria-modal="true" aria-label={`Historie ${anlage.name}`}>
        <div className="modal-kopf">
          <div>
            <strong><i className="fas fa-clock-rotate-left" aria-hidden="true"></i> Untersuchungsverlauf · {anlage.name}</strong>
            <div className="hint">{kunde?.name_kurz ?? '–'} · {[anlage.plz, anlage.ort].filter(Boolean).join(' ')} ·
              Turnus {anlage.turnus_monate === 3 ? '3 Monate' : anlage.turnus_monate === 12 ? '1 Jahr' : anlage.turnus_monate === 36 ? '3 Jahre' : '–'}</div>
          </div>
          <button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        {phasen.length > 0 && (
          <div className="hist-phasen">
            {phasen.map((p, i) => (
              <span key={i} className={`badge ${p.status === 'aktiv' ? 'active' : p.status === 'prueffall' ? 'check' : 'closed'}`}>
                Phase ab {fmtDatum(p.ueberschreitungsdatum)} · {p.anzahlNachuntersuchungen} NU ·
                {p.dauerMonate != null ? ` ${p.dauerMonate} Mon. · ` : ' '}
                {p.status === 'aktiv' ? 'aktiv' : p.status === 'prueffall' ? 'Prüffall' : 'abgeschlossen'}
              </span>
            ))}
          </div>
        )}

        <div className="hist-liste">
          {eigene.map((t, i) => {
            const zug = eigeneAuftraege.filter(a => a.termin_id === t.id)
            const r = rolle.get(t.datum)
            return (
              <div key={t.id} className={`hist-eintrag ${r === 'Überschreitung erkannt' ? 'hist-rot' : r === 'Nachuntersuchung' ? 'hist-gelb' : ''}`}>
                <div className="hist-punkt" aria-hidden="true"></div>
                <div className="hist-inhalt">
                  <div className="hist-zeile1">
                    <strong>{fmtDatum(t.datum)}</strong>
                    {t.status === 'geplant' || t.status === 'bestaetigt'
                      ? <span className="badge high">geplant</span>
                      : r ? <span className={`badge ${r === 'Überschreitung erkannt' ? 'active' : 'medium'}`}>{r}</span> : null}
                    {abstand(i) && <span className="hint">▲ {abstand(i)} zuvor</span>}
                  </div>
                  {zug.map(a => (
                    <div key={a.id} className="hist-auftrag">
                      {a.unterauftraege.map(u => (
                        <span key={u.id} className="hist-unterauftrag">
                          <span className="nr">{nummerVoll(a, u)}</span> {ART_LABEL[u.art]}
                          {u.proben_ist != null && <> · {u.proben_ist} Proben</>}
                          {' '}<ErgebnisBadge s={u.ergebnis} />
                        </span>
                      ))}
                    </div>
                  ))}
                  {t.notizen && !t.notizen.startsWith('Historischer Termin') && <div className="hint">{t.notizen}</div>}
                </div>
              </div>
            )
          })}
          {eigene.length === 0 && <p className="hint" style={{ padding: '0 24px 12px' }}>Noch keine Untersuchungen erfasst.</p>}
        </div>
      </div>
    </div>
  )
}
