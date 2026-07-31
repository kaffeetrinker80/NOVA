import { useEffect, useState } from 'react'
import { supabase } from '../lib/data'
import type { Rolle } from '../lib/types'

type PresenceEintrag = {
  user_id: string
  anzeigename: string
  rolle: Rolle
  online_seit: string
}

const ROLLE_LABEL: Record<Rolle, string> = {
  admin: 'Admin', disposition: 'Disposition', probenehmer: 'Probenehmer', lesend: 'Lesend',
}

const schluessel = (name: string) => name.trim().toLocaleLowerCase('de-DE')

export default function OnlineNutzer({ userId, anzeigename, rolle }: {
  userId: string
  anzeigename: string
  rolle: Rolle
}) {
  const [online, setOnline] = useState<PresenceEintrag[]>([])

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    const channel = client.channel('novaplan-online', {
      config: { presence: { key: userId } },
    })

    const synchronisieren = () => {
      const status = channel.presenceState() as Record<string, PresenceEintrag[]>
      const eindeutig = new Map<string, PresenceEintrag>()
      Object.values(status).flat().forEach(eintrag => {
        if (!eintrag?.anzeigename) return
        const key = schluessel(eintrag.anzeigename)
        if (!eindeutig.has(key)) eindeutig.set(key, eintrag)
      })
      setOnline([...eindeutig.values()].sort((a, b) => a.anzeigename.localeCompare(b.anzeigename, 'de')))
    }

    channel
      .on('presence', { event: 'sync' }, synchronisieren)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ user_id: userId, anzeigename, rolle, online_seit: new Date().toISOString() })
        }
      })

    return () => {
      void channel.untrack().finally(() => { void client.removeChannel(channel) })
    }
  }, [userId, anzeigename, rolle])

  const kurz = online.map(e => e.anzeigename.trim().split(/\s+/)[0]).join(', ')
  const details = online.map(e => `${e.anzeigename} (${ROLLE_LABEL[e.rolle]})`).join(', ')

  return (
    <div className="online-anzeige" title={details ? `Online: ${details}` : 'Online-Status wird verbunden'}>
      <span className={`online-punkt ${online.length ? 'verbunden' : ''}`} aria-hidden="true" />
      <span>{online.length ? `Online: ${kurz}` : 'Online …'}</span>
    </div>
  )
}
