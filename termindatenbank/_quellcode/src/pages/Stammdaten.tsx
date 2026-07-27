import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Bereich, Kunde, Kundentyp, Ueberschreitungsphase } from '../lib/types'
import { fmtDatum, kundeAnzeige } from '../lib/types'
import HistorieModal from '../components/HistorieModal'
import { Meldung } from '../components/ui'

const TYP: Record<Kundentyp, string> = {
  hausverwaltung: 'Hausverwaltung', pflegetraeger: 'Pflegeträger',
  wohnungsbau: 'Wohnungsbau', privatkunde: 'Privatkunde', sonstige: 'Sonstige',
}

const PHASE_TEXT: Record<Ueberschreitungsphase['status'], string> = {
  aktiv: 'Überschreitung offen',
  massnahmen_laufen: 'Maßnahmen laufen',
  nachuntersuchung: 'NU-Phase',
  regelturnus_bestaetigt: 'Regelturnus bestätigt',
  abgeschlossen: 'Phase abgeschlossen',
}

function bereichAnsicht(b: Bereich) {
  const teile = b.name.split(' – ')
  if (teile.length > 1) return { herkunft: teile[0], titel: teile.slice(1).join(' – '), uebernommen: true }
  if (b.legacy_quelle === 'Anlagen-Zusammenführung') return { herkunft: b.name, titel: 'Gesamtanlage', uebernommen: true }
  return { herkunft: '', titel: b.name, uebernommen: false }
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

  // Übernahme-Modus: bisherige Einzelkunden werden als Anlagen unter einen Zielkunden gehängt.
  const [mergeModus, setMergeModus] = useState(false)
  const [mergeWahl, setMergeWahl] = useState<Set<string>>(new Set())
  const [mergeZiel, setMergeZiel] = useState('')
  const [mergeNeu, setMergeNeu] = useState(false)          // Ziel = neuer Kunde
  const [mergeNeuName, setMergeNeuName] = useState({ kurz: '', lang: '' })
  const [meldung, setMeldung] = useState('')

  // Anlagen-Detailbearbeitung
  const [notiz, setNotiz] = useState('')
  const [planungsnotiz, setPlanungsnotiz] = useState('')
  const [neuerVerwalter, setNeuerVerwalter] = useState('')
  const [anlageName, setAnlageName] = useState('')
  const [adresse, setAdresse] = useState({ strasse: '', plz: '', ort: '' })
  const [betreuer, setBetreuer] = useState('')

  // Anlagen zusammenführen
  const [aMergeModus, setAMergeModus] = useState(false)
  const [aMergeWahl, setAMergeWahl] = useState<Set<string>>(new Set())
  const [aMergeZiel, setAMergeZiel] = useState('')

  // Kunden umbenennen
  const [kName, setKName] = useState({ kurz: '', lang: '' })
  const [inaktiveAnzeigen, setInaktiveAnzeigen] = useState(false)
  const [inaktiveKunden, setInaktiveKunden] = useState(false)
  const [historieOffen, setHistorieOffen] = useState(false)
  const [historieBereich, setHistorieBereich] = useState<string | undefined>(undefined)
  const [bereichId, setBereichId] = useState('')
  const [bf, setBf] = useState({ name: '', strasse: '', hausnummer: '', wwb_details: '', notizen: '' })
  const [termine, setTermine] = useState<import('../lib/types').Termin[]>([])
  const [auftraege, setAuftraege] = useState<import('../lib/types').Auftrag[]>([])
  const [phasen, setPhasen] = useState<Ueberschreitungsphase[]>([])

  const laden = () => {
    db.kunden().then(setKunden); db.anlagen().then(setAnlagen); db.bereiche().then(setBereiche)
    db.termine().then(setTermine); db.auftraege().then(setAuftraege)
    db.phasen().then(setPhasen).catch(() => setPhasen([]))
  }
  useEffect(laden, [])

  const kundenGefiltert = useMemo(() => {
    const q = suche.toLowerCase()
    return kunden
      .filter(k => !q || k.name_lang.toLowerCase().includes(q) || k.name_kurz.toLowerCase().includes(q)
        || (inaktiveKunden && !k.aktiv))
      .sort((a, b) => a.name_lang.localeCompare(b.name_lang, 'de'))
  }, [kunden, suche])

  const kunde = kunden.find(k => k.id === kundeId)

  const mergeToggle = (id: string) => setMergeWahl(w => {
    const n = new Set(w)
    if (n.has(id)) { n.delete(id); if (mergeZiel === id) setMergeZiel([...n][0] ?? '') }
    else { n.add(id); if (!mergeZiel) setMergeZiel(id) }   // erster Haken wird automatisch Ziel
    return n
  })

  const zusammenfuehren = async () => {
    let ziel: string
    let quellen: string[]
    if (mergeNeu) {
      if (!mergeNeuName.lang.trim() || mergeWahl.size < 1) return
      await db.kundeAnlegen({ name_lang: mergeNeuName.lang.trim(), name_kurz: mergeNeuName.kurz.trim(), typ: 'hausverwaltung' })
      const alle = await db.kunden()
      const neu = [...alle].reverse().find(k => k.name_lang === mergeNeuName.lang.trim())
      if (!neu) { setMeldung('Neuer Kunde konnte nicht angelegt werden.'); return }
      ziel = neu.id
      quellen = [...mergeWahl]
    } else {
      ziel = mergeZiel || [...mergeWahl][0]
      quellen = [...mergeWahl].filter(id => id !== ziel)
      if (!ziel || quellen.length === 0) return
    }
    try {
      const erg = await db.kundenAlsAnlagenUebernehmen(ziel, quellen)
      setMeldung(erg + ' Der Zielkunde bleibt links; die Quellkunden stehen rechts als Anlagen/Objekte.')
      setMergeModus(false); setMergeWahl(new Set()); setMergeZiel('')
      setMergeNeu(false); setMergeNeuName({ kurz: '', lang: '' })
      setKundeId(ziel); laden()
    } catch (e: any) { setMeldung('Fehler: ' + (e.message ?? e)) }
  }
  const anlagenDesKunden = anlagen.filter(a => a.kunde_id === kundeId && (inaktiveAnzeigen || a.aktiv))
  const bereich = bereiche.find(b => b.id === bereichId)
  useEffect(() => {
    const ansicht = bereich ? bereichAnsicht(bereich) : undefined
    setBf({
      name: ansicht?.titel ?? '', strasse: bereich?.strasse ?? '', hausnummer: bereich?.hausnummer ?? '',
      wwb_details: bereich?.wwb_details ?? '', notizen: bereich?.notizen ?? '',
    })
  }, [bereichId])
  const bereichSpeichernDetails = async () => {
    if (!bereich) return
    const ansicht = bereichAnsicht(bereich)
    const name = bf.name.trim() || ansicht.titel || bereich.name
    await db.bereichAktualisieren(bereich.id, {
      name: ansicht.herkunft ? `${ansicht.herkunft} – ${name}` : name, strasse: bf.strasse || undefined,
      hausnummer: bf.hausnummer || undefined, wwb_details: bf.wwb_details || undefined,
      notizen: bf.notizen || undefined,
    })
    setMeldung('Bereich gespeichert.'); laden()
  }
  const bereichEntfernen = async (id: string) => {
    await db.bereichLoeschen(id); if (bereichId === id) setBereichId(''); setMeldung('Bereich entfernt.'); laden()
  }

  const anlage = anlagen.find(a => a.id === anlageId)
  useEffect(() => { setBereichId('') }, [anlageId])
  useEffect(() => {
    setNotiz(anlage?.notizen ?? ''); setPlanungsnotiz(anlage?.planungsnotiz ?? '')
    setNeuerVerwalter(''); setAnlageName(anlage?.name ?? '')
    setAdresse({ strasse: anlage?.strasse ?? '', plz: anlage?.plz ?? '', ort: anlage?.ort ?? '' })
    setBetreuer(anlage?.objekt_betreuer ?? '')
  }, [anlageId])
  useEffect(() => {
    setKName({ kurz: kunde?.name_kurz ?? '', lang: kunde?.name_lang ?? '' })
    setAMergeModus(false); setAMergeWahl(new Set()); setAMergeZiel('')
  }, [kundeId])

  const aMergeToggle = (id: string) => setAMergeWahl(w => {
    const n = new Set(w)
    if (n.has(id)) { n.delete(id); if (aMergeZiel === id) setAMergeZiel([...n][0] ?? '') }
    else { n.add(id); if (!aMergeZiel) setAMergeZiel(id) }
    return n
  })
  const anlagenZusammenfuehren = async () => {
    const ziel = aMergeZiel || [...aMergeWahl][0]
    const quellen = [...aMergeWahl].filter(id => id !== ziel)
    if (!ziel || quellen.length === 0) return
    try {
      const erg = await db.anlagenZusammenfuehren(ziel, quellen)
      setMeldung(erg + ' Die Quellen sind jetzt Untersuchungsbereiche der Ziel-Anlage, Historie vollständig erhalten.')
      setAMergeModus(false); setAMergeWahl(new Set()); setAMergeZiel(''); setAnlageId(ziel); laden()
    } catch (e: any) { setMeldung('Fehler: ' + (e.message ?? e)) }
  }
  const kundeUmbenennen = async () => {
    if (!kunde) return
    await db.kundeAktualisieren(kunde.id, { name_kurz: kName.kurz, name_lang: kName.lang })
    setMeldung('Kunde umbenannt.'); laden()
  }
  const anlageAktivSetzen = async (aktiv: boolean) => {
    if (!anlage) return
    await db.anlageAktualisieren(anlage.id, { aktiv })
    setMeldung(aktiv
      ? 'Anlage wieder aktiv – erscheint erneut in den Fälligkeits-Ansichten.'
      : 'Anlage inaktiv gesetzt – keine Fälligkeits-Erinnerungen mehr, jederzeit reaktivierbar.')
    laden()
  }

  const anlageSpeichernDetails = async () => {
    if (!anlage) return
    await db.anlageAktualisieren(anlage.id, {
      name: anlageName.trim() || anlage.name,
      strasse: adresse.strasse || undefined, plz: adresse.plz || undefined, ort: adresse.ort || undefined,
      objekt_betreuer: betreuer || undefined,
      notizen: notiz || undefined, planungsnotiz: planungsnotiz || null,
    })
    setMeldung('Objekt-Details gespeichert.'); laden()
  }
  const verwalterWechseln = async () => {
    if (!anlage || !neuerVerwalter) return
    await db.verwalterWechseln(anlage.id, neuerVerwalter)
    setMeldung('Verwalter gewechselt – Objekt und komplette Historie hängen jetzt am neuen Kunden.')
    setKundeId(neuerVerwalter); laden()
  }
  const bereicheDerAnlage = bereiche.filter(b => b.anlage_id === anlageId)
  const bereichStatus = (b: Bereich) => {
    const fachPhasen = phasen.filter(p => p.bereich_id === b.id)
      .sort((a, c) => (c.eroeffnet_am || '').localeCompare(a.eroeffnet_am || ''))
    const offen = fachPhasen.find(p => !['regelturnus_bestaetigt', 'abgeschlossen'].includes(p.status))
    const letzte = fachPhasen[0]
    const bTermine = termine
      .filter(t => t.bereich_id === b.id)
      .sort((a, c) => (c.datum || '').localeCompare(a.datum || ''))
    const bAuftraege = auftraege.filter(a => a.bereich_id === b.id)
    const hatAuffaellig = bAuftraege.some(a => a.unterauftraege.some(u => ['ueberschritten', 'nachuntersuchung_erforderlich'].includes(u.ergebnis)))
    if (offen) return { text: PHASE_TEXT[offen.status], klasse: offen.status === 'nachuntersuchung' ? 'medium' : 'active', icon: 'fa-triangle-exclamation' }
    if (letzte?.status === 'regelturnus_bestaetigt') return { text: 'Regelturnus bestätigt', klasse: 'closed', icon: 'fa-circle-check' }
    if (hatAuffaellig) return { text: 'Historie auffällig', klasse: 'medium', icon: 'fa-clock-rotate-left' }
    if (bTermine.length > 0) return { text: `Regelturnus · letzte ${fmtDatum(bTermine[0].datum)}`, klasse: 'closed', icon: 'fa-calendar-check' }
    return { text: 'Regelturnus', klasse: 'neutral', icon: 'fa-circle-info' }
  }

  const kundeSpeichern = async () => {
    if (!kf.name_lang) return
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
      <Meldung text={meldung} onWeg={() => setMeldung('')} />
      <div className="stamm-spalten">
        {/* ── Spalte 1: Kunden ── */}
        <div className="stamm-spalte">
          <div className="stamm-kopf">
            <h3><i className="fas fa-building-user" aria-hidden="true"></i> Kunden ({kundenGefiltert.length})</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="zeile-btn" style={mergeModus ? { background: '#6c757d', borderColor: '#6c757d' } : undefined}
                onClick={() => { setMergeModus(!mergeModus); setMergeWahl(new Set()); setMergeZiel('') }}
                title="Bisherige Einzelkunden als Anlagen unter einem Zielkunden übernehmen">
                <i className="fas fa-right-long" aria-hidden="true"></i> {mergeModus ? 'Abbrechen' : 'Übernehmen'}
              </button>
              {!mergeModus && <button className="zeile-btn" onClick={() => setNeuKunde(!neuKunde)}>
                <i className="fas fa-plus" aria-hidden="true"></i> Neu
              </button>}
            </div>
          </div>
          <div className="suchfeld" style={{ margin: '0 12px 10px' }}>
            <i className="fas fa-magnifying-glass" aria-hidden="true"></i>
            <input placeholder="Kunde suchen …" value={suche} onChange={e => setSuche(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setSuche('')} />
            {suche && <button className="suchfeld-x" onClick={() => setSuche('')} aria-label="Suche leeren">×</button>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.76rem', padding: '0 14px 8px', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={inaktiveKunden} onChange={e => setInaktiveKunden(e.target.checked)} />
            inaktive Kunden anzeigen
          </label>
          {neuKunde && (
            <div className="stamm-formular">
              <input placeholder="Vollständiger Name (wie in HV)" value={kf.name_lang} onChange={e => setKf({ ...kf, name_lang: e.target.value })} />
              <input placeholder="Kurzname für Outlook-Titel (optional)" value={kf.name_kurz} onChange={e => setKf({ ...kf, name_kurz: e.target.value })} />
              <select value={kf.typ} onChange={e => setKf({ ...kf, typ: e.target.value as Kundentyp })}>
                {Object.entries(TYP).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input placeholder="Telefon" value={kf.telefon} onChange={e => setKf({ ...kf, telefon: e.target.value })} />
              <input placeholder="E-Mail" value={kf.email} onChange={e => setKf({ ...kf, email: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary" onClick={kundeSpeichern}>Anlegen</button>
                <button onClick={() => setNeuKunde(false)}>Abbrechen</button>
              </div>
            </div>
          )}
          {mergeModus && (
            <div className="merge-leiste">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem' }}>
                <input type="radio" checked={!mergeNeu} onChange={() => setMergeNeu(false)} />
                In bestehenden Zielkunden übernehmen (<i className="fas fa-star" style={{ color: '#b45309' }}></i> = Dachkunde)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem' }}>
                <input type="radio" checked={mergeNeu} onChange={() => setMergeNeu(true)} />
                In <strong>neuen</strong> Zielkunden übernehmen
              </label>
              {mergeNeu && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ flex: 1 }} placeholder="Voller Name, z. B. AWO Bezirksverband Schwaben e.V." value={mergeNeuName.lang}
                    onChange={e => setMergeNeuName({ ...mergeNeuName, lang: e.target.value })} />
                  <input style={{ width: 130 }} placeholder="Kurz (optional)" value={mergeNeuName.kurz}
                    onChange={e => setMergeNeuName({ ...mergeNeuName, kurz: e.target.value })} />
                </div>
              )}
              <p className="hint" style={{ margin: 0 }}>
                Fachlicher AWO-Modus: der Zielkunde bleibt links als Dachkunde. Alle anderen angekreuzten
                Kunden rutschen eine Ebene nach rechts und erscheinen dort als Anlagen/Objekte – inklusive
                Bereiche, Termine, Aufträge und Historie. Die Quellkunden werden nur inaktiv archiviert.
              </p>
              <button className="primary" onClick={zusammenfuehren}
                disabled={mergeNeu ? (mergeWahl.size < 1 || !mergeNeuName.lang.trim())
                                   : mergeWahl.size < 2}>
                <i className="fas fa-object-group" aria-hidden="true"></i>
                {mergeNeu
                  ? (mergeWahl.size < 1 ? 'Kunden ankreuzen' : !mergeNeuName.lang.trim() ? 'Namen des neuen Zielkunden eingeben' : `${mergeWahl.size} Kunden → Anlagen unter ${mergeNeuName.lang.trim()}`)
                  : (mergeWahl.size < 2 ? 'Ziel + Quellen ankreuzen' : `${mergeWahl.size - 1} Kunde(n) als Anlagen übernehmen`)}
              </button>
            </div>
          )}
          <div className="stamm-liste">
            {kundenGefiltert.map(k => (
              mergeModus ? (
                <label key={k.id} className={`stamm-eintrag merge ${mergeWahl.has(k.id) ? 'markiert' : ''} ${mergeZiel === k.id ? 'ziel' : ''}`}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={mergeWahl.has(k.id)} onChange={() => mergeToggle(k.id)} />
                    <strong>{kundeAnzeige(k)}</strong>
                    {mergeWahl.has(k.id) && (
                      <button type="button" className="ziel-stern" title={mergeZiel === k.id ? 'Ziel' : 'Als Ziel wählen'}
                        onClick={e => { e.preventDefault(); setMergeZiel(k.id) }}>
                        <i className={`${mergeZiel === k.id ? 'fas' : 'far'} fa-star`} aria-hidden="true"></i>
                        {mergeZiel === k.id ? ' Ziel' : ''}
                      </button>
                    )}
                  </span>
                  <span className="hint">{k.name_lang}</span>
                  <span className="stamm-zahl">{anlagen.filter(a => a.kunde_id === k.id).length}</span>
                </label>
              ) : (
              <button key={k.id} className={`stamm-eintrag ${k.id === kundeId ? 'aktiv' : ''}`}
                onClick={() => { setKundeId(k.id); setAnlageId('') }}>
                <strong>{k.name_lang}</strong>
                {k.name_kurz && <span className="hint">Kurz: {k.name_kurz}</span>}
                <span className="stamm-zahl">{anlagen.filter(a => a.kunde_id === k.id).length}</span>
              </button>
              )
            ))}
            {kundenGefiltert.length === 0 && <p className="hint" style={{ padding: '0 14px' }}>Keine Kunden gefunden.</p>}
          </div>
        </div>

        {/* ── Spalte 2: Anlagen des Kunden ── */}
        <div className="stamm-spalte">
          <div className="stamm-kopf">
            <h3><i className="fas fa-building" aria-hidden="true"></i> Anlagen {kunde ? `– ${kundeAnzeige(kunde)} (${anlagenDesKunden.length})` : ''}</h3>
            {kunde && <div style={{ display: 'flex', gap: 6 }}>
              <button className="zeile-btn" style={aMergeModus ? { background: '#6c757d', borderColor: '#6c757d' } : undefined}
                onClick={() => { setAMergeModus(!aMergeModus); setAMergeWahl(new Set()); setAMergeZiel('') }}
                title="Mehrere Anlagen zu einer zusammenführen (Quellen werden Bereiche)">
                <i className="fas fa-object-group" aria-hidden="true"></i>
              </button>
              {!aMergeModus && <button className="zeile-btn" onClick={() => setNeuAnlage(!neuAnlage)}>
                <i className="fas fa-plus" aria-hidden="true"></i> Neu
              </button>}
            </div>}
          </div>
          {kunde && !aMergeModus && (
            <div className="stamm-formular" style={{ background: '#fbfdff' }}>
              <span className="hint" style={{ fontWeight: 650 }}>Kunde bearbeiten</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ width: 110 }} value={kName.kurz} onChange={e => setKName({ ...kName, kurz: e.target.value })} placeholder="Kurzname" />
                <input style={{ flex: 1 }} value={kName.lang} onChange={e => setKName({ ...kName, lang: e.target.value })} placeholder="Vollständiger Name" />
                <button onClick={kundeUmbenennen} title="Namen speichern"><i className="fas fa-floppy-disk" aria-hidden="true"></i></button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem' }}>
                <input type="checkbox" checked={inaktiveAnzeigen} onChange={e => setInaktiveAnzeigen(e.target.checked)} />
                inaktive Anlagen anzeigen
              </label>
            </div>
          )}
          {kunde && aMergeModus && (
            <div className="merge-leiste">
              <p className="hint" style={{ margin: 0 }}>
                Anlagen ankreuzen – <i className="fas fa-star" style={{ color: '#b45309' }}></i> markiert das Ziel.
                Die Quellen werden zu <strong>Untersuchungsbereichen</strong> der Ziel-Anlage, ihre komplette
                Historie wandert mit.
              </p>
              <button className="primary" onClick={anlagenZusammenfuehren} disabled={aMergeWahl.size < 2}>
                <i className="fas fa-object-group" aria-hidden="true"></i>
                {aMergeWahl.size < 2 ? 'Mind. 2 Anlagen ankreuzen' : `${aMergeWahl.size} Anlagen zusammenführen`}
              </button>
            </div>
          )}
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary" onClick={anlageSpeichern}>Anlegen</button>
                <button onClick={() => setNeuAnlage(false)}>Abbrechen</button>
              </div>
            </div>
          )}
          <div className="stamm-liste">
            {anlagenDesKunden.map(a => (
              aMergeModus ? (
                <label key={a.id} className={`stamm-eintrag merge ${aMergeWahl.has(a.id) ? 'markiert' : ''} ${aMergeZiel === a.id ? 'ziel' : ''}`}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={aMergeWahl.has(a.id)} onChange={() => aMergeToggle(a.id)} />
                    <strong>{a.name}</strong>
                    {aMergeWahl.has(a.id) && (
                      <button type="button" className="ziel-stern" onClick={e => { e.preventDefault(); setAMergeZiel(a.id) }}>
                        <i className={`${aMergeZiel === a.id ? 'fas' : 'far'} fa-star`} aria-hidden="true"></i>
                        {aMergeZiel === a.id ? ' Ziel' : ''}
                      </button>
                    )}
                  </span>
                  <span className="hint">{[a.plz, a.ort].filter(Boolean).join(' ')}</span>
                </label>
              ) : (
              <button key={a.id} className={`stamm-eintrag ${a.id === anlageId ? 'aktiv' : ''} ${!a.aktiv ? 'inaktiv' : ''}`} onClick={() => setAnlageId(a.id)}>
                <strong>{a.name}{!a.aktiv && <span className="badge neutral" style={{ marginLeft: 6 }}>inaktiv</span>}</strong>
                <span className="hint">{[a.plz, a.ort].filter(Boolean).join(' ')} · fällig {fmtDatum(a.naechste_untersuchung)}</span>
                <span className="stamm-zahl">{bereiche.filter(b => b.anlage_id === a.id).length}</span>
              </button>
              )
            ))}
            {kunde && anlagenDesKunden.length === 0 && <p className="hint" style={{ padding: '0 14px' }}>Noch keine Anlagen – oben „Neu“.</p>}
          </div>
        </div>

        {/* ── Spalte 3: Bereiche (WWB) mit eigenen Details ── */}
        <div className="stamm-spalte breit">
          <div className="stamm-kopf">
            <h3><i className="fas fa-diagram-project" aria-hidden="true"></i> Untersuchungsbereiche (WWB) {anlage ? `(${bereicheDerAnlage.length})` : ''}</h3>
            {anlage && <button className="zeile-btn" onClick={() => { setHistorieBereich(undefined); setHistorieOffen(true) }}>
              <i className="fas fa-clock-rotate-left" aria-hidden="true"></i> Gesamt-Historie
            </button>}
          </div>
          {!anlage && <p className="hint" style={{ padding: '4px 14px' }}>← In der Mitte eine Anlage (Objekt/Standort) wählen.</p>}

          {anlage && (
            <div className="bereich-raster">
              {/* Objekt-Ebene: Adresse, Betreuer, Zugang, Aktiv, Verwalterwechsel */}
              <details className="objekt-box" open>
                <summary><i className="fas fa-building" aria-hidden="true"></i> Objekt: {anlage.name}
                  {!anlage.aktiv && <span className="badge neutral" style={{ marginLeft: 6 }}>inaktiv</span>}</summary>
                <div className="stamm-formular" style={{ borderBottom: 'none' }}>
                  <span className="hint" style={{ fontWeight: 650 }}>Objektname</span>
                  <input value={anlageName} onChange={e => setAnlageName(e.target.value)} />
                  <span className="hint" style={{ fontWeight: 650 }}>Adresse (Objekt gesamt)</span>
                  <input placeholder="Straße" value={adresse.strasse} onChange={e => setAdresse({ ...adresse, strasse: e.target.value })} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input placeholder="PLZ" style={{ width: 90 }} value={adresse.plz} onChange={e => setAdresse({ ...adresse, plz: e.target.value })} />
                    <input placeholder="Ort" style={{ flex: 1 }} value={adresse.ort} onChange={e => setAdresse({ ...adresse, ort: e.target.value })} />
                  </div>
                  <span className="hint" style={{ fontWeight: 650 }}>Objektbetreuer (optional)</span>
                  <input placeholder="z. B. Hr. Maier, 0821 …" value={betreuer} onChange={e => setBetreuer(e.target.value)} />
                  <span className="hint" style={{ fontWeight: 650 }}>Zugang / Notizen</span>
                  <textarea rows={2} placeholder="z. B. Schlüssel beim Hausmeister" value={notiz} onChange={e => setNotiz(e.target.value)} />
                  <span className="hint" style={{ fontWeight: 650 }}>Planungsvermerk (nimmt Objekt aus Fälligkeits-Ansichten)</span>
                  <textarea rows={2} placeholder="z. B. Heizung wird erneuert – zurückstellen" value={planungsnotiz} onChange={e => setPlanungsnotiz(e.target.value)} />
                  <button className="primary" onClick={anlageSpeichernDetails}>
                    <i className="fas fa-floppy-disk" aria-hidden="true"></i> Objekt speichern
                  </button>

                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <select style={{ flex: 1 }} value={neuerVerwalter} onChange={e => setNeuerVerwalter(e.target.value)}>
                      <option value="">Verwalter wechseln zu …</option>
                      {kunden.filter(k => k.id !== kundeId).map(k => <option key={k.id} value={k.id}>{k.name_lang}</option>)}
                    </select>
                    <button onClick={verwalterWechseln} disabled={!neuerVerwalter} title="Objekt + Historie zum neuen Kunden">
                      <i className="fas fa-right-left" aria-hidden="true"></i>
                    </button>
                  </div>
                  {anlage.aktiv
                    ? <button className="secondary" onClick={() => anlageAktivSetzen(false)}><i className="fas fa-pause" aria-hidden="true"></i> Objekt inaktiv setzen</button>
                    : <button className="primary" onClick={() => anlageAktivSetzen(true)}><i className="fas fa-play" aria-hidden="true"></i> Objekt reaktivieren</button>}
                </div>
              </details>

              {/* Bereichs-Ebene: je WWB eigene Adresse/Details/Historie */}
              <div className="bereich-liste">
                {bereicheDerAnlage.map(b => {
                  const ansicht = bereichAnsicht(b)
                  const status = bereichStatus(b)
                  return (
                  <div key={b.id} className={`bereich-karte ${b.id === bereichId ? 'aktiv' : ''} ${ansicht.uebernommen ? 'uebernommen' : ''}`}>
                    <button className="bereich-kopf" onClick={() => setBereichId(b.id === bereichId ? '' : b.id)}>
                      <span className="bereich-titelzeile">
                        <strong><i className={`fas fa-chevron-${b.id === bereichId ? 'down' : 'right'}`} style={{ fontSize: '.7rem', marginRight: 6 }}></i>{ansicht.titel}</strong>
                        <span className={`badge ${status.klasse}`}><i className={`fas ${status.icon}`} aria-hidden="true"></i> {status.text}</span>
                      </span>
                      {ansicht.herkunft && <span className="bereich-herkunft"><i className="fas fa-layer-group" aria-hidden="true"></i> ehemalige Anlage: {ansicht.herkunft}</span>}
                      {(b.strasse || b.hausnummer) && <span className="hint">{[b.strasse, b.hausnummer].filter(Boolean).join(' ')}</span>}
                    </button>
                    {b.id === bereichId && (
                      <div className="stamm-formular" style={{ borderBottom: 'none', paddingTop: 6 }}>
                        <input placeholder="Bereichsname, z. B. Altbau / Haus 7" value={bf.name} onChange={e => setBf({ ...bf, name: e.target.value })} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input placeholder="Straße (falls abweichend)" style={{ flex: 1 }} value={bf.strasse} onChange={e => setBf({ ...bf, strasse: e.target.value })} />
                          <input placeholder="Haus-Nr." style={{ width: 90 }} value={bf.hausnummer} onChange={e => setBf({ ...bf, hausnummer: e.target.value })} />
                        </div>
                        <input placeholder="WW-System-Details (optional)" value={bf.wwb_details} onChange={e => setBf({ ...bf, wwb_details: e.target.value })} />
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="primary" onClick={bereichSpeichernDetails}><i className="fas fa-floppy-disk" aria-hidden="true"></i> Speichern</button>
                          <button onClick={() => { setHistorieBereich(b.id); setHistorieOffen(true) }}><i className="fas fa-clock-rotate-left" aria-hidden="true"></i> Historie</button>
                          <button className="secondary" onClick={() => bereichEntfernen(b.id)} title="Bereich entfernen"><i className="fas fa-trash-can" aria-hidden="true"></i></button>
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
                <div className="pm-bereich-neu" style={{ margin: '8px 0 0' }}>
                  <input placeholder="Neuer Bereich, z. B. Neubau / Haus 7" value={neuBereichName}
                    onChange={e => setNeuBereichName(e.target.value)} onKeyDown={e => e.key === 'Enter' && bereichSpeichern()} />
                  <button className="primary" onClick={bereichSpeichern} disabled={!neuBereichName.trim()}>
                    <i className="fas fa-plus" aria-hidden="true"></i> Bereich
                  </button>
                </div>
                {bereicheDerAnlage.length === 0 && <p className="hint" style={{ padding: '4px 2px' }}>
                  Noch keine Bereiche. Bei einem einzelnen WW-System z. B. „Gesamtanlage"; bei mehreren je System einen Bereich mit eigener Adresse.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {historieOffen && anlage && (
        <HistorieModal anlage={anlage} kunde={kunde} termine={termine}
          auftraege={auftraege} bereiche={bereiche} nurBereich={historieBereich}
          onClose={() => setHistorieOffen(false)} />
      )}
    </>
  )
}
