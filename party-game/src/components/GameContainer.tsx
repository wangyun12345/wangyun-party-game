import { useEffect, useState } from 'react'
import { GameRegistry } from '../games/registry'
import type { GameState, PhaseUI, ActionOption } from '../games/types'
import { submitAction } from '../hooks/useActions'

interface GameContainerProps {
  gameId: string
  roomId: string
  playerId: string
  gameState: GameState
  isHost: boolean
  onReplay?: () => void
  onReturnLobby?: () => void
}

function NominatePanel({
  action,
  requiredCount,
  onSubmit,
}: {
  action: ActionOption
  requiredCount: number
  onSubmit: (members: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < requiredCount ? [...prev, id] : prev
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-400">{action.label}</p>
      <div className="grid grid-cols-2 gap-2">
        {action.options?.map((opt) => (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={`rounded-lg py-3 px-4 text-sm font-medium min-h-[44px] ${
              selected.includes(opt.value) ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        disabled={selected.length !== requiredCount}
        onClick={() => onSubmit(selected)}
        className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg py-3 px-4 font-medium min-h-[44px]"
      >
        确认提名 ({selected.length}/{requiredCount})
      </button>
    </div>
  )
}

export function GameContainer({ gameId, roomId, playerId, gameState, isHost, onReplay, onReturnLobby }: GameContainerProps) {
  const [phaseUI, setPhaseUI] = useState<PhaseUI | null>(null)

  const plugin = GameRegistry.get(gameId)

  useEffect(() => {
    if (!plugin || !gameState) return
    const ui = plugin.getPhaseUI(gameState, playerId)
    setPhaseUI(ui)
  }, [plugin, gameState, playerId])

  if (!plugin) {
    return <div className="text-center text-red-400 p-8">游戏 "{gameId}" 未找到</div>
  }

  if (!phaseUI) {
    return <div className="text-center text-gray-400 p-8">加载中...</div>
  }

  const winResult = plugin.checkWinCondition(gameState)

  if (winResult) {
    return (
      <div className="flex flex-col items-center gap-6 p-6">
        <h2 className="text-2xl font-bold">游戏结束</h2>
        <div className="text-xl text-yellow-300 font-semibold">{winResult.winner} 获胜!</div>
        <p className="text-gray-300">{winResult.reason}</p>
        <div className="w-full max-w-sm space-y-2">
          <h3 className="font-semibold text-lg">身份揭示</h3>
          {winResult.revealedRoles.map((r) => (
            <div key={r.playerId} className="flex justify-between bg-gray-800 rounded px-4 py-2">
              <span>{(gameState.publicInfo.playerNames as Record<string, string>)?.[r.playerId] ?? r.playerId}</span>
              <span className="text-sm text-gray-400">{r.role} ({r.team})</span>
            </div>
          ))}
        </div>
        {isHost && (
          <div className="w-full max-w-sm space-y-2 mt-4">
            <button
              onClick={onReplay}
              className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-lg py-3 px-4 font-medium min-h-[44px]"
            >
              再来一局
            </button>
            <button
              onClick={onReturnLobby}
              className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg py-3 px-4 font-medium min-h-[44px]"
            >
              返回大厅
            </button>
          </div>
        )}
      </div>
    )
  }

  const handleAction = async (actionType: string, value?: string, members?: string[]) => {
    await submitAction(roomId, playerId, {
      type: actionType,
      payload: members ? { members } : value ? { value } : {},
    })
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <h2 className="text-xl font-bold">{phaseUI.title}</h2>
      {phaseUI.description && <p className="text-gray-300 text-center">{phaseUI.description}</p>}

      {/* Public data display */}
      {phaseUI.publicData && Object.keys(phaseUI.publicData).length > 0 && (
        <div className="w-full max-w-sm bg-gray-800 rounded-lg p-4 space-y-2">
          {Object.entries(phaseUI.publicData).map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="text-gray-400">{key}:</span>{' '}
              <span className="whitespace-pre-line">{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Private data display */}
      {phaseUI.privateData && Object.keys(phaseUI.privateData).length > 0 && (
        <div className="w-full max-w-sm bg-indigo-900/50 border border-indigo-500/30 rounded-lg p-4 space-y-2">
          <div className="text-xs text-indigo-300 font-semibold">🔒 仅你可见</div>
          {Object.entries(phaseUI.privateData).map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="text-indigo-300">{key}:</span>{' '}
              <span>{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {phaseUI.availableActions.length > 0 && (
        <div className="w-full max-w-sm space-y-3 mt-4">
          {phaseUI.availableActions.map((action: ActionOption) =>
            action.type === 'nominate' && action.options ? (
              <NominatePanel
                key={action.type}
                action={action}
                requiredCount={parseInt(String(phaseUI.publicData['需要人数'] || '2'))}
                onSubmit={(members) => handleAction('nominate', undefined, members)}
              />
            ) : action.options ? (
              <div key={action.type} className="space-y-2">
                <p className="text-sm text-gray-400">{action.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {action.options.map((opt) => (
                    <button
                      key={opt.value}
                      disabled={action.disabled}
                      onClick={() => handleAction(action.type, opt.value)}
                      className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg py-3 px-4 text-sm font-medium min-h-[44px]"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                key={action.type}
                disabled={action.disabled}
                onClick={() => handleAction(action.type)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg py-3 px-4 font-medium min-h-[44px]"
              >
                {action.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
