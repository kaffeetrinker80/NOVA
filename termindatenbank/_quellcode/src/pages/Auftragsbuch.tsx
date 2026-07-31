import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Auftrag, Bereich, FachlicheUntersuchungsart, Kunde, Stornogrund, Termin, Ueberschreitungsphase, Untersuchungsart, Unterauftrag } from '../lib/types'
import { ART_LABEL, ERGEBNIS_LABEL, FACHLICHE_ART_LABEL, STATUS_LABEL, STORNOGRUND_LABEL, fmtDatum, nummerVoll, kundeAnzeige } from '../lib/types'
import { Abschnitt, ErgebnisBadge, Meldung, Nr, StatusBadge } from '../components/ui'
import BerichtModal from '../components/BerichtModal'
import { naechsteFachlicheArt, offenePhaseFuerBereich } from '../lib/turnus'

const ERGAENZBARE_ARTEN: Untersuchungsart[] = ['legionellen', 'mibi', 'chemie']
const NACHERFASSBARE_ARTEN: Untersuchungsart[] = ['legionellen', 'mibi', 'chemie', 'vorortparameter']
const ART_SUFFIX: Record<Untersuchungsart, string> = {
  legionellen: '', mibi: 'M', chemie: 'C', vorortparameter: 'V', sonstiges: 'S',
}
const AKTUELLES_JAHR = new Date().getFullYear()
const heuteLokal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type AuftragSchnelltreffer = {
  art: 'kunde' | 'anlage' | 'bereich'
  id: string
  kundeId: string
  anlageId?: string
  bereichId?: string
  titel: string
  detail: string
  score: number
}

const suchwert = (...werte: Array<string | undefined>) =>
  werte.filter(Boolean).join(' ').toLocaleLowerCase('de')

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
  const [phasen, setPhasen] = useState<Ueberschreitungsphase[]>([])
  const [suche, setSuche] = useState('')
  const [fJahr, setFJahr] = useState(String(AKTUELLES_JAHR)); const [fKunde, setFKunde] = useState('')
  const [fArt, setFArt] = useState(''); const [fStatus, setFStatus] = useState('')
  const [fErgebnis, setFErgebnis] = useState('')
  const [fFreigabe, setFFreigabe] = useState('')
  const [bearbeite, setBearbeite] = useState<string | null>(null)

  // ── Eigenständige Nummern-Vergabe ──
  const [nvOffen, setNvOffen] = useState(false)
  const [nvVorschau, setNvVorschau] = useState('…')
  const [nvKunde, setNvKunde] = useState('')
  const [nvAnlage, setNvAnlage] = useState('')
  const [nvBereich, setNvBereich] = useState('')
  const [nvTermin, setNvTermin] = useState('')
  const [nvDatum, setNvDatum] = useState(heuteLokal)
  const [nvArten, setNvArten] = useState<Partial<Record<Untersuchungsart, boolean>>>({
    legionellen: true, mibi: false, chemie: false, vorortparameter: false,
  })
  const [nvProben, setNvProben] = useState<Partial<Record<Untersuchungsart, string>>>({})
  const [nvMibiUmfang, setNvMibiUmfang] = useState('Standard')
  const [nvFachArt, setNvFachArt] = useState<FachlicheUntersuchungsart>('orientierend')
  const [nvManuell, setNvManuell] = useState(false)
  const [nvNummer, setNvNummer] = useState('')
  const [nvSuche, setNvSuche] = useState('')
  const [nvLaeuft, setNvLaeuft] = useState(false)
  const [nvMeldung, setNvMeldung] = useState('')
  const [berichtAuftrag, setBerichtAuftrag] = useState<Auftrag | null>(null)
  const [ergaenzeAuftrag, setErgaenzeAuftrag] = useState<Auftrag | null>(null)
  const [verwalteUnterauftrag, setVerwalteUnterauftrag] = useState<{ auftrag: Auftrag; unterauftrag: Unterauftrag } | null>(null)
  const [nummernstaende, setNummernstaende] = useState<Array<{ jahr: number; letzter_wert: number }>>([])
  const [leereNummern, setLeereNummern] = useState(true)
  const [pnLaeuft, setPnLaeuft] = useState<string | null>(null)

  const laden = () => {
    db.auftraege().then(setAuftraege); db.kunden().then(setKunden)
    db.anlagen().then(setAnlagen); db.bereiche().then(setBereiche); db.termine().then(setTermine)
    db.phasen().then(setPhasen).catch(() => setPhasen([]))
    db.nummernstaende().then(setNummernstaende)
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

  const nvSuchtreffer = useMemo(() => {
    const q = nvSuche.trim().toLocaleLowerCase('de')
    if (q.length < 2) return []
    const teile = q.split(/\s+/).filter(Boolean)
    const passt = (text: string) => teile.every(teil => text.includes(teil))
    const score = (direkt: string, gesamt: string, titel: string) => {
      let wert = 0
      if (passt(direkt)) wert += 20
      if (titel.toLocaleLowerCase('de').startsWith(q)) wert += 10
      if (gesamt.includes(q)) wert += 5
      return wert
    }
    const treffer: AuftragSchnelltreffer[] = []

    for (const k of kunden.filter(x => x.aktiv)) {
      const kDirekt = suchwert(k.name_lang, k.name_kurz, k.strasse, k.plz, k.ort, k.telefon, k.email)
      if (passt(kDirekt)) {
        treffer.push({
          art: 'kunde', id: `k-${k.id}`, kundeId: k.id,
          titel: kundeAnzeige(k),
          detail: ['Kunde', k.strasse, [k.plz, k.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
          score: score(kDirekt, kDirekt, kundeAnzeige(k)),
        })
      }

      for (const a of anlagen.filter(x => x.aktiv && x.kunde_id === k.id)) {
        const aDirekt = suchwert(a.name, a.strasse, a.plz, a.ort, a.objekt_referenz, a.objekt_betreuer, a.info)
        const aGesamt = `${aDirekt} ${kDirekt}`
        if (passt(aGesamt)) {
          treffer.push({
            art: 'anlage', id: `a-${a.id}`, kundeId: k.id, anlageId: a.id,
            titel: a.name,
            detail: ['Anlage', kundeAnzeige(k), a.strasse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
            score: score(aDirekt, aGesamt, a.name),
          })
        }

        for (const b of bereiche.filter(x => x.aktiv && x.anlage_id === a.id)) {
          const bAdresse = [b.strasse, b.hausnummer].filter(Boolean).join(' ')
          const bDirekt = suchwert(b.name, b.strasse, b.hausnummer, bAdresse, b.wwb_details, b.beschreibung)
          const bGesamt = `${bDirekt} ${aDirekt} ${kDirekt}`
          if (passt(bGesamt)) {
            treffer.push({
              art: 'bereich', id: `b-${b.id}`, kundeId: k.id, anlageId: a.id, bereichId: b.id,
              titel: b.name,
              detail: ['Bereich', a.name, kundeAnzeige(k), bAdresse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
              score: score(bDirekt, bGesamt, b.name),
            })
          }
        }
      }
    }

    return treffer
      .sort((a, b) => b.score - a.score || a.titel.localeCompare(b.titel, 'de'))
      .slice(0, 12)
  }, [nvSuche, kunden, anlagen, bereiche])

  const schnelltrefferWaehlen = (treffer: AuftragSchnelltreffer) => {
    const passendeAnlagen = anlagen.filter(a => a.aktiv && a.kunde_id === treffer.kundeId)
    const anlageId = treffer.anlageId ?? (passendeAnlagen.length === 1 ? passendeAnlagen[0].id : '')
    const passendeBereiche = anlageId
      ? bereiche.filter(b => b.aktiv && b.anlage_id === anlageId)
      : []
    const bereichId = treffer.bereichId ?? (passendeBereiche.length === 1 ? passendeBereiche[0].id : '')
    setNvKunde(treffer.kundeId)
    setNvAnlage(anlageId)
    setNvBereich(bereichId)
    setNvTermin('')
    setNvSuche('')
  }

  const gefiltert = zeilen.filter(z =>
    (!suche || z.nummer.toLowerCase().includes(suche.toLowerCase())
      || z.kunde?.name_lang.toLowerCase().includes(suche.toLowerCase())
      || z.anlage?.name.toLowerCase().includes(suche.toLowerCase())
      || z.bereich?.name.toLowerCase().includes(suche.toLowerCase()))
    && (!fJahr || String(z.a.jahr) === fJahr)
    && (!fKunde || z.kunde?.id === fKunde)
    && (!fArt || z.u.art === fArt)
    && (!fStatus || z.u.status === fStatus)
    && (!fErgebnis || z.u.ergebnis === fErgebnis)
    && (!fFreigabe
      || (fFreigabe === 'fehlt' && !z.a.probenahmebericht_freigegeben)
      || (fFreigabe === 'freigegeben' && !!z.a.probenahmebericht_freigegeben)),
  )

  const jahre = [...new Set([
    AKTUELLES_JAHR,
    ...zeilen.map(z => z.a.jahr),
    ...nummernstaende.map(z => z.jahr),
  ])].sort().reverse()
  const blockJahr = Number(fJahr || AKTUELLES_JAHR)
  const blockStand = nummernstaende.find(x => x.jahr === blockJahr)?.letzter_wert ?? 0
  const blockPrefix = String(blockJahr % 100).padStart(2, '0')
  const blockAnsicht = !!fJahr && leereNummern
    && !suche.trim() && !fKunde && !fArt && !fStatus && !fErgebnis && !fFreigabe
  const buchZeilen = useMemo(() => {
    if (!blockAnsicht || blockStand < 1) {
      return gefiltert.map(z => ({ typ: 'belegt' as const, z }))
    }
    const belegt = new Map<string, typeof gefiltert>()
    for (const z of gefiltert) {
      const vorhanden = belegt.get(z.a.auftragsnummer) ?? []
      vorhanden.push(z)
      belegt.set(z.a.auftragsnummer, vorhanden)
    }
    const ergebnis: Array<
      { typ: 'belegt'; z: (typeof gefiltert)[number] }
      | { typ: 'frei'; nummer: string }
    > = []
    for (let lauf = blockStand; lauf >= 1; lauf--) {
      const nummer = `${blockPrefix}-${String(lauf).padStart(4, '0')}`
      const vorhandene = belegt.get(nummer)
      if (vorhandene?.length) {
        vorhandene.forEach(z => ergebnis.push({ typ: 'belegt', z }))
      } else {
        ergebnis.push({ typ: 'frei', nummer })
      }
    }
    return ergebnis
  }, [blockAnsicht, blockStand, blockPrefix, gefiltert])

  const nvTerminDaten = termine.find(t => t.id === nvTermin)
  const nvBereichDaten = bereiche.find(b => b.id === nvBereich)
  const nvPhaseOffen = nvBereich ? offenePhaseFuerBereich(nvBereich, phasen) : undefined
  const nvDreiMonatsTurnus = nvBereichDaten?.turnus_monate === 3
  const nvVorgeschlageneArt = naechsteFachlicheArt(nvBereichDaten, phasen)
  const nvIstNachuntersuchung = nvVorgeschlageneArt === 'nachuntersuchung'
  const nvIstWeitergehend = nvVorgeschlageneArt === 'weitergehend'
  const nvNummernJahr = Number((nvTerminDaten?.datum ?? nvDatum).slice(0, 4)) || blockJahr

  useEffect(() => {
    if (!nvBereich) return
    if (nvTerminDaten?.datum) setNvDatum(nvTerminDaten.datum)
    setNvFachArt(nvTerminDaten?.fachliche_untersuchungsart
      ?? nvVorgeschlageneArt)
  }, [nvBereich, nvTermin, nvTerminDaten?.datum,
    nvTerminDaten?.fachliche_untersuchungsart, nvVorgeschlageneArt])

  useEffect(() => {
    if (nvOffen) db.nummerVorschau(nvNummernJahr).then(setNvVorschau).catch(() => setNvVorschau('–'))
  }, [nvOffen, auftraege, nvNummernJahr])

  const nummerVergeben = async () => {
    if (!nvBereich) { setNvMeldung('Bitte Bereich wählen.'); return }
    if (!nvDatum) { setNvMeldung('Bitte Untersuchungsdatum angeben.'); return }
    const vorhandenerAuftrag = nvTermin && auftraege.find(a => a.bereich_id === nvBereich && a.termin_id === nvTermin)
    if (vorhandenerAuftrag) { setNvMeldung(`Für diesen Bereich ist zum gewählten Termin bereits ${vorhandenerAuftrag.auftragsnummer} hinterlegt.`); return }
    if (nvManuell && !/^\d{2}-\d{4}$/.test(nvNummer.trim())) {
      setNvMeldung('Manuelle Nummer im Format JJ-NNNN, z. B. 26-0899.'); return
    }
    const aktiveArten = NACHERFASSBARE_ARTEN.filter(art => nvArten[art])
    if (!aktiveArten.length) { setNvMeldung('Bitte mindestens eine Labor-/Leistungsart auswählen.'); return }
    setNvLaeuft(true)
    let neuAngelegterTermin = ''
    try {
      const arten = aktiveArten.map((art, index) => ({
        art,
        suffix: aktiveArten.length === 1 || index === 0 ? '' : ART_SUFFIX[art],
        umfang: art === 'mibi' ? nvMibiUmfang : undefined,
        proben_geplant: nvProben[art] ? Number(nvProben[art]) : undefined,
      }))
      let terminId = nvTermin
      if (terminId) {
        await db.terminAktualisieren(terminId, { fachliche_untersuchungsart: nvFachArt })
      } else {
        terminId = await db.terminAnlegen({
          kunde_id: nvKunde,
          anlage_id: nvAnlage,
          bereich_id: nvBereich,
          datum: nvDatum,
          status: 'geplant',
          fachliche_untersuchungsart: nvFachArt,
          historie_einordnung: 'regulaer',
        })
        neuAngelegterTermin = terminId
      }
      const nr = await db.auftragAnlegen(nvBereich, terminId,
        arten, nvManuell ? nvNummer.trim() : undefined, nvFachArt, nvNummernJahr)
      setNvMeldung(nvTermin
        ? `Auftragsnummer ${nr} wurde dem bestehenden Termin am ${fmtDatum(nvDatum)} zugeordnet.`
        : `Spontaner Termin am ${fmtDatum(nvDatum)} und Auftrag ${nr} wurden gemeinsam angelegt.`)
      setNvNummer(''); setNvManuell(false); laden()
    } catch (e: any) {
      if (neuAngelegterTermin) await db.terminLoeschen(neuAngelegterTermin).catch(() => undefined)
      setNvMeldung('Fehler: ' + (e.message ?? e))
    } finally {
      setNvLaeuft(false)
    }
  }

  const freieNummerBelegen = (nummer: string) => {
    setNvNummer(nummer)
    setNvManuell(true)
    setNvOffen(true)
    setNvMeldung(`${nummer} ist frei und für die Nacherfassung ausgewählt.`)
    window.setTimeout(() => document.getElementById('auftrag-nacherfassen')?.scrollIntoView({
      behavior: 'smooth', block: 'start',
    }), 0)
  }

  const speichern = async (id: string, feld: string, wert: string) => {
    await db.unterauftragAktualisieren(id, { [feld]: feld === 'proben_ist' ? +wert : wert } as any)
    laden()
  }

  const pnFreigabeSetzen = async (auftrag: Auftrag, freigegeben: boolean) => {
    setPnLaeuft(auftrag.id)
    try {
      const erg = await db.probenahmeberichtFreigeben(auftrag.id, freigegeben)
      setNvMeldung(freigegeben
        ? `${erg.nummer}: Probenahmebericht wurde für Nico als freigegeben markiert.`
        : `${erg.nummer}: Freigabe des Probenahmeberichts wurde zurückgenommen.`)
      laden()
    } catch (e: any) {
      setNvMeldung('PN-Bericht konnte nicht aktualisiert werden: ' + (e.message ?? e))
    } finally {
      setPnLaeuft(null)
    }
  }

  return (
    <>
      <Meldung text={nvMeldung} onWeg={() => setNvMeldung('')} />

      <div id="auftrag-nacherfassen">
      <Abschnitt titel="Auftrag unabhängig von der Planung anlegen"
        aktionen={<button onClick={() => setNvOffen(!nvOffen)}>
          <i className={`fas ${nvOffen ? 'fa-chevron-up' : 'fa-hashtag'}`} aria-hidden="true"></i>
          {nvOffen ? 'Einklappen' : 'Direkte Erfassung öffnen'}
        </button>}>
        {nvOffen && (
          <div style={{ padding: '16px 20px' }}>
            <p className="hint direktauftrag-hinweis">
              Für spontane Untersuchungen und Altbestand: Termin und Auftrag werden genauso verknüpft
              wie bei Dashboard → Planen.
            </p>
            <div className="auftrag-schnellsuche">
              <div className="suchfeld">
                <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
                <input value={nvSuche}
                  placeholder="Kunde, Anlage, Bereich, Straße, PLZ oder Ort suchen …"
                  onChange={e => setNvSuche(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setNvSuche('')
                    if (e.key === 'Enter' && nvSuchtreffer[0]) schnelltrefferWaehlen(nvSuchtreffer[0])
                  }}
                  autoComplete="off" />
                {nvSuche && <button className="suchfeld-x" onClick={() => setNvSuche('')}
                  aria-label="Schnellsuche leeren">×</button>}
              </div>
              {nvSuche.trim().length >= 2 && <div className="auftrag-suchtreffer">
                {nvSuchtreffer.map(t => <button key={t.id} onClick={() => schnelltrefferWaehlen(t)}>
                  <i className={`fas ${t.art === 'kunde' ? 'fa-user-tie' : t.art === 'anlage' ? 'fa-building' : 'fa-diagram-project'}`}
                    aria-hidden="true"></i>
                  <span><strong>{t.titel}</strong><small>{t.detail}</small></span>
                  <i className="fas fa-arrow-right" aria-hidden="true"></i>
                </button>)}
                {nvSuchtreffer.length === 0 && <span className="hint">Kein passender Stammdatensatz gefunden.</span>}
              </div>}
            </div>
            <div className="grid2">
              <label className="f">Kunde (alternativ einzeln wählen)
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
              <label className="f">Vorhandenen Termin verwenden (optional)
                <select value={nvTermin} onChange={e => setNvTermin(e.target.value)} disabled={!nvAnlage}>
                  <option value="">– neuen/spontanen Termin erfassen –</option>
                  {termine.filter(t => t.anlage_id === nvAnlage && t.status !== 'abgesagt' && (!nvBereich || t.bereich_id === nvBereich)).sort((a, b) => b.datum.localeCompare(a.datum)).map(t => <option key={t.id} value={t.id}>{fmtDatum(t.datum)} · {t.status}</option>)}
                </select>
              </label>
              <label className="f">Untersuchungstermin
                <input type="date" value={nvDatum} onChange={e => setNvDatum(e.target.value)}
                  disabled={!!nvTermin} />
                <span className="hint">{nvTermin ? 'Datum des vorhandenen Termins' : 'Heute für eine spontane Untersuchung; für Altbestand anpassen'}</span>
              </label>
              <label className="f">Fachliche Untersuchungsart
                <select value={nvFachArt} onChange={e => setNvFachArt(e.target.value as FachlicheUntersuchungsart)}>
                  {Object.entries(FACHLICHE_ART_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <span className={`hint ${nvIstNachuntersuchung || nvIstWeitergehend ? 'direktauftrag-nu' : ''}`}>
                  {nvTerminDaten?.fachliche_untersuchungsart
                    ? 'Untersuchungsart aus dem vorhandenen Termin übernommen.'
                    : nvIstWeitergehend
                    ? `Automatisch als weitergehende Untersuchung vorgeschlagen: offene Phase „${nvPhaseOffen?.status.replace('_', ' ')}“.`
                    : nvIstNachuntersuchung
                    ? `Automatisch als Nachuntersuchung vorgeschlagen: ${nvPhaseOffen?.status === 'nachuntersuchung'
                      ? 'Bereich befindet sich in der NU-Phase'
                      : nvDreiMonatsTurnus ? 'Turnus beträgt 3 Monate' : 'NU-Turnus gespeichert'}.`
                    : 'Ohne offene Phase: orientierende Untersuchung oder bei Bedarf nichtamtliche Eigenprobe wählen.'}
                </span>
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
              <button className="primary" onClick={nummerVergeben} disabled={!nvBereich || !nvDatum || nvLaeuft}>
                <i className="fas fa-hashtag" aria-hidden="true"></i>
                {nvLaeuft ? 'Wird angelegt …'
                  : nvTermin ? 'Mit vorhandenem Termin verknüpfen' : 'Spontanen Termin & Auftrag anlegen'}
              </button>
            </div>
            {nvManuell && (
              <p className="notice" style={{ marginTop: 12, marginBottom: 0 }}>
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>&nbsp;
                Nur im Ausnahmefall: Format JJ-NNNN, Doppelvergabe wird abgewiesen, der automatische
                Zähler läuft hinter der höchsten Nummer dieses Jahres weiter. Freie niedrigere Nummern
                können weiterhin manuell nacherfasst werden.
              </p>
            )}
          </div>
        )}
      </Abschnitt>
      </div>

      <Abschnitt titel={`Auftragsbuch (${gefiltert.length} belegte Einträge)`}
        aktionen={<button onClick={() => window.print()}>
          <i className="fas fa-print" aria-hidden="true"></i> Gefilterte Liste drucken
        </button>}>
      <div className="auftragsblock-leiste">
        <label className="auftragsblock-leer">
          <input type="checkbox" checked={leereNummern} onChange={e => setLeereNummern(e.target.checked)} />
          freie Nummern des gewählten Jahres anzeigen
        </label>
      </div>
      <div className="filters">
        <input placeholder="Suche: Auftragsnummer, Kunde, Anlage, Bereich …" value={suche} onChange={e => setSuche(e.target.value)} style={{ minWidth: 280 }} />
        <select value={fJahr} onChange={e => setFJahr(e.target.value)}><option value="">Jahr: alle</option>{jahre.map(j => <option key={j}>{j}</option>)}</select>
        <select value={fKunde} onChange={e => setFKunde(e.target.value)}><option value="">Kunde: alle</option>{kunden.map(k => <option key={k.id} value={k.id}>{kundeAnzeige(k)}</option>)}</select>
        <select value={fArt} onChange={e => setFArt(e.target.value)}><option value="">Art: alle</option>{Object.entries(ART_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Status: alle</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={fErgebnis} onChange={e => setFErgebnis(e.target.value)}><option value="">Ergebnis: alle</option>{Object.entries(ERGEBNIS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={fFreigabe} onChange={e => setFFreigabe(e.target.value)}>
          <option value="">PN-Bericht: alle</option>
          <option value="fehlt">Freigabe fehlt</option>
          <option value="freigegeben">freigegeben</option>
        </select>
      </div>

      <div className="table-container">
      <table>
        <thead><tr>
          <th>Nr.</th><th>Kunde</th><th>Anlage</th><th>Bereich</th><th>Termin</th>
          <th>Untersuchung</th><th>Laborart / Umfang</th><th>Proben (Soll/Ist)</th><th>Status</th><th>Ergebnis</th><th>PN-Bericht</th><th></th>
        </tr></thead>
        <tbody>
          {buchZeilen.map(eintrag => {
            if (eintrag.typ === 'frei') return <tr key={eintrag.nummer} className="auftragsnummer-frei">
              <td><Nr>{eintrag.nummer}</Nr></td>
              <td colSpan={10}><span className="hint">freie Auftragsnummer</span></td>
              <td className="no-print auftrag-aktionen">
                <button className="zeile-btn unterauftrag-plus" onClick={() => freieNummerBelegen(eintrag.nummer)}>
                  <i className="fas fa-plus" aria-hidden="true"></i> Belegen
                </button>
              </td>
            </tr>
            const z = eintrag.z
            return <tr key={z.u.id} className={z.u.status === 'storniert' ? 'unterauftrag-storniert' : ''}>
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
              <td className="pn-freigabe">
                {z.u.suffix === '' ||
                (!z.a.unterauftraege.some(u => u.suffix === '') &&
                  z.a.unterauftraege[0]?.id === z.u.id)
                  ? <label title={z.a.probenahmebericht_freigegeben_am
                      ? `Freigegeben ${new Date(z.a.probenahmebericht_freigegeben_am).toLocaleString('de-DE')}`
                      : 'Probenahmebericht noch nicht freigegeben'}>
                      <input type="checkbox" checked={!!z.a.probenahmebericht_freigegeben}
                        disabled={pnLaeuft === z.a.id}
                        onChange={e => pnFreigabeSetzen(z.a, e.target.checked)} />
                      <span>{z.a.probenahmebericht_freigegeben ? 'freigegeben' : 'fehlt'}</span>
                    </label>
                  : <span className="hint">wie {z.a.auftragsnummer}</span>}
              </td>
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
          })}
          {buchZeilen.length === 0 && <tr><td colSpan={12} className="hint">Keine Aufträge für die gewählten Filter.</td></tr>}
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
