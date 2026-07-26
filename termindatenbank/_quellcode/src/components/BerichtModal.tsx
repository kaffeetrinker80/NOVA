import { useState } from 'react'
import { db } from '../lib/data'
import type { Auftrag, Auftragsstatus, Ergebnisstatus } from '../lib/types'
import { ART_LABEL, ERGEBNIS_LABEL, STATUS_LABEL, nummerVoll } from '../lib/types'

/** Prüfbericht erfassen: je Unterauftrag Ist-Probenzahl, Status und Ergebnis in einem Rutsch. */
export default function BerichtModal({ auftrag, kundeKurz, bereichName, onClose, onSaved }: {
  auftrag: Auftrag
  kundeKurz?: string
  bereichName?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [zeilen, setZeilen] = useState(() => auftrag.unterauftraege.map(u => ({
    id: u.id,
    nummer: nummerVoll(auftrag, u),
    art: u.art,
    umfang: u.umfang,
    geplant: u.proben_geplant,
    ist: u.proben_ist ?? u.proben_geplant ?? undefined,
    status: (u.status === 'offen' || u.status === 'beprobt' ? 'abgeschlossen' : u.status) as Auftragsstatus,
    ergebnis: u.ergebnis as Ergebnisstatus,
  })))
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')

  const setZeile = (i: number, patch: Partial<typeof zeilen[0]>) =>
    setZeilen(z => z.map((x, j) => j === i ? { ...x, ...patch } : x))

  const speichern = async () => {
    setLaeuft(true); setFehler('')
    try {
      for (const z of zeilen) {
        await db.unterauftragAktualisieren(z.id, {
          proben_ist: z.ist ?? undefined,
          status: z.status,
          ergebnis: z.ergebnis,
        } as any)
      }
      onSaved(); onClose()
    } catch (e: any) {
      setFehler(e.message ?? String(e)); setLaeuft(false)
    }
  }

  return (
    <div className="modal-hintergrund" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Bericht ${auftrag.auftragsnummer}`}>
        <div className="modal-kopf">
          <div>
            <strong>Prüfbericht erfassen · <span className="nr">{auftrag.auftragsnummer}</span></strong>
            <div className="hint">{[kundeKurz, bereichName].filter(Boolean).join(' · ')}</div>
          </div>
          <button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        {fehler && <div className="notice" style={{ margin: '12px 24px 0' }}>{fehler}</div>}

        <div className="table-container" style={{ padding: '8px 12px' }}>
          <table>
            <thead><tr><th>Nr.</th><th>Art</th><th>Proben (Ist)</th><th>Status</th><th>Ergebnis</th></tr></thead>
            <tbody>
              {zeilen.map((z, i) => (
                <tr key={z.id} className={z.ergebnis === 'ueberschritten' ? 'amp-red' : ''}>
                  <td><span className="nr">{z.nummer}</span></td>
                  <td>{ART_LABEL[z.art]}{z.umfang ? <div className="hint">{z.umfang}</div> : null}</td>
                  <td>
                    <input type="number" min={0} style={{ width: 72 }} value={z.ist ?? ''}
                      onChange={e => setZeile(i, { ist: e.target.value ? +e.target.value : undefined })} />
                    {z.geplant != null && <span className="hint"> / {z.geplant} geplant</span>}
                  </td>
                  <td>
                    <select value={z.status} onChange={e => setZeile(i, { status: e.target.value as Auftragsstatus })}>
                      {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={z.ergebnis} onChange={e => setZeile(i, { ergebnis: e.target.value as Ergebnisstatus })}>
                      {Object.entries(ERGEBNIS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ padding: '0 24px' }}>
          Eine Überschreitung gilt nur für den jeweiligen Unterauftrag – nicht automatisch für die ganze Anlage.
        </p>

        <div className="pm-fuss">
          <button className="primary" onClick={speichern} disabled={laeuft}>
            <i className="fas fa-floppy-disk" aria-hidden="true"></i> {laeuft ? 'Wird gespeichert …' : 'Bericht speichern'}
          </button>
          <button onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}
