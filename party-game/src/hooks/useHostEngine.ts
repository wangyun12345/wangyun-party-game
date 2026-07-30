import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { GameRegistry } from '../games/registry'
import { useActions } from './useActions'
import type { GameState } from '../games/types'

export function useHostEngine(
  roomId: string | null,
  gameId: string | null,
  isHost: boolean,
  gameState: GameState | null
) {
  const processAction = useCallback(
    async (actionRow: { player_id: string; payload: { type: string; payload?: Record<string, unknown> } }) => {
      if (!isHost || !roomId || !gameId || !gameState) return

      const plugin = GameRegistry.get(gameId)
      if (!plugin) return

      const action = {
        playerId: actionRow.player_id,
        type: actionRow.payload.type,
        payload: actionRow.payload.payload,
      }

      const newState = plugin.handleAction(gameState, action)

      const winResult = plugin.checkWinCondition(newState)
      const newStatus = winResult ? 'finished' : 'playing'

      await supabase
        .from('rooms')
        .update({ game_state: newState, status: newStatus })
        .eq('id', roomId)
    },
    [isHost, roomId, gameId, gameState]
  )

  useActions(roomId, isHost ? processAction : undefined)
}
