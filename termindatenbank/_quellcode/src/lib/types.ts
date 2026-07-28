export type Kundentyp = 'hausverwaltung' | 'pflegetraeger' | 'wohnungsbau' | 'privatkunde' | 'sonstige'
export type Terminstatus = 'geplant' | 'bestaetigt' | 'abgeschlossen' | 'abgesagt' | 'verschoben'
export type Untersuchungsart = 'legionellen' | 'mibi' | 'chemie' | 'vorortparameter' | 'sonstiges'
export type Auftragsstatus = 'offen' | 'beprobt' | 'im_labor' | 'abgeschlossen' | 'storniert'
export type Ergebnisstatus = 'offen' | 'unauffaellig' | 'ueberschritten' | 'nachuntersuchung_erforderlich'
export type Rolle = 'admin' | 'disposition' | 'probenehmer' | 'lesend'
export type BerichtStatus = 'ausstehend' | 'eingegangen' | 'geprueft'
export type Befund = 'offen' | 'sauber' | 'ueberschreitung'
export type PhasenStatus = 'aktiv' | 'massnahmen_laufen' | 'nachuntersuchung' | 'regelturnus_bestaetigt' | 'abgeschlossen'
export type FachlicheUntersuchungsart = 'orientierend' | 'weitergehend' | 'nachuntersuchung' | 'nichtamtliche_eigenprobe'
export type Folgeentscheidung =
  | 'regelturnus_bleibt'
  | 'weitergehende_untersuchung'
  | 'nachuntersuchung'
  | 'ueberschreitungsphase_starten'
  | 'phase_fortfuehren'
  | 'regelturnus_durch_gesundheitsamt'
export type Turnusart = 'regelturnus' | 'sonderturnus' | 'behoerdlich'
export type Betreuungsstatus = 'aktiv' | 'pausiert' | 'nicht_mehr_unser_kunde'
export type HistorieEinordnung = 'unbekannt' | 'regulaer' | 'als_weitergehend_uebernommen' | 'als_nu_uebernommen'

export interface Kunde {
  id: string; name_lang: string; name_kurz: string; typ: Kundentyp
  strasse?: string; plz?: string; ort?: string; telefon?: string; email?: string
  notizen?: string; aktiv: boolean
}
export interface Anlage {
  id: string; kunde_id: string; name: string
  strasse?: string; plz?: string; ort?: string; objekt_referenz?: string
  turnus_monate?: number; naechste_untersuchung?: string
  notizen?: string; info?: string; planungsnotiz?: string; objekt_betreuer?: string
  proben_anzahl?: number; aktiv: boolean
}
export interface Bereich {
  id: string; anlage_id: string; name: string
  beschreibung?: string; wwb_details?: string; notizen?: string
  strasse?: string; hausnummer?: string; aktiv: boolean
  turnus_monate?: number; turnus_art?: Turnusart; turnus_begruendung?: string
  naechste_untersuchung?: string; proben_anzahl?: number
  planungsnotiz?: string; betreuungsstatus?: Betreuungsstatus
  standard_legionellen?: boolean; standard_mibi?: boolean
  standard_mibi_umfang?: 'Standard' | 'Komplett' | 'inklusive Enterokokken'
  standard_chemie?: boolean
  legacy_quelle?: string
}
export interface Termin {
  id: string; kunde_id: string; anlage_id: string; bereich_id?: string
  datum: string; beginn?: string; ende?: string
  status: Terminstatus; frist?: string; notizen?: string
  fachliche_untersuchungsart?: FachlicheUntersuchungsart
  historie_einordnung?: HistorieEinordnung
  befund?: Befund; pruefbericht_nummer?: string; pruefbericht_datum?: string
  historie_bemerkung?: string
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
  fachliche_untersuchungsart?: FachlicheUntersuchungsart
  status: Auftragsstatus; notizen?: string
  unterauftraege: Unterauftrag[]
}
export interface Untersuchungsbewertung {
  id: string; unterauftrag_id: string; bericht_status: BerichtStatus
  pruefbericht_nummer?: string; pruefbericht_datum?: string; befund: Befund
  bewertungsdatum?: string; zaehlt_als_saubere_nachuntersuchung: boolean
  folgeentscheidung?: Folgeentscheidung
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
  offen: 'offen', unauffaellig: 'ohne Befund', ueberschritten: 'Überschreitung',
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
export const FACHLICHE_ART_LABEL: Record<FachlicheUntersuchungsart, string> = {
  orientierend: 'orientierende Untersuchung',
  weitergehend: 'weitergehende Untersuchung',
  nachuntersuchung: 'Nachuntersuchung',
  nichtamtliche_eigenprobe: 'nichtamtliche Eigenprobe',
}
export const FOLGE_LABEL: Record<Folgeentscheidung, string> = {
  regelturnus_bleibt: 'Regelturnus bleibt',
  weitergehende_untersuchung: 'weitergehende Untersuchung erforderlich',
  nachuntersuchung: 'Nachuntersuchung erforderlich',
  ueberschreitungsphase_starten: 'Überschreitungsphase starten',
  phase_fortfuehren: 'Phase fortführen',
  regelturnus_durch_gesundheitsamt: 'Rückkehr Regelturnus durch Gesundheitsamt',
}
export const BEFUND_LABEL: Record<Befund, string> = {
  offen: 'unbekannt / nicht erfasst',
  sauber: 'ohne Befund (= sauber)',
  ueberschreitung: 'Überschreitung',
}
export const HISTORIE_EINORDNUNG_LABEL: Record<HistorieEinordnung, string> = {
  unbekannt: 'noch fachlich ungeklärt',
  regulaer: 'regulär bei uns durchgeführt',
  als_weitergehend_uebernommen: 'als weitergehende Untersuchung übernommen (kein Vorverlauf bei uns)',
  als_nu_uebernommen: 'als Nachuntersuchung übernommen (kein Vorverlauf bei uns)',
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
