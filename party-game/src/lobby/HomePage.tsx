import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface HomePageProps {
  onJoinRoom: (roomId: string, playerId: string, isHost: boolean) => void
}

function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function HomePage({ onJoinRoom }: HomePageProps) {
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'home' | 'join'>('home')

  const validateNickname = (name: string): string | null => {
    if (!name.trim()) return '请输入昵称'
    if (name.trim().length < 2) return '昵称至少2个字符'
    if (name.trim().length > 12) return '昵称最多12个字符'
    return null
  }

  const handleCreateRoom = async () => {
    const nameError = validateNickname(nickname)
    if (nameError) {
      setError(nameError)
      return
    }

    setLoading(true)
    setError('')

    try {
      const code = generateRoomCode()

      // Create room
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({ code, status: 'waiting' })
        .select('id')
        .single()

      if (roomError || !room) {
        setError('创建房间失败，请重试')
        setLoading(false)
        return
      }

      // Create host player
      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({ room_id: room.id, nickname: nickname.trim(), is_host: true })
        .select('id')
        .single()

      if (playerError || !player) {
        setError('创建玩家失败，请重试')
        setLoading(false)
        return
      }

      // Update room with host_player_id
      await supabase
        .from('rooms')
        .update({ host_player_id: player.id })
        .eq('id', room.id)

      onJoinRoom(room.id, player.id, true)
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRoom = async () => {
    const nameError = validateNickname(nickname)
    if (nameError) {
      setError(nameError)
      return
    }

    if (!roomCode.trim() || roomCode.trim().length !== 6) {
      setError('请输入6位房间码')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Find room by code
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('id, status, game_id')
        .eq('code', roomCode.trim())
        .single()

      if (roomError || !room) {
        setError('房间不存在或已结束')
        setLoading(false)
        return
      }

      if (room.status !== 'waiting') {
        setError('房间已开始游戏，无法加入')
        setLoading(false)
        return
      }

      // Create player
      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({ room_id: room.id, nickname: nickname.trim(), is_host: false })
        .select('id')
        .single()

      if (playerError || !player) {
        setError('加入房间失败，请重试')
        setLoading(false)
        return
      }

      onJoinRoom(room.id, player.id, false)
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold mb-2">🎲 聚会桌游</h1>
      <p className="text-gray-400 mb-8">和朋友一起玩桌游</p>

      <div className="w-full max-w-sm space-y-4">
        <input
          type="text"
          placeholder="输入你的昵称"
          value={nickname}
          onChange={(e) => { setNickname(e.target.value); setError('') }}
          maxLength={12}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
        />

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {mode === 'home' ? (
          <div className="space-y-3">
            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg py-3 font-semibold min-h-[44px]"
            >
              {loading ? '创建中...' : '创建房间'}
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg py-3 font-semibold min-h-[44px]"
            >
              加入房间
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="输入6位房间码"
              value={roomCode}
              onChange={(e) => { setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
              maxLength={6}
              inputMode="numeric"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest placeholder-gray-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
            />
            <button
              onClick={handleJoinRoom}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg py-3 font-semibold min-h-[44px]"
            >
              {loading ? '加入中...' : '加入房间'}
            </button>
            <button
              onClick={() => setMode('home')}
              className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg py-3 font-semibold min-h-[44px]"
            >
              返回
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
