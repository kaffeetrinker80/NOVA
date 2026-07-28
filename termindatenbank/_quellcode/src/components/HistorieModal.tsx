import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type {
  Anlage, Auftrag, Befund, Bereich, FachlicheUntersuchungsart, HistorieEinordnung,
  Kunde, Termin, Ueberschreitungsphase,
} from '../lib/types'
import {
  ART_LABEL, BEFUND_LABEL, FACHLICHE_ART_LABEL, HISTORIE_EINORDNUNG_LABEL,
  fmtDatum, kundeAnzeige, nummerVoll,
} from '../lib/types'
import { ErgebnisBadge } from './ui'

const heute = new Date().toISOString().slice(0, 10)
const turnusText = (m?: number) => m === 3 ? '3 Monate' : m === 12 ? '1 Jahr' : m === 36 ? '3 Jahre' : m ? `${m} Monate` : '–'

type Entwurf = {
  datum: string
  fachliche_untersuchungsart: FachlicheUntersuchungsart | ''
  historie_einordnung: HistorieEinordnung
  befund: Befund
  pruefbericht_nummer: string
  pruefbericht_datum: string
  historie_bemerkung: string
}

const leer: Entwurf = {
  datum: heute,
  fachliche_untersuchungsart: '',
  historie_einordnung: 'unbekannt',
  befund: 'offen',
  pruefbericht_nummer: '',
  pruefbericht_datum: '',
  historie_bemerkung: '',
}

function ausTermin(t: Termin): Entwurf {
  return {
    datum: t.datum,
    fachliche_untersuchungsart: t.fachliche_untersuchungsart ?? '',
    historie_einordnung: t.historie_einordnung ?? 'unbekannt',
    befund: t.befund ?? 'offen',
    pruefbericht_nummer: t.pruefbericht_nummer ?? '',
    pruefbericht_datum: t.pruefbericht_datum ?? '',
    historie_bemerkung: t.historie_bemerkung ?? '',
  }
}

export default function HistorieModal({ anlage, kunde, termine, auftraege, bereiche, nurBereich, onClose, onSaved }: {
  anlage: Anlage
  kunde?: Kunde
  termine: Termin[]
  auftraege: Auftrag[]
  bereiche: Bereich[]
  nurBereich?: string
  onClose: () => void
  onSaved?: () => void
}) {
  const bereich = bereiche.find(b => b.id === nurBereich)
  const [phasen, setPhasen] = useState<Ueberschreitungsphase[]>([])
  const [bearbeite, setBearbeite] = useState<string | 'neu' | null>(null)
  const [entwurf, setEntwurf] = useState<Entwurf>(leer)
  const [meldung, setMeldung] = useState('')

  useEffect(() => {
    if (!bereich) return
    db.phasenFuerBereich(bereich.id).then(setPhasen).catch(() => setPhasen([]))
  }, [bereich?.id])

  const auftragTerminIds = useMemo(() => new Set(auftraege.filter(a => a.bereich_id === bereich?.id && a.termin_id).map(a => a.termin_id)), [auftraege, bereich?.id])
  const eigene = useMemo(() => termine.filter(t =>
    t.status !== 'abgesagt' && t.anlage_id === anlage.id &&
    (t.bereich_id === bereich?.id || auftragTerminIds.has(t.id) || (!t.bereich_id && bereiche.filter(b => b.anlage_id === anlage.id).length === 1)),
  ).sort((a, b) => b.datum.localeCompare(a.datum)), [termine, anlage.id, bereich?.id, bereiche, auftragTerminIds])
  const eigeneAuftraege = useMemo(() => auftraege.filter(a => a.bereich_id === bereich?.id), [auftraege, bereich?.id])
  const abgeschlossen = eigene.filter(t => t.datum <= heute)
  const naechster = eigene.filter(t => t.datum > heute).sort((a, b) => a.datum.localeCompare(b.datum))[0]
  const offenePhase = phasen.find(p => !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status))
  const letzte = abgeschlossen[0]

  const editieren = (t: Termin) => {
    setBearbeite(t.id)
    setEntwurf(ausTermin(t))
    setMeldung('')
  }
  const neu = () => {
    setBearbeite('neu')
    setEntwurf(leer)
    setMeldung('')
  }
  const speichern = async () => {
    if (!bereich || !entwurf.datum) return
    const patch = {
      datum: entwurf.datum,
      status: 'abgeschlossen' as const,
      fachliche_untersuchungsart: entwurf.fachliche_untersuchungsart || undefined,
      historie_einordnung: entwurf.historie_einordnung,
      befund: entwurf.befund,
      pruefbericht_nummer: entwurf.pruefbericht_nummer || undefined,
      pruefbericht_datum: entwurf.pruefbericht_datum || undefined,
      historie_bemerkung: entwurf.historie_bemerkung || undefined,
    }
    try {
      if (bearbeite === 'neu') {
        await db.terminAnlegen({
          kunde_id: anlage.kunde_id, anlage_id: anlage.id, bereich_id: bereich.id,
          ...patch, notizen: 'Historischer Termin manuell nacherfasst',
        })
      } else if (bearbeite) {
        await db.terminAktualisieren(bearbeite, patch)
      }
      setMeldung('Historieneintrag gespeichert.')
      setBearbeite(null)
      onSaved?.()
    } catch (e: any) {
      setMeldung('Fehler: ' + (e.message ?? e))
    }
  }
  const loeschen = async (t: Termin) => {
    const hatAuftrag = eigeneAuftraege.some(a => a.termin_id === t.id)
    if (hatAuftrag) {
      setMeldung('Dieser Termin ist mit einem Auftrag verbunden. Bitte zuerst den Auftrag fachlich bereinigen; der Termin wurde nicht gelöscht.')
      return
    }
    if (!window.confirm(`Historieneintrag vom ${fmtDatum(t.datum)} dauerhaft löschen?`)) return
    try {
      await db.terminLoeschen(t.id)
      setMeldung('Historieneintrag gelöscht.')
      onSaved?.()
    } catch (e: any) {
      setMeldung('Fehler: ' + (e.message ?? e))
    }
  }

  if (!bereich) return <div className="modal-hintergrund">
    <div className="modal historie-modal">
      <div className="modal-kopf"><strong>Bereichshistorie</strong><button className="modal-schliessen" onClick={onClose}>×</button></div>
      <div className="notice">Bitte einen einzelnen Bereich/WWB öffnen. Eine Gesamt-Historie über mehrere Bereiche wird fachlich nicht gebildet.</div>
    </div>
  </div>

  const auftragZumTermin = (id: string) => eigeneAuftraege.filter(a => a.termin_id === id)
  const statusText = offenePhase
    ? `Aktive Phase · ${offenePhase.status.replace(/_/g, ' ')}`
    : `Regelturnus · nächste Untersuchung ${fmtDatum(bereich.naechste_untersuchung ?? naechster?.datum)}`

  return <div className="modal-hintergrund" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal historie-modal" role="dialog" aria-modal="true" aria-label={`Untersuchungsverlauf ${bereich.name}`}>
      <div className="modal-kopf">
        <div>
          <strong><i className="fas fa-clock-rotate-left" aria-hidden="true"></i> {anlage.name} › {bereich.name}</strong>
          <div className="hint">{kundeAnzeige(kunde)} · Bereichsturnus: {turnusText(bereich.turnus_monate)}</div>
        </div>
        <button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button>
      </div>

      {meldung && <div className="notice" style={{ margin: '12px 20px 0' }}>{meldung}</div>}
      <div className={`hist-status ${offenePhase ? 'aktiv' : ''}`}>
        <i className={`fas ${offenePhase ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} aria-hidden="true"></i>
        {statusText}
      </div>
      <div className="hist-kennzahlen">
        <div><span>Letzte Untersuchung</span><strong>{fmtDatum(letzte?.datum)}</strong></div>
        <div><span>Letztes Ergebnis</span><strong>{letzte?.befund ? BEFUND_LABEL[letzte.befund] : 'noch ungeklärt'}</strong></div>
        <div><span>Einträge</span><strong>{abgeschlossen.length}</strong></div>
      </div>

      <div className="hist-werkzeuge">
        <button className="primary" onClick={neu}><i className="fas fa-plus" aria-hidden="true"></i> Historieneintrag nacherfassen</button>
        <span className="hint">Datum, Untersuchungsart, Befund und Prüfbericht sind direkt korrigierbar.</span>
      </div>

      {bearbeite && <div className="hist-editor">
        <strong>{bearbeite === 'neu' ? 'Historieneintrag hinzufügen' : 'Historieneintrag bearbeiten'}</strong>
        <div className="grid2">
          <label className="f">Untersuchungsdatum<input type="date" value={entwurf.datum} onChange={e => setEntwurf({ ...entwurf, datum: e.target.value })} /></label>
          <label className="f">Untersuchungsart
            <select value={entwurf.fachliche_untersuchungsart} onChange={e => setEntwurf({ ...entwurf, fachliche_untersuchungsart: e.target.value as FachlicheUntersuchungsart | '' })}>
              <option value="">noch nicht erfasst</option>
              {Object.entries(FACHLICHE_ART_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="f">Fachliche Herkunft
            <select value={entwurf.historie_einordnung} onChange={e => setEntwurf({ ...entwurf, historie_einordnung: e.target.value as HistorieEinordnung })}>
              {Object.entries(HISTORIE_EINORDNUNG_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="f">Befund / Ergebnis
            <select value={entwurf.befund} onChange={e => setEntwurf({ ...entwurf, befund: e.target.value as Befund })}>
              {Object.entries(BEFUND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="f">Prüfbericht-Nr.<input value={entwurf.pruefbericht_nummer} onChange={e => setEntwurf({ ...entwurf, pruefbericht_nummer: e.target.value })} /></label>
          <label className="f">Prüfbericht-Datum<input type="date" value={entwurf.pruefbericht_datum} onChange={e => setEntwurf({ ...entwurf, pruefbericht_datum: e.target.value })} /></label>
        </div>
        <label className="f">Fachliche Bemerkung<textarea rows={2} value={entwurf.historie_bemerkung} onChange={e => setEntwurf({ ...entwurf, historie_bemerkung: e.target.value })} /></label>
        <div className="hist-editor-aktionen">
          <button className="primary" onClick={speichern}><i className="fas fa-floppy-disk"></i> Speichern</button>
          <button onClick={() => setBearbeite(null)}>Abbrechen</button>
        </div>
      </div>}

      <div className="hist-liste">
        {abgeschlossen.map(t => {
          const zug = auftragZumTermin(t.id)
          return <div key={t.id} className={`hist-eintrag ${t.befund === 'ueberschreitung' ? 'hist-start hist-befund-rot' : t.befund === 'sauber' ? 'hist-befund-gruen' : 'hist-befund-gelb'}`}>
            <div className="hist-punkt" aria-hidden="true"></div>
            <div className="hist-inhalt">
              <div className="hist-zeile1">
                <strong>{fmtDatum(t.datum)}</strong>
                <span className="hist-zeilenaktionen">
                  <button className="zeile-btn" onClick={() => editieren(t)}><i className="fas fa-pen"></i> Bearbeiten</button>
                  <button className="zeile-btn danger" onClick={() => loeschen(t)}><i className="fas fa-trash-can"></i></button>
                </span>
              </div>
              <div className="hist-rolle">{t.fachliche_untersuchungsart ? FACHLICHE_ART_LABEL[t.fachliche_untersuchungsart] : 'Untersuchungsart noch nicht erfasst'}</div>
              <div className="hist-fachdaten">
                <span>{t.befund ? BEFUND_LABEL[t.befund] : 'Ergebnis noch nicht erfasst'}</span>
                {t.pruefbericht_nummer && <span>Prüfbericht {t.pruefbericht_nummer}</span>}
                {t.pruefbericht_datum && <span>vom {fmtDatum(t.pruefbericht_datum)}</span>}
              </div>
              {(t.historie_einordnung ?? 'unbekannt') !== 'regulaer' &&
                <div className="badge medium">{HISTORIE_EINORDNUNG_LABEL[t.historie_einordnung ?? 'unbekannt']}</div>}
              {t.historie_bemerkung && <div className="hint">{t.historie_bemerkung}</div>}
              {zug.map(a => <div key={a.id} className="hist-auftrag">
                {a.unterauftraege.map(u => <span key={u.id} className="hist-unterauftrag">
                  <span className="nr">{nummerVoll(a, u)}</span> {ART_LABEL[u.art]}
                  {u.proben_ist != null && <> · {u.proben_ist} Proben</>} <ErgebnisBadge s={u.ergebnis} />
                </span>)}
              </div>)}
            </div>
          </div>
        })}
        {abgeschlossen.length === 0 && <p className="hint">Noch keine Untersuchungen erfasst.</p>}
      </div>
    </div>
  </div>
}
