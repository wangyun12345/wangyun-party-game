import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useHostPresence(roomId: string | null, playerId: string | null, isHost: boolean) {
  const [hostOnline, setHostOnline] = useState(true)

  useEffect(() => {
    if (!roomId || !playerId) return

    const channel = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: playerId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        // Check if any presence entry has isHost = true
        const hostPresent = Object.values(state).some((entries) =>
          (entries as unknown as { isHost: boolean }[]).some((e) => e.isHost)
        )
        setHostOnline(hostPresent)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ isHost })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, playerId, isHost])

  return hostOnline
}
