import { useCallback, useEffect, useRef, useState } from 'react'
import { RoomSocket, type RoomErrorMessage, type RoomSnapshot, type RoomView } from '../lib/roomClient'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export function useRoomSocket(roomCode: string | null, sessionToken: string | null) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [room, setRoom] = useState<RoomView | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [error, setError] = useState<RoomErrorMessage | null>(null)
  const socketRef = useRef<RoomSocket | null>(null)

  useEffect(() => {
    if (!roomCode || !sessionToken) return
    const socket = new RoomSocket(roomCode, sessionToken, (next) => {
      setSnapshot(next)
      setRoom(next.room)
      setError(null)
    }, setError, setStatus)
    socketRef.current = socket
    socket.connect()
    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [roomCode, sessionToken])

  const sendCommand = useCallback((type: string, payload?: Record<string, unknown>) => {
    socketRef.current?.send({ type, payload })
  }, [])

  return { snapshot, room, status, error, sendCommand }
}
