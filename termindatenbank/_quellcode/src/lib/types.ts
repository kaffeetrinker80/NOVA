export type Kundentyp = 'hausverwaltung' | 'pflegetraeger' | 'wohnungsbau' | 'privatkunde' | 'sonstige'
export type Terminstatus = 'geplant' | 'bestaetigt' | 'abgeschlossen' | 'abgesagt' | 'verschoben'
export type Untersuchungsart = 'legionellen' | 'mibi' | 'chemie' | 'vorortparameter' | 'sonstiges'
export type Auftragsstatus = 'offen' | 'beprobt' | 'im_labor' | 'abgeschlossen' | 'storniert'
export type Ergebnisstatus = 'offen' | 'unauffaellig' | 'ueberschritten' | 'nachuntersuchung_erforderlich'
export type Rolle = 'admin' | 'disposition' | 'probenehmer' | 'lesend'
export type BerichtStatus = 'ausstehend' | 'eingegangen' | 'geprueft'
export type Befund = 'offen' | 'sauber' | 'ueberschreitung' | 'verkeimung' | 'nicht_bewertbar'
export type PhasenStatus = 'aktiv' | 'massnahmen_laufen' | 'nachuntersuchung' | 'regelturnus_bestaetigt' | 'abgeschlossen'

export interface Kunde {
  id: string; name_lang: string; name_kurz: string; typ: Kundentyp
  strasse?: string; plz?: string; ort?: string; telefon?: string; email?: string
  notizen?: string; aktiv: boolean
}
export interface Anlage {
  id: string; kunde_id: string; name: string
  strasse?: string; plz?: string; ort?: string; objekt_referenz?: string
  turnus_monate?: number; naechste_untersuchung?: string
  notizen?: string; planungsnotiz?: string; objekt_betreuer?: string
  proben_anzahl?: number; aktiv: boolean
}
export interface Bereich {
  id: string; anlage_id: string; name: string
  beschreibung?: string; wwb_details?: string; notizen?: string
  strasse?: string; hausnummer?: string; aktiv: boolean
}
export interface Termin {
  id: string; kunde_id: string; anlage_id: string; bereich_id?: string
  datum: string; beginn?: string; ende?: string
  status: Terminstatus; frist?: string; notizen?: string
  probenehmer: string[]
  kalender_exportiert: boolean
}
export interface Unterauftrag {
  id: string; auftrag_id: string; suffix: string
  art: Untersuchungsart; umfang?: string
  proben_geplant?: number; proben_ist?: number
  status: Auftragsstatus; ergebnis: Ergebnisstatus; notizen?: string
}
export interface Auftrag {
  id: string; auftragsnummer: string; jahr: number
  bereich_id: string; termin_id?: string
  status: Auftragsstatus; notizen?: string
  unterauftraege: Unterauftrag[]
}
export interface Untersuchungsbewertung {
  id: string; unterauftrag_id: string; bericht_status: BerichtStatus
  pruefbericht_nummer?: string; pruefbericht_datum?: string; befund: Befund
  bewertungsdatum?: string; zaehlt_als_saubere_nachuntersuchung: boolean
  bemerkung?: string; phase_id?: string | null
}
export interface Ueberschreitungsphase {
  id: string; bereich_id: string; ausloesende_bewertung_id?: string
  eroeffnet_am: string; ausloeser: 'ueberschreitung' | 'verkeimung' | 'behoerdenanordnung' | 'sonstiges'
  status: PhasenStatus; massnahmen_abschluss_am?: string; saubere_nu_erforderlich: number
  gesundheitsamt_freigabe_am?: string; gesundheitsamt_aktenzeichen?: string
  abgeschlossen_am?: string; begruendung_abweichung?: string; notizen?: string
}

export const ART_LABEL: Record<Untersuchungsart, string> = {
  legionellen: 'Legionellen', mibi: 'Mikrobiologie', chemie: 'Chemie',
  vorortparameter: 'Vorortparameter', sonstiges: 'Sonstiges',
}
export const ERGEBNIS_LABEL: Record<Ergebnisstatus, string> = {
  offen: 'offen', unauffaellig: 'unauffällig', ueberschritten: 'überschritten',
  nachuntersuchung_erforderlich: 'Nachuntersuchung',
}
export const STATUS_LABEL: Record<Auftragsstatus, string> = {
  offen: 'offen', beprobt: 'beprobt', im_labor: 'im Labor',
  abgeschlossen: 'abgeschlossen', storniert: 'storniert',
}
export const TERMIN_LABEL: Record<Terminstatus, string> = {
  geplant: 'geplant', bestaetigt: 'bestätigt', abgeschlossen: 'abgeschlossen',
  abgesagt: 'abgesagt', verschoben: 'verschoben',
}

export function nummerVoll(a: Auftrag, u: Unterauftrag): string {
  return u.suffix ? `${a.auftragsnummer}-${u.suffix}` : a.auftragsnummer
}
export function fmtDatum(iso?: string): string {
  if (!iso) return '–'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}


/** Anzeigename eines Kunden: IMMER der volle Name. */
export function kundeAnzeige(k?: { name_lang?: string; name_kurz?: string }): string {
  return k?.name_lang || k?.name_kurz || '–'
}
/** Kurzname NUR für den Outlook-Titel; fällt auf den vollen Namen zurück. */
export function kundeOutlook(k?: { name_lang?: string; name_kurz?: string }): string {
  return (k?.name_kurz && k.name_kurz.trim()) ? k.name_kurz : (k?.name_lang || '')
}
