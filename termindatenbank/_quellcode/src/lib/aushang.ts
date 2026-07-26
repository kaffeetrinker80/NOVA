/**
 * Aushang für Hausbewohner – originalgetreu übernommen aus generate_dashboard.py.
 * Wird täglich genutzt: Ankündigung der Probenahme im Treppenhaus / an der Wohnungstür.
 */

export interface Probenehmer { name: string; tel: string }

export const PROBENEHMER: Probenehmer[] = [
  { name: 'Marco Neudecker', tel: '0179 2984819' },
  { name: 'Marcel Blum',     tel: '0177 2182328' },
  { name: 'Ismail Demir',    tel: '0176 15616161' },
  { name: 'Mirja Nowak',     tel: '0176 99935353' },
  { name: 'Nico Schmid',     tel: '0179 5480399' },
]

export const ACHTUNG_VARIANTEN: { id: string; kurz: string; zeilen: string }[] = [
  { id: '1', kurz: 'Oberste Etage',
    zeilen: 'Achtung!<br>Betrifft alle Wohnungen<br>der obersten Etage!' },
  { id: '2', kurz: 'Oberste Etage + Anschlag',
    zeilen: 'Achtung!<br>Betrifft alle Wohnungen<br>der obersten Etage und Wohnungen<br>mit Anschlag an der Wohnungstüre<br>bzw. Posteinwurf!' },
  { id: '3', kurz: 'Erdgeschoss + Anschlag',
    zeilen: 'Achtung!<br>Betrifft alle Wohnungen im Erdgeschoss<br>und Wohnungen mit Anschlag an der<br>Wohnungstüre bzw. Posteinwurf!' },
]

export const ART_VARIANTEN: { id: string; kurz: string; text: string }[] = [
  { id: '1', kurz: 'Amtliche Untersuchung', text: 'eine amtliche Untersuchung / Probenahme' },
  { id: '2', kurz: 'Nachuntersuchung',      text: 'eine Nachuntersuchung / erneute Probenahme' },
]

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export interface AushangDaten {
  achtungId: string
  artId: string
  verwaltung: string
  objekt: string
  ort: string
  datum: string        // ISO
  von: string
  bis: string
  probenehmer: Probenehmer
  logoUrl: string
}

export function aushangHtml(d: AushangDaten, vorschau: boolean): string {
  const s = vorschau ? 0.68 : 1
  const px = (n: number) => Math.round(n * s) + 'px'
  const logoH = vorschau ? '82px' : '120px'

  const variante = ACHTUNG_VARIANTEN.find(a => a.id === d.achtungId) ?? ACHTUNG_VARIANTEN[0]
  const teile = variante.zeilen.split('<br>')
  const achtungKopf = teile.shift() ?? ''
  const achtungRest = teile.join('<br>')
  const artText = (ART_VARIANTEN.find(a => a.id === d.artId) ?? ART_VARIANTEN[0]).text

  const dat = new Date(d.datum + 'T00:00:00')
  const wtag = WOCHENTAGE[dat.getDay()]
  const tagNr = dat.getDate()
  const monat = MONATE[dat.getMonth()]
  const jahr = dat.getFullYear()

  return `
<div style="font-family:Verdana,Arial,sans-serif;color:#000;width:100%;max-width:100%;">
  <div style="text-align:center;margin:${px(-10)} 0 ${px(-12)} 0;">
    <img src="${d.logoUrl}" style="height:${logoH};max-width:78%;object-fit:contain;" alt="NOVA Praxis-Hygiene GmbH">
  </div>

  <div style="color:#FF0000;font-weight:bold;text-decoration:underline;text-align:center;margin:0 auto ${px(24)} auto;max-width:96%;">
    <p style="font-size:${px(25)};line-height:1.05;letter-spacing:1px;margin:0 0 ${px(14)} 0;">${achtungKopf}</p>
    <p style="font-size:${px(24)};line-height:1.30;letter-spacing:.7px;margin:0;">${achtungRest}</p>
  </div>

  <p style="color:#0070C0;font-size:${px(22)};font-weight:bold;text-align:center;letter-spacing:${px(5)};margin:0 0 ${px(7)} 0;line-height:1.2;">INFORMATION</p>

  <p style="color:#0070C0;font-size:${px(12.5)};font-weight:bold;text-align:center;margin:0 0 ${px(22)} 0;line-height:1.42;letter-spacing:.4px;">Amtliche Trinkwasseruntersuchung im Auftrag von:<br>${d.verwaltung || '– Verwaltung –'}</p>

  <p style="color:#000;font-size:${px(13)};font-weight:bold;text-align:center;margin:0 0 ${px(5)} 0;line-height:1.38;">Sehr geehrte Hausbewohner,</p>
  <p style="color:#0070C0;font-size:${px(12.5)};font-weight:bold;text-align:center;margin:0 0 ${px(23)} 0;line-height:1.32;">${d.objekt || '– Objekt –'}${d.ort ? ', ' + d.ort : ''}</p>

  <p style="color:#000;font-size:${px(13)};font-weight:bold;text-align:center;margin:0 0 ${px(21)} 0;line-height:1.38;">Gemäß Trinkwasserverordnung muss in Ihrer Wohnung<br>${artText}<br>des Trinkwassers vorgenommen werden.</p>

  <p style="color:#FF0000;font-size:${px(16.8)};font-weight:bold;text-decoration:underline;text-align:center;margin:0 0 ${px(23)} 0;line-height:1.38;letter-spacing:.4px;">Diese erfolgt am ${wtag}, den ${tagNr}. ${monat} ${jahr},<br>zwischen ${d.von} und ${d.bis} Uhr!</p>

  <p style="color:#000;font-size:${px(13)};font-weight:bold;text-decoration:underline;text-align:center;margin:0 0 ${px(26)} 0;line-height:1.38;">Bitte sorgen Sie unbedingt dafür, dass wir in dieser Zeit<br>Zutritt zu Ihrer Wohnung haben können.</p>

  <p style="color:#000;font-size:${px(13)};font-weight:bold;text-align:center;margin:0 0 ${px(22)} 0;line-height:1.38;">Die Trinkwasserprobe muss unmittelbar<br>danach von uns in das Prüflabor gebracht werden.</p>

  <p style="color:#000;font-size:${px(12.6)};font-weight:bold;text-align:center;margin:0 auto ${px(22)} auto;line-height:1.38;max-width:95%;">Ihre geschätzte Mitarbeit und Ihr guter Wille sind unbedingt notwendig,<br>um die Maßnahmen zu einem erfolgreichen Abschluss zu bringen.<br>Andernfalls entstehen nur weiterer Zeitverlust und unnötige Kosten.</p>

  <p style="color:#000;font-size:${px(15)};font-weight:bold;text-align:center;margin:0 0 ${px(54)} 0;line-height:1.32;">Wir danken Ihnen herzlich für Ihre Mitarbeit!</p>

  <table style="width:100%;border-collapse:collapse;margin-top:0;">
    <tr>
      <td style="border:0;padding:${px(11)} ${px(14)} ${px(11)} 0;font-size:${px(11.2)};vertical-align:top;width:50%;line-height:1.52;color:#000;">
        <strong style="color:#0070C0;font-size:${px(12.2)};">NOVA Praxis-Hygiene GmbH</strong><br>
        Depotstr. 5 ½<br>
        86199 Augsburg<br>
        Tel.: 0821-65083089<br>
        E-Mail: info@nova-praxis.de<br>
        Web: www.nova-praxis.de
      </td>
      <td style="border:1.5pt solid #000;padding:${px(11)} ${px(16)};font-size:${px(13.8)};vertical-align:top;width:50%;line-height:1.50;color:#000;">
        Ihr Ansprechpartner für Terminvereinbarungen<br>
        innerhalb des o. g. Zeitraums:<br><br>
        <strong style="font-size:${px(16)};line-height:1.28;">${d.probenehmer.name}<br>${d.probenehmer.tel}</strong>
      </td>
    </tr>
  </table>
</div>`
}

/** Öffnet ein Druckfenster mit dem fertigen Aushang. */
export function aushangDrucken(d: AushangDaten): void {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>Aushang – ${d.objekt}</title>
    <style>@page{size:A4;margin:12mm}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
    </head><body>${aushangHtml(d, false)}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}
