import type { Anlage, Auftrag, Bereich, Kunde, Termin } from './types'
import { ART_LABEL, fmtDatum, nummerVoll } from './types'

export interface KalenderKontext {
  termin: Termin; kunde: Kunde; anlage: Anlage
  auftraege: { auftrag: Auftrag; bereich: Bereich }[]
}

const zeit = (t?: string) => (t ? t.replace(':', ':') + ' Uhr' : '')

export function kalenderTitel(k: KalenderKontext): string {
  const nr = k.auftraege[0]?.auftrag.auftragsnummer ?? '–'
  const ort = [k.anlage.strasse ?? k.anlage.name, k.anlage.ort].filter(Boolean).join(', ')
  return `Probenahme Nr. ${nr} – ${zeit(k.termin.beginn)} bis ${zeit(k.termin.ende)} – ${ort}, ${k.kunde.name_kurz}`
}

export function kalenderBeschreibung(k: KalenderKontext): string {
  const zeilen: string[] = []
  zeilen.push(`Kunde: ${k.kunde.name_lang} (${k.kunde.name_kurz})`)
  zeilen.push(`Adresse: ${[k.anlage.strasse, [k.anlage.plz, k.anlage.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')}`)
  zeilen.push(`Datum: ${fmtDatum(k.termin.datum)}, ${zeit(k.termin.beginn)} – ${zeit(k.termin.ende)}`)
  zeilen.push('')
  zeilen.push('Untersuchungsbereiche und Auftragsnummern:')
  for (const { auftrag, bereich } of k.auftraege) {
    zeilen.push(`  ${bereich.name}: ${auftrag.auftragsnummer}`)
  }
  zeilen.push('')
  zeilen.push('Geplante Untersuchungen:')
  for (const { auftrag, bereich } of k.auftraege) {
    for (const u of auftrag.unterauftraege) {
      const teile = [`  ${nummerVoll(auftrag, u)} – ${ART_LABEL[u.art]}`]
      if (u.umfang) teile.push(`(${u.umfang})`)
      if (u.proben_geplant != null) teile.push(`– ${u.proben_geplant} Proben geplant`)
      teile.push(`– ${bereich.name}`)
      zeilen.push(teile.join(' '))
    }
  }
  const umfangHinweise = k.auftraege.flatMap(x => x.auftrag.unterauftraege)
    .filter(u => u.art === 'mibi' && u.umfang)
    .map(u => `MIBI ${u.umfang}`)
  if (umfangHinweise.length) {
    zeilen.push('')
    zeilen.push('Wichtig: ' + [...new Set(umfangHinweise)].join('; '))
  }
  if (k.termin.notizen) {
    zeilen.push('')
    zeilen.push('Hinweise: ' + k.termin.notizen)
  }
  return zeilen.join('\n')
}

function icsDatum(datum: string, uhrzeit?: string): string {
  const d = datum.replace(/-/g, '')
  const t = (uhrzeit ?? '09:00').replace(':', '') + '00'
  return `${d}T${t}`
}
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

export function icsErzeugen(k: KalenderKontext): string {
  const uid = `${k.auftraege[0]?.auftrag.auftragsnummer ?? k.termin.id}@nova-wasser`
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NOVA Wasser//Terminplanung//DE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Berlin:${icsDatum(k.termin.datum, k.termin.beginn)}`,
    `DTEND;TZID=Europe/Berlin:${icsDatum(k.termin.datum, k.termin.ende)}`,
    `SUMMARY:${esc(kalenderTitel(k))}`,
    `DESCRIPTION:${esc(kalenderBeschreibung(k))}`,
    `LOCATION:${esc([k.anlage.strasse, k.anlage.plz, k.anlage.ort].filter(Boolean).join(', '))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export function icsHerunterladen(k: KalenderKontext): void {
  const blob = new Blob([icsErzeugen(k)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Probenahme_${(k.auftraege[0]?.auftrag.auftragsnummer ?? k.termin.datum).replace(/[^\w-]/g, '_')}.ics`
  a.click()
  URL.revokeObjectURL(a.href)
}
