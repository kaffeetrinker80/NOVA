import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Bereich, Kunde, Untersuchungsart } from '../lib/types'
import { ART_LABEL, kundeAnzeige, kundeOutlook } from '../lib/types'
import {
  ACHTUNG_VARIANTEN, ART_VARIANTEN, PROBENEHMER,
  aushangDrucken, aushangHtml, type AushangDaten,
} from '../lib/aushang'

interface ArtWahl { art: Untersuchungsart; suffix: string; umfang?: string; proben_geplant?: number; aktiv: boolean }
const artenStandard = (proben?: number): ArtWahl[] => [
  { art: 'legionellen', suffix: '', aktiv: true, proben_geplant: proben },
  { art: 'mibi', suffix: 'M', umfang: 'Standard', aktiv: false },
  { art: 'chemie', suffix: 'C', aktiv: false },
  { art: 'vorortparameter', suffix: 'V', aktiv: false },
]

interface Ergebnis { bereichName: string; nummer: string }

export default function PlanModal({ anlage, kunde, bereiche, onClose, onSaved }: {
  anlage: Anlage
  kunde: Kunde | undefined
  bereiche: Bereich[]
  onClose: () => void
  onSaved: () => void
}) {
  const [tab, setTab] = useState<'termin' | 'outlook' | 'aushang'>('termin')

  // ── Gemeinsame Felder (Vorgaben wie im alten Dashboard: heute + 25 Tage, 08–10 Uhr) ──
  const [datum, setDatum] = useState(() => new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10))
  const [von, setVon] = useState('08:00')
  const [bis, setBis] = useState('10:00')

  // ── Bereiche & Arten ──
  const eigene = bereiche.filter(b => b.anlage_id === anlage.id)
  const [wahl, setWahl] = useState<Record<string, ArtWahl[]>>(() =>
    eigene.length === 1 ? { [eigene[0].id]: artenStandard(anlage.proben_anzahl) } : {})
  const [neuerBereich, setNeuerBereich] = useState('')

  // ── Nummernvergabe ──
  const [vorschau, setVorschau] = useState('…')
  const [manuell, setManuell] = useState(false)
  const [manuellNr, setManuellNr] = useState('')

  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[] | null>(null)

  // ── Aushang ──
  const [achtungId, setAchtungId] = useState('1')
  const [artId, setArtId] = useState('1')
  const [pnIndex, setPnIndex] = useState(0)

  useEffect(() => { db.nummerVorschau().then(setVorschau).catch(() => setVorschau('–')) }, [])

  const toggleBereich = (id: string) =>
    setWahl(w => (id in w ? Object.fromEntries(Object.entries(w).filter(([k]) => k !== id)) : { ...w, [id]: artenStandard(anlage.proben_anzahl) }))

  const bereichAnlegen = async () => {
    if (!neuerBereich.trim()) return
    await db.bereichAnlegen({ anlage_id: anlage.id, name: neuerBereich.trim() })
    setNeuerBereich('')
    onSaved() // Bereiche neu laden (kommt über Props zurück)
  }

  const speichern = async () => {
    const aktiveBereiche = Object.entries(wahl).filter(([, arten]) => arten.some(a => a.aktiv))
    if (!aktiveBereiche.length) { setFehler('Mindestens einen Untersuchungsbereich mit einer Untersuchungsart wählen.'); return }
    if (manuell && !/^\d{2}-\d{4}$/.test(manuellNr.trim())) {
      setFehler('Manuelle Nummer im Format JJ-NNNN eingeben, z. B. 26-0899.'); return
    }
    setLaeuft(true); setFehler('')
    try {
      const terminId = await db.terminAnlegen({
        kunde_id: anlage.kunde_id, anlage_id: anlage.id,
        datum, beginn: von, ende: bis, status: 'geplant',
      })
      const erg: Ergebnis[] = []
      let erste = true
      for (const [bereichId, arten] of aktiveBereiche) {
        const aktive = arten.filter(a => a.aktiv)
        const payload = aktive.length === 1
          ? [{ ...aktive[0], suffix: '' }]
          : aktive.map((a, i) => ({ ...a, suffix: i === 0 ? '' : a.suffix }))
        const nr = await db.auftragAnlegen(
          bereichId, terminId,
          payload.map(({ aktiv, ...rest }) => rest),
          erste && manuell ? manuellNr.trim() : undefined, // manueller Eingriff gilt für den ersten Bereich
        )
        erg.push({ bereichName: eigene.find(b => b.id === bereichId)?.name ?? '?', nummer: nr })
        erste = false
      }
      setErgebnisse(erg)
      setTab('outlook')
      onSaved()
    } catch (e: any) {
      setFehler(e.message ?? String(e))
    }
    setLaeuft(false)
  }

  // ── Outlook: Titel exakt im gewohnten Format ──
  const outlookTitel = useMemo(() => {
    const nr = ergebnisse?.[0]?.nummer ?? (manuell && manuellNr ? manuellNr : vorschau)
    return `Probenahme Nr. ${nr} - ${von} Uhr bis ${bis} Uhr ${anlage.name}, ${anlage.ort ?? ''} - ${kundeOutlook(kunde)}`
  }, [ergebnisse, vorschau, manuell, manuellNr, von, bis, anlage, kunde])

  const outlookBody = useMemo(() => {
    const zeilen = [`${anlage.name}, ${anlage.ort ?? ''} – ${kunde?.name_lang ?? ''}`]
    if (ergebnisse?.length) {
      zeilen.push('', 'Untersuchungsbereiche und Auftragsnummern:')
      for (const e of ergebnisse) zeilen.push(`  ${e.bereichName}: ${e.nummer}`)
    }
    return zeilen.join('\n')
  }, [ergebnisse, anlage, kunde])

  const [kopiert, setKopiert] = useState(false)
  const titelKopieren = async () => {
    await navigator.clipboard.writeText(outlookTitel)
    setKopiert(true); setTimeout(() => setKopiert(false), 2000)
  }

  const owaOeffnen = () => {
    const url = 'https://outlook.office.com/calendar/action/compose'
      + '?subject=' + encodeURIComponent(outlookTitel)
      + '&startdt=' + encodeURIComponent(`${datum}T${von}:00`)
      + '&enddt=' + encodeURIComponent(`${datum}T${bis}:00`)
      + '&body=' + encodeURIComponent(outlookBody)
      + '&location=' + encodeURIComponent(`${anlage.name}, ${anlage.ort ?? ''}`)
    window.open(url, '_blank')
  }

  const icsLaden = () => {
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NOVAplan//DE', 'BEGIN:VEVENT',
      `UID:${(ergebnisse?.[0]?.nummer ?? datum)}@novaplan`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;TZID=Europe/Berlin:${datum.replace(/-/g, '')}T${von.replace(':', '')}00`,
      `DTEND;TZID=Europe/Berlin:${datum.replace(/-/g, '')}T${bis.replace(':', '')}00`,
      `SUMMARY:${esc(outlookTitel)}`, `DESCRIPTION:${esc(outlookBody)}`,
      `LOCATION:${esc(`${anlage.name}, ${anlage.ort ?? ''}`)}`,
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    a.download = `Probenahme_${(ergebnisse?.[0]?.nummer ?? datum).replace(/[^\w-]/g, '_')}.ics`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const aushangDaten: AushangDaten = {
    achtungId, artId,
    verwaltung: kunde?.name_lang ?? '',
    objekt: anlage.name, ort: anlage.ort ?? '',
    datum, von, bis,
    probenehmer: PROBENEHMER[pnIndex],
    logoUrl: `${import.meta.env.BASE_URL}nova_logo.png`,
  }

  const T = ({ id, icon, label, gesperrt }: { id: typeof tab; icon: string; label: string; gesperrt?: boolean }) => (
    <button className={`pm-tab ${tab === id ? 'active' : ''}`} disabled={gesperrt}
      onClick={() => setTab(id)} title={gesperrt ? 'Erst Termin & Auftrag anlegen' : undefined}>
      <i className={`fas ${icon}`} aria-hidden="true"></i> {label}
    </button>
  )

  return (
    <div className="modal-hintergrund" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Planung ${anlage.name}`}>
        <div className="modal-kopf">
          <div>
            <strong>{anlage.name}</strong>
            <div className="hint">{kundeAnzeige(kunde)} · {[anlage.plz, anlage.ort].filter(Boolean).join(' ')}</div>
          </div>
          <button className="modal-schliessen" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        <div className="pm-tabs">
          <T id="termin" icon="fa-hashtag" label="Termin & Auftrag" />
          <T id="outlook" icon="fa-calendar-plus" label="Outlook" />
          <T id="aushang" icon="fa-file-alt" label="Türanschlag" />
        </div>

        {/* Gemeinsame Felder */}
        <div className="pm-gemeinsam">
          <label className="f">Datum<input type="date" value={datum} onChange={e => setDatum(e.target.value)} /></label>
          <label className="f">Von<input type="time" value={von} onChange={e => setVon(e.target.value)} /></label>
          <label className="f">Bis<input type="time" value={bis} onChange={e => setBis(e.target.value)} /></label>
        </div>

        {fehler && <div className="notice" style={{ margin: '0 24px 12px' }}>{fehler}</div>}
        {ergebnisse && (
          <div className="pm-erfolg">
            <i className="fas fa-check-circle" aria-hidden="true"></i>&nbsp;
            Angelegt: {ergebnisse.map(e => `${e.bereichName} = ${e.nummer}`).join(' · ')}
          </div>
        )}

        {tab === 'termin' && (
          <div className="pm-inhalt">
            {eigene.map(b => (
              <div key={b.id} className={`pm-bereich ${b.id in wahl ? 'gewaehlt' : ''}`}>
                <label className="pm-bereich-kopf">
                  <input type="checkbox" checked={b.id in wahl} onChange={() => toggleBereich(b.id)} />
                  <strong>{b.name}</strong>
                  {b.beschreibung && <span className="hint">{b.beschreibung}</span>}
                </label>
                {b.id in wahl && (
                  <div className="pm-arten">
                    {wahl[b.id].map((a, i) => (
                      <label key={a.art} className={`pm-art ${a.aktiv ? 'an' : ''}`}>
                        <input type="checkbox" checked={a.aktiv} onChange={() =>
                          setWahl(w => ({ ...w, [b.id]: w[b.id].map((x, j) => j === i ? { ...x, aktiv: !x.aktiv } : x) }))} />
                        {ART_LABEL[a.art]}
                        {a.art === 'mibi' && a.aktiv && (
                          <select value={a.umfang} onClick={e => e.stopPropagation()} onChange={e =>
                            setWahl(w => ({ ...w, [b.id]: w[b.id].map((x, j) => j === i ? { ...x, umfang: e.target.value } : x) }))}>
                            <option>Standard</option><option>Komplett</option><option>inklusive Enterokokken</option>
                          </select>
                        )}
                        {a.aktiv && (
                          <input type="number" min={0} placeholder="Proben" title="Proben geplant"
                            style={{ width: 70 }} value={a.proben_geplant ?? ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setWahl(w => ({ ...w, [b.id]: w[b.id].map((x, j) => j === i ? { ...x, proben_geplant: e.target.value ? +e.target.value : undefined } : x) }))} />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="pm-bereich-neu">
              <input placeholder="Neuen Untersuchungsbereich anlegen, z. B. Haus 7" value={neuerBereich}
                onChange={e => setNeuerBereich(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && bereichAnlegen()} />
              <button onClick={bereichAnlegen} disabled={!neuerBereich.trim()}>
                <i className="fas fa-plus" aria-hidden="true"></i> Bereich
              </button>
            </div>

            <div className="pm-nummer">
              <div>
                <span className="hint">Auftragsnummer</span><br />
                {manuell
                  ? <input value={manuellNr} onChange={e => setManuellNr(e.target.value)} placeholder={vorschau} style={{ width: 110, fontWeight: 700 }} autoFocus />
                  : <span className="nr" style={{ fontSize: '1.05rem' }}>{vorschau}</span>}
                {!manuell && <span className="hint"> wird automatisch vergeben{Object.keys(wahl).length > 1 ? ', weitere Bereiche fortlaufend' : ''}</span>}
              </div>
              <label className="pm-manuell">
                <input type="checkbox" checked={manuell} onChange={e => setManuell(e.target.checked)} />
                manuell eingreifen
              </label>
            </div>
            {manuell && (
              <div className="notice" style={{ margin: '0 24px 12px' }}>
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>&nbsp;
                Manuelle Nummern nur im Ausnahmefall: Format JJ-NNNN, Doppelvergabe wird geprüft,
                der automatische Zähler zieht danach nach.
              </div>
            )}

            <div className="pm-fuss">
              <button className="primary" onClick={speichern} disabled={laeuft || !!ergebnisse}>
                <i className="fas fa-floppy-disk" aria-hidden="true"></i>
                {laeuft ? 'Wird angelegt …' : ergebnisse ? 'Angelegt ✓' : 'Termin & Auftrag anlegen'}
              </button>
              <button onClick={onClose}>Schließen</button>
            </div>
          </div>
        )}

        {tab === 'outlook' && (
          <div className="pm-inhalt">
            <div className="pm-vorschau">{outlookTitel}</div>
            {!ergebnisse && <p className="hint" style={{ padding: '0 24px' }}>
              Hinweis: Die endgültige Nummer erscheint nach „Termin &amp; Auftrag anlegen“ – aktuell wird die Vorschau-Nummer angezeigt.</p>}
            <div className="pm-fuss">
              <button className="primary" onClick={titelKopieren}>
                <i className={`fas ${kopiert ? 'fa-check' : 'fa-copy'}`} aria-hidden="true"></i> {kopiert ? 'Kopiert!' : 'Titel kopieren'}
              </button>
              <button onClick={owaOeffnen}><i className="fas fa-arrow-up-right-from-square" aria-hidden="true"></i> In Outlook öffnen</button>
              <button onClick={icsLaden}><i className="fas fa-download" aria-hidden="true"></i> ICS-Datei</button>
            </div>
          </div>
        )}

        {tab === 'aushang' && (
          <div className="pm-inhalt">
            <div className="pm-gemeinsam" style={{ paddingTop: 0 }}>
              <label className="f">Betroffene Wohnungen
                <select value={achtungId} onChange={e => setAchtungId(e.target.value)}>
                  {ACHTUNG_VARIANTEN.map(a => <option key={a.id} value={a.id}>{a.kurz}</option>)}
                </select>
              </label>
              <label className="f">Art
                <select value={artId} onChange={e => setArtId(e.target.value)}>
                  {ART_VARIANTEN.map(a => <option key={a.id} value={a.id}>{a.kurz}</option>)}
                </select>
              </label>
              <label className="f">Ansprechpartner
                <select value={pnIndex} onChange={e => setPnIndex(+e.target.value)}>
                  {PROBENEHMER.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
                </select>
              </label>
            </div>
            <div className="pm-aushang-vorschau">
              <div dangerouslySetInnerHTML={{ __html: aushangHtml(aushangDaten, true) }} />
            </div>
            <div className="pm-fuss">
              <button className="primary" onClick={() => aushangDrucken(aushangDaten)}>
                <i className="fas fa-print" aria-hidden="true"></i> Aushang drucken
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
