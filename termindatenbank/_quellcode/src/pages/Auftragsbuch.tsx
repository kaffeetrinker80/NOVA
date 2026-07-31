import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Auftrag, Bereich, FachlicheUntersuchungsart, Kunde, Stornogrund, Termin, Untersuchungsart, Unterauftrag } from '../lib/types'
import { ART_LABEL, ERGEBNIS_LABEL, FACHLICHE_ART_LABEL, STATUS_LABEL, STORNOGRUND_LABEL, fmtDatum, nummerVoll, kundeAnzeige } from '../lib/types'
import { Abschnitt, ErgebnisBadge, Nr, StatusBadge } from '../components/ui'
import BerichtModal from '../components/BerichtModal'

const ERGAENZBARE_ARTEN: Untersuchungsart[] = ['legionellen', 'mibi', 'chemie']
const NACHERFASSBARE_ARTEN: Untersuchungsart[] = ['legionellen', 'mibi', 'chemie', 'vorortparameter']
const ART_SUFFIX: Record<Untersuchungsart, string> = {
  legionellen: '', mibi: 'M', chemie: 'C', vorortparameter: 'V', sonstiges: 'S',
}

function UnterauftragErgaenzenModal({ auftrag, onClose, onSaved }: {
  auftrag: Auftrag
  onClose: () => void
  onSaved: (nummer: string) => void
}) {
  const fehlendeArten = ERGAENZBARE_ARTEN.filter(art =>
    !auftrag.unterauftraege.some(u => u.art === art),
  )
  const [art, setArt] = useState<Untersuchungsart>(fehlendeArten[0] ?? 'mibi')
  const [umfang, setUmfang] = useState('')
  const [proben, setProben] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')

  const suffix = art === 'mibi'
    ? 'M'
    : art === 'chemie'
      ? 'C'
      : auftrag.unterauftraege.some(u => u.suffix === '') ? 'L' : ''
  const nummer = suffix ? `${auftrag.auftragsnummer}-${suffix}` : auftrag.auftragsnummer

  const speichern = async () => {
    setLaeuft(true)
    setFehler('')
    try {
      const neueNummer = await db.unterauftragHinzufuegen(
        auftrag.id,
        art,
        umfang,
        proben ? Number(proben) : undefined,
      )
      onSaved(neueNummer)
    } catch (e: any) {
      setFehler(e.message ?? String(e))
    } finally {
      setLaeuft(false)
    }
  }

  return <div className="modal-hintergrund" onMouseDown={e => {
    if (e.target === e.currentTarget) onClose()
  }}>
    <div className="modal unterauftrag-modal" role="dialog" aria-modal="true"
      aria-label={`Untersuchungsanteil zu ${auftrag.auftragsnummer} ergänzen`}>
      <div className="modal-kopf">
        <div>
          <strong>Untersuchungsanteil ergänzen · <span className="nr">{auftrag.auftragsnummer}</span></strong>
          <div className="hint">Die Hauptnummer bleibt bestehen; es wird keine neue laufende Nummer verbraucht.</div>
        </div>
        <button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button>
      </div>

      <div className="unterauftrag-inhalt">
        <div className="unterauftrag-vorhanden">
          <span className="hint">Bereits vorhanden:</span>
          {auftrag.unterauftraege.map(u =>
            <span className="badge neutral" key={u.id}>{nummerVoll(auftrag, u)} · {ART_LABEL[u.art]}</span>,
          )}
        </div>

        {fehlendeArten.length ? <>
          <div className="grid2">
            <label className="f">Untersuchungsart
              <select value={art} onChange={e => {
                setArt(e.target.value as Untersuchungsart)
                setUmfang('')
              }}>
                {fehlendeArten.map(v => <option key={v} value={v}>{ART_LABEL[v]}</option>)}
              </select>
            </label>
            <label className="f">Neue Nummer
              <input value={nummer} readOnly className="unterauftrag-nummer" />
            </label>
            <label className="f">Geplante Probenzahl
              <input type="number" min="1" value={proben}
                onChange={e => setProben(e.target.value)} placeholder="optional" />
            </label>
            {art === 'mibi' && <label className="f">Mibi-Umfang
              <input list="mibi-umfang-werte" value={umfang}
                onChange={e => setUmfang(e.target.value)} placeholder="optional auswählen oder eingeben" />
              <datalist id="mibi-umfang-werte">
                <option value="Standard" />
                <option value="Komplett" />
                <option value="inklusive Enterokokken" />
              </datalist>
            </label>}
          </div>
          <p className="notice unterauftrag-hinweis">
            Der neue Anteil startet mit Status <strong>offen</strong> und Befund <strong>nicht erfasst</strong>.
            Prüfbericht und Ergebnis können anschließend getrennt bearbeitet werden.
          </p>
          {fehler && <p className="notice">{fehler}</p>}
        </> : <p className="notice">Legionellen, Mibi und Chemie sind bei diesem Auftrag bereits angelegt.</p>}
      </div>

      <div className="pm-fuss">
        <button onClick={onClose}>Abbrechen</button>
        {fehlendeArten.length > 0 && <button className="primary" onClick={speichern}
          disabled={laeuft || (!!proben && Number(proben) < 1)}>
          <i className="fas fa-plus" aria-hidden="true"></i>
          {laeuft ? 'Wird ergänzt …' : `${ART_LABEL[art]} als ${nummer} ergänzen`}
        </button>}
      </div>
    </div>
  </div>
}

function UnterauftragVerwaltenModal({ auftrag, unterauftrag, onClose, onSaved }: {
  auftrag: Auftrag
  unterauftrag: Unterauftrag
  onClose: () => void
  onSaved: (meldung: string) => void
}) {
  const [grund, setGrund] = useState<Stornogrund>('dezentral')
  const [umfang, setUmfang] = useState(unterauftrag.umfang ?? '')
  const [probenGeplant, setProbenGeplant] = useState(unterauftrag.proben_geplant?.toString() ?? '')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')
  const nummer = nummerVoll(auftrag, unterauftrag)
  const leerUndLoeschbar = !!unterauftrag.suffix
    && unterauftrag.ergebnis === 'offen'
    && ['offen', 'storniert'].includes(unterauftrag.status)
    && (unterauftrag.proben_ist ?? 0) === 0

  const stammdatenSpeichern = async () => {
    setLaeuft(true); setFehler('')
    try {
      await db.unterauftragAktualisieren(unterauftrag.id, {
        umfang: umfang.trim() || null,
        proben_geplant: probenGeplant ? Number(probenGeplant) : null,
      })
      onSaved(`${nummer}: Umfang und geplante Probenzahl wurden gespeichert.`)
    } catch (e: any) {
      setFehler(e.message ?? String(e)); setLaeuft(false)
    }
  }
  const stornieren = async () => {
    setLaeuft(true); setFehler('')
    try {
      onSaved(await db.unterauftragStornieren(unterauftrag.id, grund))
    } catch (e: any) {
      setFehler(e.message ?? String(e)); setLaeuft(false)
    }
  }
  const loeschen = async () => {
    if (!window.confirm(
      `${nummer} wirklich löschen?\n\nDas geht nur, wenn noch keine Probe, Bewertung oder kein Befund gespeichert wurde.`,
    )) return
    setLaeuft(true); setFehler('')
    try {
      onSaved(await db.unterauftragLoeschen(unterauftrag.id))
    } catch (e: any) {
      setFehler(e.message ?? String(e)); setLaeuft(false)
    }
  }

  return <div className="modal-hintergrund" onMouseDown={e => {
    if (e.target === e.currentTarget) onClose()
  }}>
    <div className="modal unterauftrag-modal" role="dialog" aria-modal="true"
      aria-label={`Unterbericht ${nummer} verwalten`}>
      <div className="modal-kopf">
        <div>
          <strong>Unterbericht verwalten · <span className="nr">{nummer}</span></strong>
          <div className="hint">{ART_LABEL[unterauftrag.art]}</div>
        </div>
        <button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button>
      </div>
      <div className="unterauftrag-inhalt">
        <div className="grid2">
          <label className="f">Geplante Probenzahl
            <input type="number" min="1" value={probenGeplant}
              onChange={e => setProbenGeplant(e.target.value)} placeholder="nicht erfasst" />
          </label>
          <label className="f">Umfang / Variante
            <input value={umfang} onChange={e => setUmfang(e.target.value)}
              placeholder={unterauftrag.art === 'mibi' ? 'z. B. inklusive Enterokokken' : 'optional'} />
          </label>
        </div>
        <button onClick={stammdatenSpeichern} disabled={laeuft || (!!probenGeplant && Number(probenGeplant) < 1)}>
          <i className="fas fa-floppy-disk" aria-hidden="true"></i> Angaben speichern
        </button>

        <div className="unterauftrag-storno">
          <strong>Untersuchungsanteil nicht durchgeführt</strong>
          {unterauftrag.status === 'storniert'
            ? <p className="notice unterauftrag-hinweis">
                Bereits storniert: {unterauftrag.storno_grund
                  ? STORNOGRUND_LABEL[unterauftrag.storno_grund] : 'Grund nicht erfasst'}
              </p>
            : <>
                <label className="f">Grund
                  <select value={grund} onChange={e => setGrund(e.target.value as Stornogrund)}>
                    {Object.entries(STORNOGRUND_LABEL).map(([v, l]) =>
                      <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <button className="secondary" onClick={stornieren} disabled={laeuft || unterauftrag.ergebnis !== 'offen'}>
                  <i className="fas fa-ban" aria-hidden="true"></i> Unterbericht stornieren
                </button>
              </>}
        </div>

        {leerUndLoeschbar && <div className="unterauftrag-loeschen">
          <span className="hint">Nur leere Unterberichte mit Suffix können vollständig entfernt werden.</span>
          <button className="danger" onClick={loeschen} disabled={laeuft}>
            <i className="fas fa-trash" aria-hidden="true"></i> {nummer} löschen
          </button>
        </div>}
        {fehler && <p className="notice">{fehler}</p>}
      </div>
      <div className="pm-fuss"><button onClick={onClose}>Schließen</button></div>
    </div>
  </div>
}

export default function Auftragsbuch() {
  const [auftraege, setAuftraege] = useState<Auftrag[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [termine, setTermine] = useState<Termin[]>([])
  const [suche, setSuche] = useState('')
  const [fJahr, setFJahr] = useState(''); const [fKunde, setFKunde] = useState('')
  const [fArt, setFArt] = useState(''); const [fStatus, setFStatus] = useState('')
  const [fErgebnis, setFErgebnis] = useState('')
  const [bearbeite, setBearbeite] = useState<string | null>(null)

  // ── Eigenständige Nummern-Vergabe ──
  const [nvOffen, setNvOffen] = useState(false)
  const [nvVorschau, setNvVorschau] = useState('…')
  const [nvKunde, setNvKunde] = useState('')
  const [nvAnlage, setNvAnlage] = useState('')
  const [nvBereich, setNvBereich] = useState('')
  const [nvTermin, setNvTermin] = useState('')
  const [nvArten, setNvArten] = useState<Partial<Record<Untersuchungsart, boolean>>>({
    legionellen: true, mibi: false, chemie: false, vorortparameter: false,
  })
  const [nvProben, setNvProben] = useState<Partial<Record<Untersuchungsart, string>>>({})
  const [nvMibiUmfang, setNvMibiUmfang] = useState('Standard')
  const [nvFachArt, setNvFachArt] = useState<FachlicheUntersuchungsart>('orientierend')
  const [nvManuell, setNvManuell] = useState(false)
  const [nvNummer, setNvNummer] = useState('')
  const [nvMeldung, setNvMeldung] = useState('')
  const [berichtAuftrag, setBerichtAuftrag] = useState<Auftrag | null>(null)
  const [ergaenzeAuftrag, setErgaenzeAuftrag] = useState<Auftrag | null>(null)
  const [verwalteUnterauftrag, setVerwalteUnterauftrag] = useState<{ auftrag: Auftrag; unterauftrag: Unterauftrag } | null>(null)

  const laden = () => {
    db.auftraege().then(setAuftraege); db.kunden().then(setKunden)
    db.anlagen().then(setAnlagen); db.bereiche().then(setBereiche); db.termine().then(setTermine)
  }
  useEffect(laden, [])
  useEffect(() => {
    const roh = sessionStorage.getItem('novaplan_auftrag_vorbelegung')
    if (!roh) return
    try {
      const v = JSON.parse(roh)
      setNvKunde(v.kundeId ?? '')
      setNvAnlage(v.anlageId ?? '')
      setNvBereich(v.bereichId ?? '')
      setNvTermin(v.terminId ?? '')
      setNvOffen(true)
      setNvMeldung('Kunde, Anlage und Bereich wurden aus den Stammdaten vorbereitet.')
    } finally {
      sessionStorage.removeItem('novaplan_auftrag_vorbelegung')
    }
  }, [])

  const zeilen = useMemo(() => auftraege.flatMap(a => {
    const bereich = bereiche.find(b => b.id === a.bereich_id)
    const anlage = anlagen.find(x => x.id === bereich?.anlage_id)
    const kunde = kunden.find(k => k.id === anlage?.kunde_id)
    const termin = termine.find(t => t.id === a.termin_id)
    return a.unterauftraege.map(u => ({ a, u, bereich, anlage, kunde, termin, nummer: nummerVoll(a, u) }))
  }), [auftraege, bereiche, anlagen, kunden, termine])

  const gefiltert = zeilen.filter(z =>
    (!suche || z.nummer.toLowerCase().includes(suche.toLowerCase())
      || z.kunde?.name_lang.toLowerCase().includes(suche.toLowerCase())
      || z.anlage?.name.toLowerCase().includes(suche.toLowerCase())
      || z.bereich?.name.toLowerCase().includes(suche.toLowerCase()))
    && (!fJahr || String(z.a.jahr) === fJahr)
    && (!fKunde || z.kunde?.id === fKunde)
    && (!fArt || z.u.art === fArt)
    && (!fStatus || z.u.status === fStatus)
    && (!fErgebnis || z.u.ergebnis === fErgebnis),
  )

  const jahre = [...new Set(zeilen.map(z => z.a.jahr))].sort().reverse()

  useEffect(() => { if (nvOffen) db.nummerVorschau().then(setNvVorschau).catch(() => setNvVorschau('–')) }, [nvOffen, auftraege])

  const nummerVergeben = async () => {
    if (!nvBereich) { setNvMeldung('Bitte Bereich wählen.'); return }
    const vorhandenerAuftrag = nvTermin && auftraege.find(a => a.bereich_id === nvBereich && a.termin_id === nvTermin)
    if (vorhandenerAuftrag) { setNvMeldung(`Für diesen Bereich ist zum gewählten Termin bereits ${vorhandenerAuftrag.auftragsnummer} hinterlegt.`); return }
    if (nvManuell && !/^\d{2}-\d{4}$/.test(nvNummer.trim())) {
      setNvMeldung('Manuelle Nummer im Format JJ-NNNN, z. B. 26-0899.'); return
    }
    const aktiveArten = NACHERFASSBARE_ARTEN.filter(art => nvArten[art])
    if (!aktiveArten.length) { setNvMeldung('Bitte mindestens eine Labor-/Leistungsart auswählen.'); return }
    try {
      const arten = aktiveArten.map((art, index) => ({
        art,
        suffix: aktiveArten.length === 1 || index === 0 ? '' : ART_SUFFIX[art],
        umfang: art === 'mibi' ? nvMibiUmfang : undefined,
        proben_geplant: nvProben[art] ? Number(nvProben[art]) : undefined,
      }))
      const nr = await db.auftragAnlegen(nvBereich, nvTermin || undefined,
        arten, nvManuell ? nvNummer.trim() : undefined, nvFachArt)
      setNvMeldung(nvTermin ? `Auftragsnummer ${nr} wurde dem bestehenden Termin zugeordnet.` : `Auftragsnummer ${nr} nacherfasst (ohne Termin – im Auftragsbuch geführt).`)
      setNvNummer(''); setNvManuell(false); laden()
    } catch (e: any) {
      setNvMeldung('Fehler: ' + (e.message ?? e))
    }
  }

  const speichern = async (id: string, feld: string, wert: string) => {
    await db.unterauftragAktualisieren(id, { [feld]: feld === 'proben_ist' ? +wert : wert } as any)
    laden()
  }

  return (
    <>
      {nvMeldung && <div className="notice">{nvMeldung}</div>}

      <Abschnitt titel="Auftrag / Auftragsnummer nacherfassen"
        aktionen={<button onClick={() => setNvOffen(!nvOffen)}>
          <i className={`fas ${nvOffen ? 'fa-chevron-up' : 'fa-hashtag'}`} aria-hidden="true"></i>
          {nvOffen ? 'Einklappen' : `Auftrag nacherfassen`}
        </button>}>
        {nvOffen && (
          <div style={{ padding: '16px 20px' }}>
            <div className="grid2">
              <label className="f">Kunde
                <select value={nvKunde} onChange={e => { setNvKunde(e.target.value); setNvAnlage(''); setNvBereich(''); setNvTermin('') }}>
                  <option value="">– wählen –</option>
                  {kunden.map(k => <option key={k.id} value={k.id}>{kundeAnzeige(k)}</option>)}
                </select>
              </label>
              <label className="f">Anlage
                <select value={nvAnlage} onChange={e => { setNvAnlage(e.target.value); setNvBereich(''); setNvTermin('') }} disabled={!nvKunde}>
                  <option value="">– wählen –</option>
                  {anlagen.filter(a => a.kunde_id === nvKunde).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="f">Untersuchungsbereich
                <select value={nvBereich} onChange={e => setNvBereich(e.target.value)} disabled={!nvAnlage}>
                  <option value="">– wählen –</option>
                  {bereiche.filter(b => b.anlage_id === nvAnlage).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="f">Bestehendem Termin zuordnen
                <select value={nvTermin} onChange={e => setNvTermin(e.target.value)} disabled={!nvAnlage}>
                  <option value="">– ohne Termin nacherfassen –</option>
                  {termine.filter(t => t.anlage_id === nvAnlage && t.status !== 'abgesagt' && (!nvBereich || t.bereich_id === nvBereich)).sort((a, b) => b.datum.localeCompare(a.datum)).map(t => <option key={t.id} value={t.id}>{fmtDatum(t.datum)} · {t.status}</option>)}
                </select>
              </label>
              <label className="f">Fachliche Untersuchungsart
                <select value={nvFachArt} onChange={e => setNvFachArt(e.target.value as FachlicheUntersuchungsart)}>
                  {Object.entries(FACHLICHE_ART_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="nacherfass-arten">
              <legend>Labor-/Leistungsarten – Mehrfachauswahl möglich</legend>
              {NACHERFASSBARE_ARTEN.map(art => <div className={`nacherfass-art ${nvArten[art] ? 'aktiv' : ''}`} key={art}>
                <label>
                  <input type="checkbox" checked={!!nvArten[art]}
                    onChange={e => setNvArten(v => ({ ...v, [art]: e.target.checked }))} />
                  <strong>{ART_LABEL[art]}</strong>
                </label>
                {nvArten[art] && <>
                  <input type="number" min="1" value={nvProben[art] ?? ''}
                    onChange={e => setNvProben(v => ({ ...v, [art]: e.target.value }))}
                    placeholder="Proben" title={`Geplante Probenzahl für ${ART_LABEL[art]}`} />
                  {art === 'mibi' && <select value={nvMibiUmfang} onChange={e => setNvMibiUmfang(e.target.value)}>
                    <option>Standard</option><option>Komplett</option><option>inklusive Enterokokken</option>
                  </select>}
                </>}
              </div>)}
            </fieldset>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
              <div>
                <span className="hint">Nummer</span><br />
                {nvManuell
                  ? <input value={nvNummer} onChange={e => setNvNummer(e.target.value)} placeholder={nvVorschau} style={{ width: 110, fontWeight: 700 }} autoFocus />
                  : <span className="nr" style={{ fontSize: '1.05rem' }}>{nvVorschau}</span>}
                {!nvManuell && <span className="hint"> automatische Folgenummer</span>}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem' }}>
                <input type="checkbox" checked={nvManuell} onChange={e => setNvManuell(e.target.checked)} />
                manuell eingreifen
              </label>
              <button className="primary" onClick={nummerVergeben} disabled={!nvBereich}>
                <i className="fas fa-hashtag" aria-hidden="true"></i> {nvTermin ? 'Auftrag zum Termin nacherfassen' : 'Auftragsnummer nacherfassen'}
              </button>
            </div>
            {nvManuell && (
              <p className="notice" style={{ marginTop: 12, marginBottom: 0 }}>
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>&nbsp;
                Nur im Ausnahmefall: Format JJ-NNNN, Doppelvergabe wird abgewiesen, der automatische
                Zähler zieht nach – die nächste automatische Nummer folgt hinter der manuellen.
              </p>
            )}
          </div>
        )}
      </Abschnitt>

      <Abschnitt titel={`Auftragsbuch (${gefiltert.length})`}
        aktionen={<button onClick={() => window.print()}>
          <i className="fas fa-print" aria-hidden="true"></i> Gefilterte Liste drucken
        </button>}>
      <div className="filters">
        <input placeholder="Suche: Auftragsnummer, Kunde, Anlage, Bereich …" value={suche} onChange={e => setSuche(e.target.value)} style={{ minWidth: 280 }} />
        <select value={fJahr} onChange={e => setFJahr(e.target.value)}><option value="">Jahr: alle</option>{jahre.map(j => <option key={j}>{j}</option>)}</select>
        <select value={fKunde} onChange={e => setFKunde(e.target.value)}><option value="">Kunde: alle</option>{kunden.map(k => <option key={k.id} value={k.id}>{kundeAnzeige(k)}</option>)}</select>
        <select value={fArt} onChange={e => setFArt(e.target.value)}><option value="">Art: alle</option>{Object.entries(ART_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Status: alle</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={fErgebnis} onChange={e => setFErgebnis(e.target.value)}><option value="">Ergebnis: alle</option>{Object.entries(ERGEBNIS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>

      <div className="table-container">
      <table>
        <thead><tr>
          <th>Nr.</th><th>Kunde</th><th>Anlage</th><th>Bereich</th><th>Termin</th>
          <th>Untersuchung</th><th>Laborart / Umfang</th><th>Proben (Soll/Ist)</th><th>Status</th><th>Ergebnis</th><th></th>
        </tr></thead>
        <tbody>
          {gefiltert.map(z => (
            <tr key={z.u.id} className={z.u.status === 'storniert' ? 'unterauftrag-storniert' : ''}>
              <td><Nr>{z.nummer}</Nr></td>
              <td>{kundeAnzeige(z.kunde)}</td>
              <td>{z.anlage?.name ?? '–'}</td>
              <td>{z.bereich?.name ?? '–'}</td>
              <td>{fmtDatum(z.termin?.datum)}</td>
              <td>{z.a.fachliche_untersuchungsart ? FACHLICHE_ART_LABEL[z.a.fachliche_untersuchungsart] : <span className="hint">nicht erfasst</span>}</td>
              <td>{ART_LABEL[z.u.art]}{z.u.umfang ? <div className="hint">{z.u.umfang}</div> : null}</td>
              <td>
                {z.u.proben_geplant ?? '–'} / {bearbeite === z.u.id && z.u.status !== 'storniert'
                  ? <input type="number" style={{ width: 64 }} defaultValue={z.u.proben_ist ?? ''} onBlur={e => { speichern(z.u.id, 'proben_ist', e.target.value); setBearbeite(null) }} autoFocus />
                  : <span onClick={() => z.u.status !== 'storniert' && setBearbeite(z.u.id)}
                      style={{ cursor: z.u.status === 'storniert' ? 'default' : 'pointer', textDecoration: z.u.status === 'storniert' ? 'none' : 'underline dotted' }}>
                      {z.u.proben_ist ?? '–'}
                    </span>}
              </td>
              <td><StatusBadge s={z.u.status} />{z.u.storno_grund
                ? <div className="hint">{STORNOGRUND_LABEL[z.u.storno_grund]}</div> : null}</td>
              <td><ErgebnisBadge s={z.u.ergebnis} /></td>
              <td className="no-print auftrag-aktionen">
                <button className="zeile-btn" onClick={() => setBerichtAuftrag(z.a)} title="Prüfbericht erfassen">
                  <i className="fas fa-file-circle-check" aria-hidden="true"></i> Bericht
                </button>
                <button className="zeile-btn unterauftrag-plus" onClick={() => setErgaenzeAuftrag(z.a)}
                  title="Mibi, Chemie oder Legionellen nachträglich ergänzen">
                  <i className="fas fa-plus" aria-hidden="true"></i> Anteil
                </button>
                <button className="zeile-btn unterauftrag-verwalten"
                  onClick={() => setVerwalteUnterauftrag({ auftrag: z.a, unterauftrag: z.u })}
                  title={`${z.nummer} bearbeiten, stornieren oder löschen`}>
                  <i className="fas fa-gear" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
          ))}
          {gefiltert.length === 0 && <tr><td colSpan={11} className="hint">Keine Aufträge für die gewählten Filter.</td></tr>}
        </tbody>
      </table>
      </div>
      </Abschnitt>

      {berichtAuftrag && (
        <BerichtModal
          auftrag={berichtAuftrag}
          kundeKurz={(() => {
            const b = bereiche.find(x => x.id === berichtAuftrag.bereich_id)
            const a = anlagen.find(x => x.id === b?.anlage_id)
            return kundeAnzeige(kunden.find(k => k.id === a?.kunde_id))
          })()}
          bereichName={bereiche.find(x => x.id === berichtAuftrag.bereich_id)?.name}
          bereichId={berichtAuftrag.bereich_id}
          onClose={() => setBerichtAuftrag(null)}
          onSaved={laden}
        />
      )}
      {ergaenzeAuftrag && (
        <UnterauftragErgaenzenModal
          auftrag={ergaenzeAuftrag}
          onClose={() => setErgaenzeAuftrag(null)}
          onSaved={nummer => {
            setErgaenzeAuftrag(null)
            setNvMeldung(`${nummer} wurde nachträglich ergänzt. Die Hauptnummer bleibt unverändert.`)
            laden()
          }}
        />
      )}
      {verwalteUnterauftrag && (
        <UnterauftragVerwaltenModal
          auftrag={verwalteUnterauftrag.auftrag}
          unterauftrag={verwalteUnterauftrag.unterauftrag}
          onClose={() => setVerwalteUnterauftrag(null)}
          onSaved={meldung => {
            setVerwalteUnterauftrag(null)
            setNvMeldung(meldung)
            laden()
          }}
        />
      )}
    </>
  )
}
