import { useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { HomePage } from './lobby/HomePage'
import { WaitingRoom } from './lobby/WaitingRoom'
import { GameContainer } from './components/GameContainer'
import { ConnectionBanner } from './components/ConnectionBanner'
import { useRoomState } from './hooks/useRoomState'
import { useHostEngine } from './hooks/useHostEngine'
import { useHostPresence } from './hooks/useHostPresence'
import { useWakeLock } from './hooks/useWakeLock'
import { GameRegistry } from './games/registry'
import type { Player } from './games/types'
import './games/register'
import './App.css'

type AppScreen = 'home' | 'waiting' | 'playing'

function App() {
  const [screen, setScreen] = useState<AppScreen>('home')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)

  const { gameState, roomStatus, gameId, connected } = useRoomState(roomId)
  const hostOnline = useHostPresence(roomId, playerId, isHost)

  useHostEngine(roomId, gameId, isHost, gameState)

  // Keep screen awake during game (especially important for host)
  useWakeLock(screen === 'playing')

  // When room status changes to 'playing', switch to playing screen
  if (roomStatus === 'playing' && screen === 'waiting') {
    setScreen('playing')
  }

  // When room status changes back to 'waiting' (return to lobby), switch to waiting screen
  if (roomStatus === 'waiting' && screen === 'playing') {
    setScreen('waiting')
  }

  const handleJoinRoom = useCallback((newRoomId: string, newPlayerId: string, host: boolean) => {
    setRoomId(newRoomId)
    setPlayerId(newPlayerId)
    setIsHost(host)
    setScreen('waiting')
  }, [])

  const handleGameStart = useCallback(() => {
    setScreen('playing')
  }, [])

  const handleLeave = useCallback(() => {
    setRoomId(null)
    setPlayerId(null)
    setIsHost(false)
    setScreen('home')
  }, [])

  const handleReplay = useCallback(async () => {
    if (!roomId || !gameId) return
    const plugin = GameRegistry.get(gameId)
    if (!plugin) return

    // Fetch current players
    const { data: playersData } = await supabase
      .from('players')
      .select('id, nickname, is_host')
      .eq('room_id', roomId)

    if (!playersData || playersData.length === 0) return

    const gamePlayers: Player[] = playersData.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.is_host,
    }))

    const newGameState = plugin.initGame(gamePlayers)

    // Clear old actions and reset game state
    await supabase.from('actions').delete().eq('room_id', roomId)
    await supabase
      .from('rooms')
      .update({ game_state: newGameState, status: 'playing' })
      .eq('id', roomId)
  }, [roomId, gameId])

  const handleReturnLobby = useCallback(async () => {
    if (!roomId) return

    // Clear actions and reset room to waiting
    await supabase.from('actions').delete().eq('room_id', roomId)
    await supabase
      .from('rooms')
      .update({ game_state: null, status: 'waiting' })
      .eq('id', roomId)

    setScreen('waiting')
  }, [roomId])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <ConnectionBanner connected={connected} />

      {!hostOnline && screen === 'playing' && !isHost && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-600 text-white text-center py-2 text-sm z-40">
          房主已断线，游戏暂停，等待房主重新连接
        </div>
      )}

      {screen === 'home' && (
        <HomePage onJoinRoom={handleJoinRoom} />
      )}

      {screen === 'waiting' && roomId && playerId && (
        <WaitingRoom
          roomId={roomId}
          playerId={playerId}
          isHost={isHost}
          onGameStart={handleGameStart}
          onLeave={handleLeave}
        />
      )}

      {screen === 'playing' && roomId && playerId && gameId && gameState && (
        <GameContainer
          gameId={gameId}
          roomId={roomId}
          playerId={playerId}
          gameState={gameState}
          isHost={isHost}
          onReplay={handleReplay}
          onReturnLobby={handleReturnLobby}
        />
      )}
    </div>
  )
}

export default App
