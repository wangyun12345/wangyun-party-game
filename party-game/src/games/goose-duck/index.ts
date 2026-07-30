import type { GamePlugin, Player, GameState, Action, PhaseUI, WinResult } from '../types'
import { GameRegistry } from '../registry'

type Role = 'goose' | 'duck'

interface GooseDuckPublicInfo {
  playerNames: Record<string, string>
  phase: string
  alivePlayers: string[]
  eliminatedPlayers: { playerId: string; role: Role }[]
  votes: Record<string, string> // voterId -> targetId or "skip"
  allVoted: boolean
  meetingCaller?: string
  discussionEndTime?: number
  voteResult?: { eliminated?: string; eliminatedRole?: Role; isTie: boolean }
}

interface GooseDuckPrivateInfo {
  role: Role
  teammates: string[] // duck players can see other ducks
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const GooseDuckPlugin: GamePlugin = {
  id: 'goose-duck',
  name: '鹅鸭杀',
  minPlayers: 4,
  maxPlayers: 15,

  initGame(players: Player[]): GameState {
    // Assign roles: ~1/3 are ducks
    const duckCount = Math.max(1, Math.floor(players.length / 3))
    const shuffled = shuffleArray(players)
    const duckIds = shuffled.slice(0, duckCount).map((p) => p.id)

    const playerNames: Record<string, string> = {}
    const privateInfo: Record<string, Record<string, unknown>> = {}

    for (const player of players) {
      const role: Role = duckIds.includes(player.id) ? 'duck' : 'goose'
      playerNames[player.id] = player.nickname

      const info: GooseDuckPrivateInfo = {
        role,
        teammates: role === 'duck'
          ? duckIds.filter((id) => id !== player.id).map((id) => {
              const p = players.find((pl) => pl.id === id)
              return p ? p.nickname : id
            })
          : [],
      }
      privateInfo[player.id] = info as unknown as Record<string, unknown>
    }

    const publicInfo: GooseDuckPublicInfo = {
      playerNames,
      phase: 'role_reveal',
      alivePlayers: players.map((p) => p.id),
      eliminatedPlayers: [],
      votes: {},
      allVoted: false,
    }

    return {
      phase: 'role_reveal',
      publicInfo: publicInfo as unknown as Record<string, unknown>,
      privateInfo,
    }
  },

  handleAction(state: GameState, action: Action): GameState {
    const pub = state.publicInfo as unknown as GooseDuckPublicInfo

    switch (action.type) {
      case 'confirm_role': {
        // Player confirmed they've seen their role; if in role_reveal phase, move to free phase when ready
        return { ...state, phase: 'free', publicInfo: { ...pub, phase: 'free' } as unknown as Record<string, unknown> }
      }

      case 'call_meeting': {
        if (pub.phase !== 'free') return state
        const now = Date.now()
        const newPub: GooseDuckPublicInfo = {
          ...pub,
          phase: 'discussion',
          meetingCaller: action.playerId,
          discussionEndTime: now + 60000,
          votes: {},
          allVoted: false,
          voteResult: undefined,
        }
        return { ...state, phase: 'discussion', publicInfo: newPub as unknown as Record<string, unknown> }
      }

      case 'end_discussion': {
        if (pub.phase !== 'discussion') return state
        const newPub: GooseDuckPublicInfo = {
          ...pub,
          phase: 'voting',
        }
        return { ...state, phase: 'voting', publicInfo: newPub as unknown as Record<string, unknown> }
      }

      case 'vote': {
        if (pub.phase !== 'voting') return state
        if (!pub.alivePlayers.includes(action.playerId)) return state

        const targetId = action.payload?.value as string
        if (!targetId) return state

        const newVotes = { ...pub.votes, [action.playerId]: targetId }

        // Check if all alive players have voted
        const allVoted = pub.alivePlayers.every((id) => id in newVotes)

        if (!allVoted) {
          return {
            ...state,
            publicInfo: { ...pub, votes: newVotes, allVoted: false } as unknown as Record<string, unknown>,
          }
        }

        // Tally votes (exclude "skip" votes)
        const tally: Record<string, number> = {}
        for (const targetVote of Object.values(newVotes)) {
          if (targetVote !== 'skip') {
            tally[targetVote] = (tally[targetVote] || 0) + 1
          }
        }

        // Find max
        const maxVotes = Math.max(0, ...Object.values(tally))
        const topPlayers = Object.entries(tally).filter(([, v]) => v === maxVotes).map(([id]) => id)

        let eliminated: string | undefined
        let eliminatedRole: Role | undefined
        const isTie = topPlayers.length !== 1 || maxVotes === 0

        if (!isTie) {
          eliminated = topPlayers[0]
          const info = state.privateInfo[eliminated] as unknown as GooseDuckPrivateInfo
          eliminatedRole = info.role
        }

        const newAlivePlayers = eliminated
          ? pub.alivePlayers.filter((id) => id !== eliminated)
          : [...pub.alivePlayers]

        const newEliminated = eliminated && eliminatedRole
          ? [...pub.eliminatedPlayers, { playerId: eliminated, role: eliminatedRole }]
          : [...pub.eliminatedPlayers]

        const newPub: GooseDuckPublicInfo = {
          ...pub,
          phase: 'vote_result',
          votes: newVotes,
          allVoted: true,
          alivePlayers: newAlivePlayers,
          eliminatedPlayers: newEliminated,
          voteResult: { eliminated, eliminatedRole, isTie },
        }

        return {
          ...state,
          phase: 'vote_result',
          publicInfo: newPub as unknown as Record<string, unknown>,
        }
      }

      case 'continue_game': {
        if (pub.phase !== 'vote_result') return state
        const newPub: GooseDuckPublicInfo = {
          ...pub,
          phase: 'free',
          votes: {},
          allVoted: false,
          meetingCaller: undefined,
          discussionEndTime: undefined,
          voteResult: undefined,
        }
        return { ...state, phase: 'free', publicInfo: newPub as unknown as Record<string, unknown> }
      }

      default:
        return state
    }
  },

  getPhaseUI(state: GameState, viewerPlayerId: string): PhaseUI {
    const pub = state.publicInfo as unknown as GooseDuckPublicInfo
    const priv = state.privateInfo[viewerPlayerId] as unknown as GooseDuckPrivateInfo
    const isAlive = pub.alivePlayers.includes(viewerPlayerId)

    const base: PhaseUI = {
      phase: pub.phase,
      title: '',
      publicData: {},
      privateData: {},
      availableActions: [],
    }

    switch (pub.phase) {
      case 'role_reveal':
        return {
          ...base,
          title: '🎭 查看你的身份',
          privateData: {
            身份: priv.role === 'duck' ? '🦆 鸭子' : '🪿 鹅',
            ...(priv.teammates.length > 0 ? { 鸭子同伴: priv.teammates.join(', ') } : {}),
          },
          availableActions: [{ type: 'confirm_role', label: '我知道了' }],
        }

      case 'free':
        return {
          ...base,
          title: '🎮 游戏进行中',
          description: '面对面讨论，觉得可疑时发起紧急会议',
          publicData: {
            存活人数: `${pub.alivePlayers.length} 人`,
            已淘汰: pub.eliminatedPlayers.length > 0
              ? pub.eliminatedPlayers.map((e) => `${pub.playerNames[e.playerId]}(${e.role === 'duck' ? '鸭' : '鹅'})`).join(', ')
              : '无',
          },
          privateData: {
            身份: priv.role === 'duck' ? '🦆 鸭子' : '🪿 鹅',
          },
          availableActions: isAlive
            ? [{ type: 'call_meeting', label: '🚨 发起紧急会议' }]
            : [],
        }

      case 'discussion':
        return {
          ...base,
          title: '🗣️ 讨论阶段',
          description: `${pub.playerNames[pub.meetingCaller!]} 发起了紧急会议！讨论后由房主结束讨论`,
          publicData: {
            存活玩家: pub.alivePlayers.map((id) => pub.playerNames[id]).join(', '),
          },
          privateData: {
            身份: priv.role === 'duck' ? '🦆 鸭子' : '🪿 鹅',
          },
          availableActions: [{ type: 'end_discussion', label: '结束讨论，开始投票' }],
        }

      case 'voting': {
        const hasVoted = viewerPlayerId in pub.votes
        const voteOptions = [
          ...pub.alivePlayers
            .filter((id) => id !== viewerPlayerId)
            .map((id) => ({ value: id, label: pub.playerNames[id] })),
          { value: 'skip', label: '跳过投票' },
        ]
        return {
          ...base,
          title: '🗳️ 投票阶段',
          description: hasVoted ? '等待其他玩家投票...' : '选择要驱逐的玩家',
          publicData: {
            已投票: `${Object.keys(pub.votes).length}/${pub.alivePlayers.length}`,
          },
          privateData: {
            身份: priv.role === 'duck' ? '🦆 鸭子' : '🪿 鹅',
          },
          availableActions: isAlive && !hasVoted
            ? [{ type: 'vote', label: '投票驱逐', options: voteOptions }]
            : [],
        }
      }

      case 'vote_result': {
        const result = pub.voteResult!
        return {
          ...base,
          title: '📊 投票结果',
          description: result.isTie
            ? '平票！本轮无人被驱逐'
            : `${pub.playerNames[result.eliminated!]} 被驱逐了！身份：${result.eliminatedRole === 'duck' ? '🦆 鸭子' : '🪿 鹅'}`,
          publicData: {
            投票详情: Object.entries(pub.votes)
              .map(([voterId, targetId]) =>
                `${pub.playerNames[voterId]} → ${targetId === 'skip' ? '跳过' : pub.playerNames[targetId]}`
              )
              .join('\n'),
          },
          availableActions: [{ type: 'continue_game', label: '继续游戏' }],
        }
      }

      default:
        return base
    }
  },

  checkWinCondition(state: GameState): WinResult | null {
    const pub = state.publicInfo as unknown as GooseDuckPublicInfo

    const aliveGoose = pub.alivePlayers.filter((id) => {
      const info = state.privateInfo[id] as unknown as GooseDuckPrivateInfo
      return info.role === 'goose'
    })

    const aliveDuck = pub.alivePlayers.filter((id) => {
      const info = state.privateInfo[id] as unknown as GooseDuckPrivateInfo
      return info.role === 'duck'
    })

    const allPlayerIds = Object.keys(state.privateInfo)
    const revealedRoles = allPlayerIds.map((id) => {
      const info = state.privateInfo[id] as unknown as GooseDuckPrivateInfo
      return {
        playerId: id,
        role: info.role === 'duck' ? '鸭子' : '鹅',
        team: info.role === 'duck' ? '鸭子阵营' : '鹅阵营',
      }
    })

    if (aliveDuck.length === 0) {
      return { winner: '🪿 鹅阵营', reason: '所有鸭子已被驱逐！', revealedRoles }
    }

    if (aliveDuck.length >= aliveGoose.length) {
      return { winner: '🦆 鸭子阵营', reason: '鸭子数量已达到或超过鹅的数量！', revealedRoles }
    }

    return null
  },
}

// Auto-register
GameRegistry.register(GooseDuckPlugin)
