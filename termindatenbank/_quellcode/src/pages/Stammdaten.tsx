import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Bereich, Kunde, Kundentyp } from '../lib/types'
import { fmtDatum } from '../lib/types'

const TYP: Record<Kundentyp, string> = {
  hausverwaltung: 'Hausverwaltung', pflegetraeger: 'Pflegeträger',
  wohnungsbau: 'Wohnungsbau', privatkunde: 'Privatkunde', sonstige: 'Sonstige',
}

export default function Stammdaten() {
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [anlagen, setAnlagen] = useState<Anlage[]>([])
  const [bereiche, setBereiche] = useState<Bereich[]>([])
  const [suche, setSuche] = useState('')
  const [kundeId, setKundeId] = useState('')
  const [anlageId, setAnlageId] = useState('')

  // Inline-Neuanlage
  const [neuKunde, setNeuKunde] = useState(false)
  const [kf, setKf] = useState({ name_lang: '', name_kurz: '', typ: 'hausverwaltung' as Kundentyp, telefon: '', email: '', ort: '' })
  const [neuAnlage, setNeuAnlage] = useState(false)
  const [af, setAf] = useState({ name: '', strasse: '', plz: '', ort: '', turnus_monate: 36, naechste_untersuchung: '' })
  const [neuBereichName, setNeuBereichName] = useState('')

  const laden = () => { db.kunden().then(setKunden); db.anlagen().then(setAnlagen); db.bereiche().then(setBereiche) }
  useEffect(laden, [])

  const kundenGefiltert = useMemo(() => {
    const q = suche.toLowerCase()
    return kunden
      .filter(k => !q || k.name_lang.toLowerCase().includes(q) || k.name_kurz.toLowerCase().includes(q))
      .sort((a, b) => a.name_kurz.localeCompare(b.name_kurz, 'de'))
  }, [kunden, suche])

  const kunde = kunden.find(k => k.id === kundeId)
  const anlagenDesKunden = anlagen.filter(a => a.kunde_id === kundeId)
  const anlage = anlagen.find(a => a.id === anlageId)
  const bereicheDerAnlage = bereiche.filter(b => b.anlage_id === anlageId)

  const kundeSpeichern = async () => {
    if (!kf.name_lang || !kf.name_kurz) return
    await db.kundeAnlegen(kf)
    setNeuKunde(false); setKf({ ...kf, name_lang: '', name_kurz: '' }); laden()
  }
  const anlageSpeichern = async () => {
    if (!af.name || !kundeId) return
    await db.anlageAnlegen({ ...af, kunde_id: kundeId, naechste_untersuchung: af.naechste_untersuchung || undefined })
    setNeuAnlage(false); setAf({ ...af, name: '' }); laden()
  }
  const bereichSpeichern = async () => {
    if (!neuBereichName.trim() || !anlageId) return
    await db.bereichAnlegen({ anlage_id: anlageId, name: neuBereichName.trim() })
    setNeuBereichName(''); laden()
  }

  return (
    <>
      <div className="stamm-spalten">
        {/* ── Spalte 1: Kunden ── */}
        <div className="stamm-spalte">
          <div className="stamm-kopf">
            <h3><i className="fas fa-building-user" aria-hidden="true"></i> Kunden ({kundenGefiltert.length})</h3>
            <button className="zeile-btn" onClick={() => setNeuKunde(!neuKunde)}>
              <i className="fas fa-plus" aria-hidden="true"></i> Neu
            </button>
          </div>
          <div className="suchfeld" style={{ margin: '0 12px 10px' }}>
            <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
            <input placeholder="Kunde suchen …" value={suche} onChange={e => setSuche(e.target.value)} />
          </div>
          {neuKunde && (
            <div className="stamm-formular">
              <input placeholder="Vollständiger Name" value={kf.name_lang} onChange={e => setKf({ ...kf, name_lang: e.target.value })} />
              <input placeholder="Kurzname (Kalender)" value={kf.name_kurz} onChange={e => setKf({ ...kf, name_kurz: e.target.value })} />
              <select value={kf.typ} onChange={e => setKf({ ...kf, typ: e.target.value as Kundentyp })}>
                {Object.entries(TYP).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input placeholder="Telefon" value={kf.telefon} onChange={e => setKf({ ...kf, telefon: e.target.value })} />
              <input placeholder="E-Mail" value={kf.email} onChange={e => setKf({ ...kf, email: e.target.value })} />
              <button className="primary" onClick={kundeSpeichern}>Anlegen</button>
            </div>
          )}
          <div className="stamm-liste">
            {kundenGefiltert.map(k => (
              <button key={k.id} className={`stamm-eintrag ${k.id === kundeId ? 'aktiv' : ''}`}
                onClick={() => { setKundeId(k.id); setAnlageId('') }}>
                <strong>{k.name_kurz}</strong>
                <span className="hint">{k.name_lang}</span>
                <span className="stamm-zahl">{anlagen.filter(a => a.kunde_id === k.id).length}</span>
              </button>
            ))}
            {kundenGefiltert.length === 0 && <p className="hint" style={{ padding: '0 14px' }}>Keine Kunden gefunden.</p>}
          </div>
        </div>

        {/* ── Spalte 2: Anlagen des Kunden ── */}
        <div className="stamm-spalte">
          <div className="stamm-kopf">
            <h3><i className="fas fa-building" aria-hidden="true"></i> Anlagen {kunde ? `– ${kunde.name_kurz} (${anlagenDesKunden.length})` : ''}</h3>
            {kunde && <button className="zeile-btn" onClick={() => setNeuAnlage(!neuAnlage)}>
              <i className="fas fa-plus" aria-hidden="true"></i> Neu
            </button>}
          </div>
          {!kunde && <p className="hint" style={{ padding: '4px 14px' }}>← Links einen Kunden wählen.</p>}
          {neuAnlage && kunde && (
            <div className="stamm-formular">
              <input placeholder="Objektname, z. B. Straßbergerstr. 11–47" value={af.name} onChange={e => setAf({ ...af, name: e.target.value })} />
              <input placeholder="Straße" value={af.strasse} onChange={e => setAf({ ...af, strasse: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="PLZ" style={{ width: 90 }} value={af.plz} onChange={e => setAf({ ...af, plz: e.target.value })} />
                <input placeholder="Ort" style={{ flex: 1 }} value={af.ort} onChange={e => setAf({ ...af, ort: e.target.value })} />
              </div>
              <select value={af.turnus_monate} onChange={e => setAf({ ...af, turnus_monate: +e.target.value })}>
                <option value={36}>Turnus: 3 Jahre</option>
                <option value={12}>Turnus: 1 Jahr</option>
                <option value={3}>Turnus: 3 Monate (Nachuntersuchung)</option>
              </select>
              <label className="f">Nächste Untersuchung
                <input type="date" value={af.naechste_untersuchung} onChange={e => setAf({ ...af, naechste_untersuchung: e.target.value })} />
              </label>
              <button className="primary" onClick={anlageSpeichern}>Anlegen</button>
            </div>
          )}
          <div className="stamm-liste">
            {anlagenDesKunden.map(a => (
              <button key={a.id} className={`stamm-eintrag ${a.id === anlageId ? 'aktiv' : ''}`} onClick={() => setAnlageId(a.id)}>
                <strong>{a.name}</strong>
                <span className="hint">{[a.plz, a.ort].filter(Boolean).join(' ')} · fällig {fmtDatum(a.naechste_untersuchung)}</span>
                <span className="stamm-zahl">{bereiche.filter(b => b.anlage_id === a.id).length}</span>
              </button>
            ))}
            {kunde && anlagenDesKunden.length === 0 && <p className="hint" style={{ padding: '0 14px' }}>Noch keine Anlagen – oben „Neu“.</p>}
          </div>
        </div>

        {/* ── Spalte 3: Bereiche der Anlage ── */}
        <div className="stamm-spalte">
          <div className="stamm-kopf">
            <h3><i className="fas fa-diagram-project" aria-hidden="true"></i> Untersuchungsbereiche {anlage ? `(${bereicheDerAnlage.length})` : ''}</h3>
          </div>
          {!anlage && <p className="hint" style={{ padding: '4px 14px' }}>← In der Mitte eine Anlage wählen.</p>}
          {anlage && (
            <>
              <div className="stamm-formular" style={{ paddingTop: 0 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Neuer Bereich, z. B. Haus 7" style={{ flex: 1 }} value={neuBereichName}
                    onChange={e => setNeuBereichName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && bereichSpeichern()} />
                  <button className="primary" onClick={bereichSpeichern} disabled={!neuBereichName.trim()}>
                    <i className="fas fa-plus" aria-hidden="true"></i>
                  </button>
                </div>
                <p className="hint" style={{ margin: '4px 0 0' }}>
                  Jedes eigenständig untersuchbare Warmwassersystem als eigener Bereich – jeder erhält eigene Auftragsnummern.
                </p>
              </div>
              <div className="stamm-liste">
                {bereicheDerAnlage.map(b => (
                  <div key={b.id} className="stamm-eintrag" style={{ cursor: 'default' }}>
                    <strong>{b.name}</strong>
                    {b.beschreibung && <span className="hint">{b.beschreibung}</span>}
                  </div>
                ))}
                {bereicheDerAnlage.length === 0 && <p className="hint" style={{ padding: '0 14px' }}>
                  Noch keine Bereiche – bei einem einzelnen WW-System reicht z. B. „Gesamtanlage“.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
