import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { usePlayers } from '../hooks/usePlayers'
import { GameRegistry } from '../games/registry'
import type { Player } from '../games/types'

interface WaitingRoomProps {
  roomId: string
  playerId: string
  isHost: boolean
  onGameStart: () => void
  onLeave: () => void
}

export function WaitingRoom({ roomId, playerId, isHost, onGameStart, onLeave }: WaitingRoomProps) {
  const players = usePlayers(roomId)
  const [roomCode, setRoomCode] = useState('')
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  const games = GameRegistry.getAll()

  useEffect(() => {
    const fetchCode = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('code, game_id')
        .eq('id', roomId)
        .single()
      if (data) {
        setRoomCode(data.code)
        if (data.game_id) setSelectedGameId(data.game_id)
      }
    }
    fetchCode()
  }, [roomId])

  // Non-host: listen for game_id changes and game start
  useEffect(() => {
    if (isHost) return

    const channel = supabase
      .channel(`waiting-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { game_id: string; status: string }
          if (row.game_id) setSelectedGameId(row.game_id)
          if (row.status === 'playing') onGameStart()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId, isHost, onGameStart])

  const handleSelectGame = async (gameId: string) => {
    setSelectedGameId(gameId)
    setError('')
    await supabase.from('rooms').update({ game_id: gameId }).eq('id', roomId)
  }

  const handleStartGame = async () => {
    if (!selectedGameId) {
      setError('请先选择游戏')
      return
    }

    const plugin = GameRegistry.get(selectedGameId)
    if (!plugin) {
      setError('游戏配置失败')
      return
    }

    if (players.length < plugin.minPlayers) {
      setError(`至少需要 ${plugin.minPlayers} 名玩家`)
      return
    }

    if (players.length > plugin.maxPlayers) {
      setError(`最多 ${plugin.maxPlayers} 名玩家`)
      return
    }

    setStarting(true)
    setError('')

    try {
      const gamePlayers: Player[] = players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        isHost: p.is_host,
      }))

      const gameState = plugin.initGame(gamePlayers)

      await supabase
        .from('rooms')
        .update({
          status: 'playing',
          game_state: gameState,
        })
        .eq('id', roomId)

      onGameStart()
    } catch {
      setError('启动游戏失败')
    } finally {
      setStarting(false)
    }
  }

  const selectedPlugin = selectedGameId ? GameRegistry.get(selectedGameId) : null

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-6">
      <h2 className="text-2xl font-bold mb-2">等待大厅</h2>

      <div className="bg-gray-800 rounded-lg px-6 py-3 mb-6 text-center">
        <p className="text-gray-400 text-sm">房间码</p>
        <p className="text-3xl font-mono font-bold tracking-widest text-indigo-400">{roomCode}</p>
        <p className="text-xs text-gray-500 mt-1">告诉朋友这个房间码</p>
      </div>

      {/* Player list */}
      <div className="w-full max-w-sm mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">玩家 ({players.length})</h3>
        <div className="space-y-2">
          {players.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3 ${
                p.id === playerId ? 'border border-indigo-500/50' : ''
              }`}
            >
              <span>{p.nickname}</span>
              <div className="flex gap-2 text-xs">
                {p.is_host && <span className="bg-yellow-600/30 text-yellow-300 px-2 py-0.5 rounded">房主</span>}
                {p.id === playerId && <span className="text-gray-500">你</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Game selection (host only) */}
      {isHost && (
        <div className="w-full max-w-sm mb-6">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">选择游戏</h3>
          <div className="grid grid-cols-2 gap-2">
            {games.map((game) => (
              <button
                key={game.id}
                onClick={() => handleSelectGame(game.id)}
                className={`rounded-lg px-4 py-3 text-sm font-medium min-h-[44px] ${
                  selectedGameId === game.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                {game.name}
                <span className="block text-xs text-gray-400 mt-0.5">
                  {game.minPlayers}-{game.maxPlayers}人
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Non-host: show selected game */}
      {!isHost && selectedPlugin && (
        <div className="w-full max-w-sm mb-6 bg-gray-800 rounded-lg px-4 py-3 text-center">
          <p className="text-gray-400 text-sm">房主选择了</p>
          <p className="text-lg font-semibold">{selectedPlugin.name}</p>
          <p className="text-xs text-gray-500">{selectedPlugin.minPlayers}-{selectedPlugin.maxPlayers}人</p>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Start / Leave buttons */}
      <div className="w-full max-w-sm space-y-3">
        {isHost && (
          <button
            onClick={handleStartGame}
            disabled={starting || !selectedGameId}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg py-3 font-semibold min-h-[44px]"
          >
            {starting ? '启动中...' : '开始游戏'}
          </button>
        )}
        {!isHost && (
          <p className="text-center text-gray-400 text-sm">等待房主开始游戏...</p>
        )}
        <button
          onClick={onLeave}
          className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg py-3 font-semibold min-h-[44px]"
        >
          离开房间
        </button>
      </div>
    </div>
  )
}
