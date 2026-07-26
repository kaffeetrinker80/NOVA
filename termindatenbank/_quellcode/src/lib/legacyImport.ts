/**
 * Übernahme der Alt-Daten aus "Terminverwaltung V4" (JSON-Export der Excel-Datenbank).
 *
 * Abbildung:
 *   Verwaltung              → Kunde
 *   Wohnanlage/Objekt+PLZ+Ort → Anlage
 *   (je Anlage ein Standard-Untersuchungsbereich, später aufteilbar)
 *   "1. U" … "30. U", "Nor", Historie, "Letzte Unters." → historische Termine (abgeschlossen)
 *
 * Bewusst KEINE Auftragsnummern für historische Termine: die Alt-Nummern sind nicht
 * im Export enthalten, und der zentrale Zähler darf keine erfundenen Nummern vergeben.
 */

export interface LegacyDatensatz { [feld: string]: any }

export interface ImportVorschau {
  kunden: { legacy_id: string; name_lang: string; name_kurz: string; typ: string }[]
  anlagen: {
    legacy_id: string; kunde_legacy: string; name: string; plz?: string; ort?: string
    objekt_referenz?: string; turnus_monate?: number; naechste_untersuchung?: string
    notizen?: string; planungsnotiz?: string
  }[]
  termine: { legacy_id: string; anlage_legacy: string; datum: string; geplant?: boolean }[]
  uebersprungen: number
}

const text = (v: any): string => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim())

/** Deutsches oder ISO-Datum → ISO (YYYY-MM-DD), sonst null. */
export function parseDatum(v: any): string | null {
  const s = text(v)
  if (!s) return null
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (de) {
    const [, d, m, y] = de
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  return null
}

/** "3 Jahre" → 36, "1 Jahr" → 12, "3 Monate"/"vierteljährlich" → 3 */
export function parseTurnus(v: any): number | undefined {
  const s = text(v).toLowerCase().replace(/-/g, ' ')
  if (/\b3\s*(mon|monat)/.test(s) || s.includes('viertelj')) return 3
  if (/\b1\s*(jahr|jähr|jaehr)/.test(s)) return 12
  if (/\b3\s*(jahr|jähr|jaehr)/.test(s)) return 36
  return undefined
}

/** Spalten "1. U" … "30. U" sowie "Nor" enthalten Untersuchungsdaten. */
function istHistorienFeld(feld: string): boolean {
  const f = feld.trim()
  return /^\d+\.\s*U$/i.test(f) || f.toLowerCase() === 'nor'
}

function untersuchungsdaten(rec: LegacyDatensatz): string[] {
  const werte: any[] = []
  for (const [feld, wert] of Object.entries(rec)) {
    if (istHistorienFeld(feld)) werte.push(wert)
  }
  const hist = rec['Historie']
  if (Array.isArray(hist)) werte.push(...hist)
  else if (hist) werte.push(hist)
  werte.push(rec['Letzte Unters.'])

  const datumsliste = werte.map(parseDatum).filter((d): d is string => !!d)
  return [...new Set(datumsliste)].sort()
}

/** Stabile Anlagen-Kennung – bewusst ohne Verwaltung, damit ein Verwalterwechsel die Anlage nicht dupliziert. */
function anlagenSchluessel(rec: LegacyDatensatz): string {
  return ['Verw. Nr.', 'Wohnanlage/Objekt', 'PLZ', 'Ort']
    .map(f => text(rec[f]).toLowerCase()).join('|')
}

function kurzname(name: string): string {
  const ohneRechtsform = name
    .replace(/\b(GmbH|mbH|AG|KG|GbR|e\.?\s?V\.?|&\s*Co\.?|OHG|UG)\b/gi, '')
    .replace(/\b(Hausverwaltung|Immobilienverwaltung|Immobilien|Verwaltung)\b/gi, '')
    .replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  return (ohneRechtsform || name).split(' ')[0].slice(0, 30)
}

function kundentyp(name: string): string {
  const s = name.toLowerCase()
  if (/privat|familie|herr|frau/.test(s)) return 'privatkunde'
  if (/pflege|senioren|heim|caritas|diakonie/.test(s)) return 'pflegetraeger'
  if (/wohnungsbau|wohnbau|baugenossenschaft|wbg/.test(s)) return 'wohnungsbau'
  if (/verwaltung|immobilien|hausverw/.test(s)) return 'hausverwaltung'
  return 'sonstige'
}

export function vorschauErzeugen(datensaetze: LegacyDatensatz[]): ImportVorschau {
  const kunden = new Map<string, ImportVorschau['kunden'][0]>()
  const anlagen = new Map<string, ImportVorschau['anlagen'][0]>()
  const termine: ImportVorschau['termine'] = []
  let uebersprungen = 0

  for (const rec of datensaetze) {
    const objekt = text(rec['Wohnanlage/Objekt'])
    if (!objekt) { uebersprungen++; continue }

    const verwaltung = text(rec['Verwaltung']) || 'Ohne Verwaltung'
    const kundeKey = 'verw:' + verwaltung.toLowerCase()
    if (!kunden.has(kundeKey)) {
      kunden.set(kundeKey, {
        legacy_id: kundeKey,
        name_lang: verwaltung,
        name_kurz: verwaltung,          // Kurzname = voller Name; wird bei Bedarf manuell angepasst
        typ: kundentyp(verwaltung),
      })
    }

    const anlageKey = 'anl:' + anlagenSchluessel(rec)
    if (!anlagen.has(anlageKey)) {
      anlagen.set(anlageKey, {
        legacy_id: anlageKey,
        kunde_legacy: kundeKey,
        name: objekt,
        plz: text(rec['PLZ']) || undefined,
        ort: text(rec['Ort']) || undefined,
        objekt_referenz: text(rec['Verw. Nr.']) || undefined,
        turnus_monate: parseTurnus(rec['Turnus']),
        naechste_untersuchung: parseDatum(rec['Nächste Unters.']) ?? undefined,
        notizen: [
          text(rec['Hygiene Inspektion']) || null,
          rec['Phase'] === true ? 'Alt-Kennzeichen: aktive Überschreitungsphase' : null,
        ].filter(Boolean).join(' · ') || undefined,
      })

      for (const datum of untersuchungsdaten(rec)) {
        termine.push({ legacy_id: `${anlageKey}@${datum}`, anlage_legacy: anlageKey, datum })
      }
      // "Geplant"-Spalte: Datum -> zukünftiger Termin; Freitext -> Planungsnotiz
      // (beides nimmt die Anlage aus den zeitbasierten Ansichten, wie im alten Dashboard)
      const geplantRoh = text(rec['Geplant'])
      const geplant = parseDatum(geplantRoh)
      if (geplant) {
        termine.push({ legacy_id: `${anlageKey}@geplant@${geplant}`, anlage_legacy: anlageKey, datum: geplant, geplant: true })
      } else if (geplantRoh) {
        anlagen.get(anlageKey)!.planungsnotiz = geplantRoh
      }
    }
  }

  return {
    kunden: [...kunden.values()],
    anlagen: [...anlagen.values()],
    termine,
    uebersprungen,
  }
}
