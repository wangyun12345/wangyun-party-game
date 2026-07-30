import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../games/types'

export function useRoomState(roomId: string | null) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [roomStatus, setRoomStatus] = useState<string>('waiting')
  const [gameId, setGameId] = useState<string | null>(null)
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    if (!roomId) return

    // Initial fetch
    const fetchRoom = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('game_state, status, game_id')
        .eq('id', roomId)
        .single()

      if (data) {
        setGameState(data.game_state as GameState | null)
        setRoomStatus(data.status)
        setGameId(data.game_id)
      }
    }
    fetchRoom()

    // Subscribe to changes
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { game_state: GameState; status: string; game_id: string }
          setGameState(row.game_state)
          setRoomStatus(row.status)
          setGameId(row.game_id)
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return { gameState, roomStatus, gameId, connected }
}
