import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Auftrag, Auftragsstatus, Befund, BerichtStatus, Ergebnisstatus, FachlicheUntersuchungsart, Folgeentscheidung, Ueberschreitungsphase } from '../lib/types'
import { ART_LABEL, FACHLICHE_ART_LABEL, FOLGE_LABEL, STATUS_LABEL, nummerVoll } from '../lib/types'

type Zeile = {
  id: string; nummer: string; art: Auftrag['unterauftraege'][number]['art']; umfang?: string
  geplant?: number; ist?: number; status: Auftragsstatus; befund: Befund
  zaehltSauber: boolean; phaseId?: string; neuePhase: boolean
}

const BEFUND_OPTIONEN: Array<[Befund, string]> = [
  ['offen', 'unbekannt / nicht erfasst'],
  ['sauber', 'ohne Befund (= sauber)'],
  ['ueberschreitung', 'Überschreitung'],
]

/** Prüfbericht + fachlicher Befund je Unterauftrag. Eine Phase wird nur bewusst eröffnet. */
export default function BerichtModal({ auftrag, kundeKurz, bereichName, bereichId, onClose, onSaved }: {
  auftrag: Auftrag; kundeKurz?: string; bereichName?: string; bereichId: string
  onClose: () => void; onSaved: () => void
}) {
  const [zeilen, setZeilen] = useState<Zeile[]>(() => auftrag.unterauftraege.map(u => ({
    id: u.id, nummer: nummerVoll(auftrag, u), art: u.art, umfang: u.umfang,
    geplant: u.proben_geplant, ist: u.proben_ist ?? u.proben_geplant ?? undefined,
    status: (u.status === 'offen' || u.status === 'beprobt' ? 'abgeschlossen' : u.status) as Auftragsstatus,
    befund: u.ergebnis === 'unauffaellig' ? 'sauber' : u.ergebnis === 'ueberschritten' ? 'ueberschreitung' : 'offen',
    zaehltSauber: false, neuePhase: false,
  })))
  const [berichtStatus, setBerichtStatus] = useState<BerichtStatus>('geprueft')
  const [berichtNr, setBerichtNr] = useState('')
  const [berichtDatum, setBerichtDatum] = useState(new Date().toISOString().slice(0, 10))
  const [bemerkung, setBemerkung] = useState('')
  const [fachlicheArt, setFachlicheArt] = useState<FachlicheUntersuchungsart>(auftrag.fachliche_untersuchungsart ?? 'orientierend')
  const [folge, setFolge] = useState<Folgeentscheidung>('regelturnus_bleibt')
  const [phasen, setPhasen] = useState<Ueberschreitungsphase[]>([])
  const [laeuft, setLaeuft] = useState(false); const [fehler, setFehler] = useState('')

  useEffect(() => {
    Promise.all([db.bewertungenFuerUnterauftraege(auftrag.unterauftraege.map(u => u.id)), db.phasenFuerBereich(bereichId)])
      .then(([bewertungen, geladen]) => {
        setPhasen(geladen)
        setZeilen(vorher => vorher.map(z => {
          const b = bewertungen.find(x => x.unterauftrag_id === z.id)
          return b ? { ...z, befund: b.befund, phaseId: b.phase_id ?? undefined, zaehltSauber: b.zaehlt_als_saubere_nachuntersuchung } : z
        }))
        const erste = bewertungen[0]
        if (erste) {
          setBerichtStatus(erste.bericht_status); setBerichtNr(erste.pruefbericht_nummer ?? '')
          setBerichtDatum(erste.pruefbericht_datum ?? berichtDatum); setBemerkung(erste.bemerkung ?? '')
          setFolge(erste.folgeentscheidung ?? 'regelturnus_bleibt')
        }
      }).catch(e => setFehler(e.message ?? String(e)))
  }, [auftrag.id, bereichId])

  const aktivePhasen = useMemo(() => phasen.filter(p => !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status)), [phasen])
  const setZeile = (i: number, patch: Partial<Zeile>) => setZeilen(z => z.map((x, j) => j === i ? { ...x, ...patch } : x))
  const ergebnisZuBefund = (befund: Befund): Ergebnisstatus => befund === 'sauber' ? 'unauffaellig' : befund === 'ueberschreitung' ? 'ueberschritten' : 'offen'

  const speichern = async () => {
    setLaeuft(true); setFehler('')
    try {
      await db.auftragAktualisieren(auftrag.id, { fachliche_untersuchungsart: fachlicheArt })
      for (const z of zeilen) {
        await db.unterauftragAktualisieren(z.id, { proben_ist: z.ist, status: z.status, ergebnis: ergebnisZuBefund(z.befund) })
        const bewertung = await db.bewertungSpeichern({
          unterauftrag_id: z.id, bericht_status: berichtStatus, pruefbericht_nummer: berichtNr || undefined,
          pruefbericht_datum: berichtDatum || undefined, befund: z.befund, bewertungsdatum: berichtDatum || undefined,
          zaehlt_als_saubere_nachuntersuchung: z.befund === 'sauber' && z.zaehltSauber,
          phase_id: z.befund === 'sauber' && z.zaehltSauber ? z.phaseId : null,
          folgeentscheidung: folge,
          bemerkung: bemerkung || undefined,
        })
        if (z.neuePhase && z.befund === 'ueberschreitung') {
          await db.phaseAnlegen({
            bereich_id: bereichId, ausloesende_bewertung_id: bewertung.id, eroeffnet_am: berichtDatum,
            ausloeser: 'ueberschreitung', status: 'aktiv',
            saubere_nu_erforderlich: 3, notizen: berichtNr ? `Prüfbericht ${berichtNr}` : undefined,
          })
        }
      }
      onSaved(); onClose()
    } catch (e: any) { setFehler(e.message ?? String(e)); setLaeuft(false) }
  }

  return <div className="modal-hintergrund" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal" style={{ maxWidth: 860 }} role="dialog" aria-modal="true" aria-label={`Prüfbericht ${auftrag.auftragsnummer}`}>
      <div className="modal-kopf"><div><strong>Prüfbericht & Befund · <span className="nr">{auftrag.auftragsnummer}</span></strong><div className="hint">{[kundeKurz, bereichName].filter(Boolean).join(' · ')}</div></div><button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button></div>
      {fehler && <div className="notice" style={{ margin: '12px 24px 0' }}>{fehler}</div>}
      <div className="grid2" style={{ padding: '16px 24px 4px' }}>
        <label className="f">Untersuchungsart
          <select value={fachlicheArt} onChange={e => setFachlicheArt(e.target.value as FachlicheUntersuchungsart)}>
            {Object.entries(FACHLICHE_ART_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="f">Folgeentscheidung
          <select value={folge} onChange={e => setFolge(e.target.value as Folgeentscheidung)}>
            {Object.entries(FOLGE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="f">Prüfbericht-Nr.<input value={berichtNr} onChange={e => setBerichtNr(e.target.value)} placeholder="z. B. 26-002288" /></label>
        <label className="f">Berichtdatum<input type="date" value={berichtDatum} onChange={e => setBerichtDatum(e.target.value)} /></label>
        <label className="f">Berichtsstatus<select value={berichtStatus} onChange={e => setBerichtStatus(e.target.value as BerichtStatus)}><option value="ausstehend">ausstehend</option><option value="eingegangen">eingegangen</option><option value="geprueft">geprüft</option></select></label>
        <label className="f">Hinweis / Maßnahme<input value={bemerkung} onChange={e => setBemerkung(e.target.value)} placeholder="optional" /></label>
      </div>
      <div className="table-container" style={{ padding: '8px 12px' }}><table><thead><tr><th>Nr.</th><th>Art</th><th>Proben</th><th>Abschluss</th><th>Befund</th><th>Folge</th></tr></thead><tbody>
        {zeilen.map((z, i) => <tr key={z.id} className={z.befund === 'ueberschreitung' ? 'amp-red' : z.befund === 'sauber' ? 'amp-green' : 'amp-yellow'}>
          <td><span className="nr">{z.nummer}</span></td><td>{ART_LABEL[z.art]}{z.umfang && <div className="hint">{z.umfang}</div>}</td>
          <td><input type="number" min={0} style={{ width: 66 }} value={z.ist ?? ''} onChange={e => setZeile(i, { ist: e.target.value ? +e.target.value : undefined })} />{z.geplant != null && <span className="hint"> / {z.geplant}</span>}</td>
          <td><select value={z.status} onChange={e => setZeile(i, { status: e.target.value as Auftragsstatus })}>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
          <td><select value={z.befund} onChange={e => setZeile(i, { befund: e.target.value as Befund, neuePhase: false, zaehltSauber: false })}>{BEFUND_OPTIONEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
          <td>{z.befund === 'sauber' && aktivePhasen.length > 0 && <><label className="hint"><input type="checkbox" checked={z.zaehltSauber} onChange={e => setZeile(i, { zaehltSauber: e.target.checked, phaseId: e.target.checked ? (z.phaseId ?? aktivePhasen[0].id) : undefined })} /> zählt als NU ohne Befund</label>{z.zaehltSauber && <select value={z.phaseId ?? ''} onChange={e => setZeile(i, { phaseId: e.target.value })} style={{ maxWidth: 150, marginTop: 4 }}>{aktivePhasen.map(p => <option key={p.id} value={p.id}>{p.eroeffnet_am} · {p.status}</option>)}</select>}</>}{z.befund === 'ueberschreitung' && <label className="hint"><input type="checkbox" checked={z.neuePhase} onChange={e => setZeile(i, { neuePhase: e.target.checked })} /> neue Phase eröffnen</label>}</td>
        </tr>)}
      </tbody></table></div>
      {aktivePhasen.length > 0 && <p className="hint" style={{ padding: '0 24px' }}><i className="fas fa-triangle-exclamation" aria-hidden="true"></i> Aktive Phase(n): {aktivePhasen.map(p => `${p.eroeffnet_am} · ${p.status}`).join(' | ')}. Eine NU ohne Befund wird nur gezählt, wenn du sie ausdrücklich markierst.</p>}
      <p className="hint" style={{ padding: '0 24px' }}>Eine Überschreitung betrifft nur diesen Unterauftrag. Die neue Phase startet nur bei bewusster Auswahl; Standard sind später drei NUs ohne Befund oder eine frühere GA-Freigabe.</p>
      <div className="pm-fuss"><button className="primary" onClick={speichern} disabled={laeuft}><i className="fas fa-floppy-disk" aria-hidden="true"></i> {laeuft ? 'Wird gespeichert …' : 'Bericht speichern'}</button><button onClick={onClose}>Abbrechen</button></div>
    </div>
  </div>
}
