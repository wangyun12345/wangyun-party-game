import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface PlayerRow {
  id: string
  room_id: string
  nickname: string
  is_host: boolean
  joined_at: string
}

export function usePlayers(roomId: string | null) {
  const [players, setPlayers] = useState<PlayerRow[]>([])

  useEffect(() => {
    if (!roomId) return

    const fetchPlayers = async () => {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true })

      if (data) setPlayers(data)
    }
    fetchPlayers()

    const channel = supabase
      .channel(`players-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => {
          fetchPlayers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return players
}
