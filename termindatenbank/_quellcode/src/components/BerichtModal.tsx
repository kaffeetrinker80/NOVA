import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type {
  Auftrag, Auftragsstatus, Befund, BerichtStatus, Ergebnisstatus,
  FachlicheUntersuchungsart, Folgeentscheidung, Ueberschreitungsphase,
} from '../lib/types'
import { ART_LABEL, FACHLICHE_ART_LABEL, FOLGE_LABEL, STATUS_LABEL, nummerVoll } from '../lib/types'

type Zeile = {
  id: string
  nummer: string
  art: Auftrag['unterauftraege'][number]['art']
  umfang?: string
  geplant?: number
  ist?: number
  status: Auftragsstatus
  berichtStatus: BerichtStatus
  berichtNr: string
  berichtDatum: string
  befund: Befund
  bemerkung: string
  folge: Folgeentscheidung
  zaehltSauber: boolean
  phaseId?: string
  neuePhase: boolean
}

const heute = new Date().toISOString().slice(0, 10)
const BEFUND_OPTIONEN: Array<[Befund, string]> = [
  ['offen', 'unbekannt / nicht erfasst'],
  ['sauber', 'ohne Befund (= sauber)'],
  ['ueberschreitung', 'Überschreitung'],
]
const ABSCHLUSS_STATUS: Auftragsstatus[] = ['offen', 'abgeschlossen', 'storniert']

/** Prüfbericht und Befund werden je Unterauftrag getrennt gespeichert. */
export default function BerichtModal({ auftrag, kundeKurz, bereichName, bereichId, onClose, onSaved }: {
  auftrag: Auftrag
  kundeKurz?: string
  bereichName?: string
  bereichId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [zeilen, setZeilen] = useState<Zeile[]>(() => auftrag.unterauftraege.map(u => ({
    id: u.id,
    nummer: nummerVoll(auftrag, u),
    art: u.art,
    umfang: u.umfang,
    geplant: u.proben_geplant,
    ist: u.proben_ist ?? u.proben_geplant ?? undefined,
    status: (['beprobt', 'im_labor'].includes(u.status) ? 'offen' : u.status) as Auftragsstatus,
    berichtStatus: 'geprueft',
    berichtNr: '',
    berichtDatum: heute,
    befund: u.ergebnis === 'unauffaellig' ? 'sauber' : u.ergebnis === 'ueberschritten' ? 'ueberschreitung' : 'offen',
    bemerkung: '',
    folge: 'regelturnus_bleibt',
    zaehltSauber: false,
    neuePhase: false,
  })))
  const [fachlicheArt, setFachlicheArt] = useState<FachlicheUntersuchungsart>(auftrag.fachliche_untersuchungsart ?? 'orientierend')
  const [phasen, setPhasen] = useState<Ueberschreitungsphase[]>([])
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')

  useEffect(() => {
    Promise.all([
      db.bewertungenFuerUnterauftraege(auftrag.unterauftraege.map(u => u.id)),
      db.phasenFuerBereich(bereichId),
    ]).then(([bewertungen, geladen]) => {
      setPhasen(geladen)
      setZeilen(vorher => vorher.map(z => {
        const b = bewertungen.find(x => x.unterauftrag_id === z.id)
        return b ? {
          ...z,
          berichtStatus: b.bericht_status,
          berichtNr: b.pruefbericht_nummer ?? '',
          berichtDatum: b.pruefbericht_datum ?? heute,
          befund: b.befund,
          bemerkung: b.bemerkung ?? '',
          folge: b.folgeentscheidung ?? 'regelturnus_bleibt',
          phaseId: b.phase_id ?? undefined,
          zaehltSauber: b.zaehlt_als_saubere_nachuntersuchung,
        } : z
      }))
    }).catch(e => setFehler(e.message ?? String(e)))
  }, [auftrag.id, bereichId])

  const hatLegionellen = zeilen.some(z => z.art === 'legionellen' && z.status !== 'storniert')
  const aktivePhasen = useMemo(
    () => phasen.filter(p => !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status)),
    [phasen],
  )
  const setZeile = (i: number, patch: Partial<Zeile>) =>
    setZeilen(z => z.map((x, j) => j === i ? { ...x, ...patch } : x))
  const ergebnisZuBefund = (befund: Befund): Ergebnisstatus =>
    befund === 'sauber' ? 'unauffaellig' : befund === 'ueberschreitung' ? 'ueberschritten' : 'offen'

  const speichern = async () => {
    setLaeuft(true)
    setFehler('')
    try {
      if (hatLegionellen) {
        await db.auftragAktualisieren(auftrag.id, { fachliche_untersuchungsart: fachlicheArt })
      }
      for (const z of zeilen) {
        if (z.status === 'storniert') continue
        await db.unterauftragAktualisieren(z.id, {
          proben_ist: z.ist,
          status: z.status,
          ergebnis: ergebnisZuBefund(z.befund),
        })
        const istLegionellen = z.art === 'legionellen'
        const bewertung = await db.bewertungSpeichern({
          unterauftrag_id: z.id,
          bericht_status: z.berichtStatus,
          pruefbericht_nummer: z.berichtNr || undefined,
          pruefbericht_datum: z.berichtDatum || undefined,
          befund: z.befund,
          bewertungsdatum: z.berichtDatum || undefined,
          zaehlt_als_saubere_nachuntersuchung: istLegionellen && z.befund === 'sauber' && z.zaehltSauber,
          phase_id: istLegionellen && z.befund === 'sauber' && z.zaehltSauber ? z.phaseId : null,
          folgeentscheidung: istLegionellen ? z.folge : undefined,
          bemerkung: z.bemerkung || undefined,
        })
        if (istLegionellen && z.neuePhase && z.befund === 'ueberschreitung') {
          await db.phaseAnlegen({
            bereich_id: bereichId,
            ausloesende_bewertung_id: bewertung.id,
            eroeffnet_am: z.berichtDatum || heute,
            ausloeser: 'ueberschreitung',
            status: 'aktiv',
            saubere_nu_erforderlich: 3,
            notizen: z.berichtNr ? `Prüfbericht ${z.berichtNr}` : undefined,
          })
        }
      }
      onSaved()
      onClose()
    } catch (e: any) {
      setFehler(e.message ?? String(e))
      setLaeuft(false)
    }
  }

  return <div className="modal-hintergrund" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal bericht-modal" role="dialog" aria-modal="true" aria-label={`Prüfberichte ${auftrag.auftragsnummer}`}>
      <div className="modal-kopf">
        <div>
          <strong>Prüfberichte & Befunde · <span className="nr">{auftrag.auftragsnummer}</span></strong>
          <div className="hint">{[kundeKurz, bereichName].filter(Boolean).join(' · ')}</div>
        </div>
        <button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button>
      </div>

      {fehler && <div className="notice" style={{ margin: '12px 24px 0' }}>{fehler}</div>}

      {hatLegionellen && <div className="bericht-legio-art">
        <label className="f">Fachliche Legionellen-Untersuchungsart
          <select value={fachlicheArt} onChange={e => setFachlicheArt(e.target.value as FachlicheUntersuchungsart)}>
            {Object.entries(FACHLICHE_ART_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <span className="hint">Diese Einordnung steuert ausschließlich den Legionellen-Verlauf.</span>
      </div>}

      <div className="bericht-karten">
        {zeilen.map((z, i) => {
          const istLegionellen = z.art === 'legionellen'
          const storniert = z.status === 'storniert'
          return <section key={z.id} className={`bericht-karte ${storniert ? 'unterauftrag-storniert' : z.befund === 'ueberschreitung' ? 'bericht-rot' : z.befund === 'sauber' ? 'bericht-gruen' : 'bericht-gelb'}`}>
            <div className="bericht-karte-kopf">
              <div><span className="nr">{z.nummer}</span> <strong>{ART_LABEL[z.art]}</strong>{z.umfang && <span className="hint"> · {z.umfang}</span>}</div>
              {storniert && <span className="badge neutral">nicht durchgeführt</span>}
            </div>
            {!storniert && <>
              <div className="bericht-felder">
                <label className="f">Prüfbericht-Nr.<input value={z.berichtNr} onChange={e => setZeile(i, { berichtNr: e.target.value })} placeholder="z. B. 26-002288" /></label>
                <label className="f">Prüfbericht-Datum<input type="date" value={z.berichtDatum} onChange={e => setZeile(i, { berichtDatum: e.target.value })} /></label>
                <label className="f">Berichtsstatus<select value={z.berichtStatus} onChange={e => setZeile(i, { berichtStatus: e.target.value as BerichtStatus })}><option value="ausstehend">ausstehend</option><option value="eingegangen">eingegangen</option><option value="geprueft">geprüft</option></select></label>
                <label className="f">Abschluss<select value={z.status} onChange={e => setZeile(i, { status: e.target.value as Auftragsstatus })}>{ABSCHLUSS_STATUS.filter(v => v !== 'storniert').map(v => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}</select></label>
                <label className="f">Proben Ist / geplant<div className="bericht-proben"><input type="number" min={0} value={z.ist ?? ''} onChange={e => setZeile(i, { ist: e.target.value ? +e.target.value : undefined })} /><span>/ {z.geplant ?? '–'}</span></div></label>
                <label className="f">Befund<select value={z.befund} onChange={e => setZeile(i, { befund: e.target.value as Befund, neuePhase: false, zaehltSauber: false })}>{BEFUND_OPTIONEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              </div>
              <label className="f">Hinweis / Maßnahme<textarea rows={2} value={z.bemerkung} onChange={e => setZeile(i, { bemerkung: e.target.value })} placeholder={`Bemerkung nur zu ${z.nummer}`} /></label>

              {istLegionellen && <div className="bericht-folge">
                <label className="f">Folgeentscheidung
                  <select value={z.folge} onChange={e => setZeile(i, { folge: e.target.value as Folgeentscheidung })}>
                    {Object.entries(FOLGE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                {z.befund === 'sauber' && aktivePhasen.length > 0 && <div>
                  <label className="hint"><input type="checkbox" checked={z.zaehltSauber} onChange={e => setZeile(i, { zaehltSauber: e.target.checked, phaseId: e.target.checked ? (z.phaseId ?? aktivePhasen[0].id) : undefined })} /> {fachlicheArt === 'weitergehend'
                    ? 'vom Gesundheitsamt als saubere NU anerkannt'
                    : fachlicheArt === 'nachuntersuchung'
                      ? 'als saubere Nachuntersuchung zählen'
                      : 'vom Gesundheitsamt als saubere NU anerkannt'}</label>
                  {z.zaehltSauber && <select value={z.phaseId ?? ''} onChange={e => setZeile(i, { phaseId: e.target.value })}>{aktivePhasen.map(p => <option key={p.id} value={p.id}>{p.eroeffnet_am} · {p.status}</option>)}</select>}
                </div>}
                {z.befund === 'ueberschreitung' && <label className="hint"><input type="checkbox" checked={z.neuePhase} onChange={e => setZeile(i, { neuePhase: e.target.checked })} /> neue Überschreitungsphase eröffnen</label>}
              </div>}
              {!istLegionellen && <div className="hint bericht-trennung"><i className="fas fa-circle-info" aria-hidden="true"></i> Dieser Befund bleibt separat und verändert weder Legionellen-Turnus noch NU-Phase.</div>}
            </>}
          </section>
        })}
      </div>

      {aktivePhasen.length > 0 && <p className="hint" style={{ padding: '0 24px' }}><i className="fas fa-triangle-exclamation" aria-hidden="true"></i> Aktive Phase(n): {aktivePhasen.map(p => `${p.eroeffnet_am} · ${p.status}`).join(' | ')}. Eine saubere NU wird nur nach ausdrücklicher Markierung gezählt.</p>}
      <div className="pm-fuss"><button className="primary" onClick={speichern} disabled={laeuft}><i className="fas fa-floppy-disk" aria-hidden="true"></i> {laeuft ? 'Wird gespeichert …' : 'Berichte speichern'}</button><button onClick={onClose}>Abbrechen</button></div>
    </div>
  </div>
}
