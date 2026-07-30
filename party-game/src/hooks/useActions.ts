import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

interface ActionRow {
  id: string
  room_id: string
  player_id: string
  payload: { type: string; payload?: Record<string, unknown> }
  created_at: string
}

export function useActions(roomId: string | null, onAction?: (action: ActionRow) => void) {
  const callbackRef = useRef(onAction)
  callbackRef.current = onAction

  useEffect(() => {
    if (!roomId || !callbackRef.current) return

    const channel = supabase
      .channel(`actions-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'actions', filter: `room_id=eq.${roomId}` },
        (payload) => {
          callbackRef.current?.(payload.new as ActionRow)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])
}

export async function submitAction(
  roomId: string,
  playerId: string,
  action: { type: string; payload?: Record<string, unknown> }
) {
  const { error } = await supabase.from('actions').insert({
    room_id: roomId,
    player_id: playerId,
    payload: action,
  })
  if (error) {
    console.error('Failed to submit action:', error)
  }
}
