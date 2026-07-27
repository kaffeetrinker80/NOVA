import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/data'
import type { Anlage, Auftrag, Bereich, Kunde, Termin, Untersuchungsart } from '../lib/types'
import { ART_LABEL, ERGEBNIS_LABEL, STATUS_LABEL, fmtDatum, nummerVoll, kundeAnzeige } from '../lib/types'
import { Abschnitt, ErgebnisBadge, Nr, StatusBadge } from '../components/ui'
import BerichtModal from '../components/BerichtModal'

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
  const [nvArt, setNvArt] = useState<Untersuchungsart>('legionellen')
  const [nvManuell, setNvManuell] = useState(false)
  const [nvNummer, setNvNummer] = useState('')
  const [nvMeldung, setNvMeldung] = useState('')
  const [berichtAuftrag, setBerichtAuftrag] = useState<Auftrag | null>(null)

  const laden = () => {
    db.auftraege().then(setAuftraege); db.kunden().then(setKunden)
    db.anlagen().then(setAnlagen); db.bereiche().then(setBereiche); db.termine().then(setTermine)
  }
  useEffect(laden, [])

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
    try {
      const nr = await db.auftragAnlegen(nvBereich, nvTermin || undefined,
        [{ art: nvArt, suffix: '' }], nvManuell ? nvNummer.trim() : undefined)
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
                  {termine.filter(t => t.anlage_id === nvAnlage && t.status !== 'abgesagt').sort((a, b) => b.datum.localeCompare(a.datum)).map(t => <option key={t.id} value={t.id}>{fmtDatum(t.datum)} · {t.status}</option>)}
                </select>
              </label>
              <label className="f">Untersuchungsart
                <select value={nvArt} onChange={e => setNvArt(e.target.value as Untersuchungsart)}>
                  {Object.entries(ART_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
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
          <th>Art / Umfang</th><th>Proben (Soll/Ist)</th><th>Status</th><th>Ergebnis</th><th></th>
        </tr></thead>
        <tbody>
          {gefiltert.map(z => (
            <tr key={z.u.id}>
              <td><Nr>{z.nummer}</Nr></td>
              <td>{kundeAnzeige(z.kunde)}</td>
              <td>{z.anlage?.name ?? '–'}</td>
              <td>{z.bereich?.name ?? '–'}</td>
              <td>{fmtDatum(z.termin?.datum)}</td>
              <td>{ART_LABEL[z.u.art]}{z.u.umfang ? <div className="hint">{z.u.umfang}</div> : null}</td>
              <td>
                {z.u.proben_geplant ?? '–'} / {bearbeite === z.u.id
                  ? <input type="number" style={{ width: 64 }} defaultValue={z.u.proben_ist ?? ''} onBlur={e => { speichern(z.u.id, 'proben_ist', e.target.value); setBearbeite(null) }} autoFocus />
                  : <span onClick={() => setBearbeite(z.u.id)} style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}>{z.u.proben_ist ?? '–'}</span>}
              </td>
              <td><StatusBadge s={z.u.status} /></td>
              <td><ErgebnisBadge s={z.u.ergebnis} /></td>
              <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                <button className="zeile-btn" onClick={() => setBerichtAuftrag(z.a)} title="Prüfbericht erfassen">
                  <i className="fas fa-file-circle-check" aria-hidden="true"></i> Bericht
                </button>
              </td>
            </tr>
          ))}
          {gefiltert.length === 0 && <tr><td colSpan={10} className="hint">Keine Aufträge für die gewählten Filter.</td></tr>}
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
    </>
  )
}
