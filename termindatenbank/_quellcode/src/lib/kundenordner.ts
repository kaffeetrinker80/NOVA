/* ==========================================================
   Kundenordner-Anbindung (lokaler OneDrive-Ordner "Kunden")
   Nutzt die File System Access API (Chrome/Edge) und merkt sich
   die Ordnerwahl dauerhaft in IndexedDB – genau wie der
   Prüfberichte-Viewer. Im JSON stehen nur relative Pfade,
   dadurch funktioniert es auf jedem Rechner unabhängig davon,
   wo OneDrive liegt.
   ========================================================== */

const DB_NAME = 'novaplan'
const STORE = 'handles'
const KEY = 'kundenordner'

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
async function idbGet(key: string): Promise<any> {
  const db = await idb()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    tx.onsuccess = () => res(tx.result)
    tx.onerror = () => rej(tx.error)
  })
}
async function idbSet(key: string, val: any): Promise<void> {
  const db = await idb()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key)
    tx.onsuccess = () => res()
    tx.onerror = () => rej(tx.error)
  })
}
async function idbDel(key: string): Promise<void> {
  const db = await idb()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key)
    tx.onsuccess = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

export const dateiZugriffVerfuegbar = typeof (window as any).showDirectoryPicker === 'function'

/** Gespeicherten Ordner-Handle laden (ohne Berechtigungs-Dialog). */
export async function gespeicherterOrdner(): Promise<FileSystemDirectoryHandle | null> {
  try { return (await idbGet(KEY)) ?? null } catch { return null }
}

/** Ordner auswählen und dauerhaft merken. */
export async function ordnerWaehlen(): Promise<FileSystemDirectoryHandle | null> {
  if (!dateiZugriffVerfuegbar) return null
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'read', id: 'nova-kundenordner' })
  await idbSet(KEY, handle)
  return handle
}

export async function ordnerVergessen(): Promise<void> {
  try { await idbDel(KEY) } catch { /* egal */ }
}

/** Leseberechtigung sicherstellen (fragt bei Bedarf nach). */
export async function berechtigungSichern(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as any
  try {
    if ((await h.queryPermission({ mode: 'read' })) === 'granted') return true
    return (await h.requestPermission({ mode: 'read' })) === 'granted'
  } catch { return false }
}

/** PDF über den relativen Pfad im Kundenordner öffnen (neuer Tab). */
export async function pdfOeffnen(handle: FileSystemDirectoryHandle, relativerPfad: string): Promise<void> {
  const ok = await berechtigungSichern(handle)
  if (!ok) throw new Error('Kein Lesezugriff auf den Kundenordner.')
  const teile = relativerPfad.split('/').filter(Boolean)
  let dir: FileSystemDirectoryHandle = handle
  for (let i = 0; i < teile.length - 1; i++) {
    dir = await dir.getDirectoryHandle(teile[i])
  }
  const fh = await dir.getFileHandle(teile[teile.length - 1])
  const file = await fh.getFile()
  const url = URL.createObjectURL(file)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
