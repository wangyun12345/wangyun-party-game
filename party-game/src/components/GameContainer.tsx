import type { ConnectionStatus } from '../hooks/useRoomSocket'
import type { RoomView } from '../lib/roomClient'
import type { PhaseUI, WinResult } from '../games/types'
import { getGameDefinition } from '../games/definitions'

interface GameContainerProps {
  room: RoomView
  isOrganizer: boolean
  view: PhaseUI
  winResult: WinResult | null
  status: ConnectionStatus
  onCommand: (type: string, payload?: Record<string, unknown>) => void
}

export function GameContainer({ room, isOrganizer, view, winResult, status, onCommand }: GameContainerProps) {
  if (winResult) {
    return <div className="flex flex-col items-center gap-6 p-6 pt-10"><h2 className="text-2xl font-bold">游戏结束</h2><div className="text-xl text-yellow-300 font-semibold">{winResult.winner} 获胜!</div><p className="text-gray-300">{winResult.reason}</p><div className="w-full max-w-sm space-y-2"><h3 className="font-semibold text-lg">身份揭示</h3>{winResult.revealedRoles.map((role) => <div key={role.playerId} className="flex justify-between bg-gray-800 rounded px-4 py-2"><span>{room.players.find((player) => player.id === role.playerId)?.nickname ?? role.playerId}</span><span className="text-sm text-gray-400">{role.role} ({role.team})</span></div>)}</div>{isOrganizer && <div className="w-full max-w-sm space-y-2"><button onClick={() => onCommand('replay')} className="w-full bg-indigo-600 rounded-lg py-3 min-h-[44px]">再来一局</button><button onClick={() => onCommand('return_lobby')} className="w-full bg-gray-700 rounded-lg py-3 min-h-[44px]">返回大厅</button></div>}</div>
  }

  const definition = room.gameId ? getGameDefinition(room.gameId) : undefined
  if (!definition) return <div className="p-8 text-center text-red-400">游戏界面暂时不可用</div>
  const View = definition.View
  return <View view={view} pending={false} connected={status === 'connected'} sendCommand={async (action) => { onCommand(action.type, action.payload) }} />
}
