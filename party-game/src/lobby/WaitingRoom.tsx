import { GameRegistry } from '../games/registry'
import type { ConnectionStatus } from '../hooks/useRoomSocket'
import type { RoomView } from '../lib/roomClient'

interface WaitingRoomProps {
  room: RoomView
  playerId: string
  isOrganizer: boolean
  status: ConnectionStatus
  onCommand: (type: string, payload?: Record<string, unknown>) => void
  onLeave: () => void
}

export function WaitingRoom({ room, playerId, isOrganizer, status, onCommand, onLeave }: WaitingRoomProps) {
  const games = GameRegistry.getAll()
  const selected = room.gameId ? GameRegistry.get(room.gameId) : null
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-6 pt-10">
      <h2 className="text-2xl font-bold mb-2">等待大厅</h2>
      <div className="bg-gray-800 rounded-lg px-6 py-3 mb-6 text-center">
        <p className="text-gray-400 text-sm">房间码</p>
        <p className="text-3xl font-mono font-bold tracking-widest text-indigo-400">{room.code}</p>
        <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/room/${room.code}`)} className="text-xs text-indigo-300 mt-1">复制分享链接</button>
        <img src={`https://quickchart.io/qr?size=160&text=${encodeURIComponent(`${window.location.origin}/room/${room.code}`)}`} alt="房间二维码" className="mx-auto mt-3 rounded bg-white p-1 w-40 h-40" />
      </div>
      <p className="text-xs text-gray-400 mb-4">组织者：{room.organizerOnline === false ? '暂时离线，游戏不会暂停' : '在线'}</p>
      <div className="w-full max-w-sm mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">玩家 ({room.players.length})</h3>
        <div className="space-y-2">
          {room.players.map((player) => (
            <div key={player.id} className={`flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3 ${player.id === playerId ? 'border border-indigo-500/50' : ''}`}>
              <span>{player.nickname}</span>
              <div className="flex gap-2 text-xs">
                {player.isOrganizer && <span className="bg-yellow-600/30 text-yellow-300 px-2 py-0.5 rounded">组织者</span>}
                {player.id === playerId && <span className="text-gray-500">你</span>}
                {isOrganizer && !player.isOrganizer && <button onClick={() => onCommand('transfer_organizer', { playerId: player.id })} className="text-indigo-300">转交</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {isOrganizer ? (
        <div className="w-full max-w-sm mb-6">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">选择游戏</h3>
          <div className="grid grid-cols-2 gap-2">
            {games.map((game) => <button key={game.id} onClick={() => onCommand('select_game', { gameId: game.id })} className={`rounded-lg px-4 py-3 text-sm font-medium min-h-[44px] ${room.gameId === game.id ? 'bg-indigo-600' : 'bg-gray-800'}`}>{game.name}<span className="block text-xs text-gray-400 mt-0.5">{game.minPlayers}-{game.maxPlayers}人</span></button>)}
          </div>
          <button onClick={() => onCommand('start_game')} disabled={!selected || status !== 'connected'} className="w-full mt-4 bg-green-600 disabled:opacity-50 rounded-lg py-3 font-semibold min-h-[44px]">开始游戏</button>
        </div>
      ) : <p className="text-center text-gray-400 text-sm mb-6">{selected ? `等待组织者开始${selected.name}...` : '等待组织者选择游戏...'}</p>}
      <button onClick={onLeave} className="w-full max-w-sm bg-gray-700 rounded-lg py-3 font-semibold min-h-[44px]">离开房间</button>
    </div>
  )
}
