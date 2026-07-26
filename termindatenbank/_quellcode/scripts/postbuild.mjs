/**
 * Hängt eine Versionsnummer an die Verweise in index.html.
 * Die Dateinamen bleiben fest (sauberes Überschreiben beim Upload),
 * die Versionsnummer sorgt trotzdem dafür, dass Browser die neue
 * Fassung laden statt der zwischengespeicherten alten.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const pfad = 'dist/index.html'
const version = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')

let html = readFileSync(pfad, 'utf8')
html = html
  .replace(/(assets\/app\.js)(\?v=\d+)?/g, `$1?v=${version}`)
  .replace(/(assets\/app\.css)(\?v=\d+)?/g, `$1?v=${version}`)
writeFileSync(pfad, html)

console.log(`index.html: Version ${version} eingetragen`)
