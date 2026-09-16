import { useCallback, useEffect, useMemo, useState } from 'react'
import { HomePage } from './lobby/HomePage'
import { WaitingRoom } from './lobby/WaitingRoom'
import { GameContainer } from './components/GameContainer'
import { ConnectionBanner } from './components/ConnectionBanner'
import { useRoomSocket } from './hooks/useRoomSocket'
import { clearSession, joinRoom, loadSession, saveSession, leaveRoom, type JoinResult } from './lib/roomClient'
import './games/register'
import './App.css'

function pathRoomCode(): string | null {
  const match = window.location.pathname.match(/^\/room\/([0-9]{6})\/?$/i)
  return match?.[1] ?? null
}

function App() {
  const initialRoomCode = useMemo(() => pathRoomCode(), [])
  const [joining, setJoining] = useState(Boolean(initialRoomCode && loadSession(initialRoomCode)))
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [isOrganizer, setIsOrganizer] = useState(false)
  const [joinError, setJoinError] = useState('')
  const { room, snapshot, status, error, sendCommand } = useRoomSocket(roomCode, sessionToken)

  const acceptJoin = useCallback((result: JoinResult) => {
    const code = result.roomCode ?? result.room.code
    setRoomCode(code)
    setSessionToken(result.sessionToken)
    setPlayerId(result.playerId)
    setIsOrganizer(result.room.organizerId === result.playerId)
    saveSession(code, result.sessionToken)
    setJoining(false)
    setJoinError('')
  }, [])

  useEffect(() => {
    if (!initialRoomCode) return
    const token = loadSession(initialRoomCode)
    if (!token) return
    let cancelled = false
    joinRoom(initialRoomCode, '恢复', token).then((result) => {
      if (!cancelled) acceptJoin(result)
    }).catch(() => {
      if (!cancelled) {
        clearSession(initialRoomCode)
        setJoining(false)
      }
    })
    return () => { cancelled = true }
  }, [acceptJoin, initialRoomCode])

  const handleLeave = useCallback(async () => {
    if (roomCode && sessionToken) {
      try { await leaveRoom(roomCode, sessionToken) } catch { /* room can already be expired */ }
      clearSession(roomCode)
    }
    setRoomCode(null)
    setSessionToken(null)
    setPlayerId(null)
    setIsOrganizer(false)
  }, [roomCode, sessionToken])

  if (joining) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">正在恢复房间...</div>

  const screen = !room || !playerId ? 'home' : room.status === 'waiting' ? 'waiting' : 'playing'
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <ConnectionBanner status={roomCode ? status : 'connected'} error={error?.message ?? joinError} />
      {screen === 'home' && <HomePage initialRoomCode={initialRoomCode} onJoinRoom={acceptJoin} />}
      {screen === 'waiting' && room && roomCode && playerId && (
        <WaitingRoom room={room} playerId={playerId} isOrganizer={isOrganizer} status={status} onCommand={sendCommand} onLeave={handleLeave} />
      )}
      {screen === 'playing' && room && playerId && snapshot?.game && (
        <GameContainer room={room} isOrganizer={isOrganizer} view={snapshot.game} winResult={snapshot.winResult} status={status} onCommand={sendCommand} />
      )}
    </div>
  )
}

export default App
