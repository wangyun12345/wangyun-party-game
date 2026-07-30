import type { GamePlugin, Player, GameState, Action, PhaseUI, WinResult } from '../types'
import { GameRegistry } from '../registry'

// Avalon roles
type AvalonRole = 'merlin' | 'percival' | 'loyal_servant' | 'assassin' | 'morgana' | 'mordred' | 'oberon'
type Team = 'good' | 'evil'

const ROLE_NAMES: Record<AvalonRole, string> = {
  merlin: '梅林',
  percival: '派西维尔',
  loyal_servant: '忠臣',
  assassin: '刺客',
  morgana: '莫甘娜',
  mordred: '莫德雷德',
  oberon: '奥伯伦',
}

const ROLE_TEAMS: Record<AvalonRole, Team> = {
  merlin: 'good',
  percival: 'good',
  loyal_servant: 'good',
  assassin: 'evil',
  morgana: 'evil',
  mordred: 'evil',
  oberon: 'evil',
}

// Mission team sizes by player count (5-10 players, 5 missions each)
const MISSION_SIZES: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
}

// Evil count by player count
const EVIL_COUNT: Record<number, number> = {
  5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4,
}

interface AvalonPublicInfo {
  playerNames: Record<string, string>
  playerOrder: string[]
  phase: string
  currentLeaderIndex: number
  currentMission: number  // 0-4
  missionResults: ('success' | 'fail')[]
  nominationFailCount: number
  nominatedTeam: string[]
  teamVotes: Record<string, 'approve' | 'reject'>
  allTeamVoted: boolean
  missionVotes: Record<string, 'success' | 'fail'>
  allMissionVoted: boolean
  missionTeamSize: number
  teamVoteResult?: { approved: boolean; approveCount: number; rejectCount: number }
  missionVoteResult?: { success: boolean; failCount: number }
  assassinTarget?: string
  goodScore: number
  evilScore: number
}

interface AvalonPrivateInfo {
  role: AvalonRole
  team: Team
  knownEvil?: string[]     // merlin sees evil (except mordred)
  knownMerlinOrMorgana?: string[]  // percival sees merlin+morgana
  knownEvilTeam?: string[] // evil sees each other (except oberon)
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const AvalonPlugin: GamePlugin = {
  id: 'avalon',
  name: '阿瓦隆',
  minPlayers: 5,
  maxPlayers: 10,

  initGame(players: Player[]): GameState {
    const n = players.length
    const evilCount = EVIL_COUNT[n] || 2

    // Default role assignment: merlin, assassin always present
    // For simplicity in MVP: merlin, percival, assassin, morgana, fill rest with loyal_servant/oberon
    const roles: AvalonRole[] = []

    // Always: merlin + assassin
    roles.push('merlin', 'assassin')

    if (n >= 6) {
      roles.push('percival', 'morgana')
    }

    // Fill remaining evil
    while (roles.filter((r) => ROLE_TEAMS[r] === 'evil').length < evilCount) {
      roles.push('oberon')
    }

    // Fill remaining good
    while (roles.length < n) {
      roles.push('loyal_servant')
    }

    const shuffledRoles = shuffleArray(roles)
    const shuffledPlayers = shuffleArray(players)

    const playerNames: Record<string, string> = {}
    const playerOrder = shuffledPlayers.map((p) => p.id)
    const privateInfo: Record<string, Record<string, unknown>> = {}

    const roleAssignments: Record<string, AvalonRole> = {}
    for (let i = 0; i < shuffledPlayers.length; i++) {
      roleAssignments[shuffledPlayers[i].id] = shuffledRoles[i]
    }

    const evilExceptOberon = Object.entries(roleAssignments)
      .filter(([, role]) => ROLE_TEAMS[role] === 'evil' && role !== 'oberon')
      .map(([id]) => id)

    // evil visible to merlin: all evil except mordred
    const evilVisibleToMerlin = Object.entries(roleAssignments)
      .filter(([, role]) => ROLE_TEAMS[role] === 'evil' && role !== 'mordred')
      .map(([id]) => id)

    // merlin + morgana visible to percival
    const merlinAndMorgana = Object.entries(roleAssignments)
      .filter(([, role]) => role === 'merlin' || role === 'morgana')
      .map(([id]) => id)

    for (const player of shuffledPlayers) {
      const role = roleAssignments[player.id]
      const team = ROLE_TEAMS[role]
      playerNames[player.id] = player.nickname

      const info: AvalonPrivateInfo = { role, team }

      if (role === 'merlin') {
        info.knownEvil = evilVisibleToMerlin
          .map((id) => playerNames[id] || shuffledPlayers.find((p) => p.id === id)?.nickname || id)
      }

      if (role === 'percival') {
        info.knownMerlinOrMorgana = merlinAndMorgana
          .map((id) => playerNames[id] || shuffledPlayers.find((p) => p.id === id)?.nickname || id)
      }

      if (team === 'evil' && role !== 'oberon') {
        info.knownEvilTeam = evilExceptOberon
          .filter((id) => id !== player.id)
          .map((id) => playerNames[id] || shuffledPlayers.find((p) => p.id === id)?.nickname || id)
      }

      privateInfo[player.id] = info as unknown as Record<string, unknown>
    }

    const missionSizes = MISSION_SIZES[n] || MISSION_SIZES[5]

    const publicInfo: AvalonPublicInfo = {
      playerNames,
      playerOrder,
      phase: 'role_reveal',
      currentLeaderIndex: 0,
      currentMission: 0,
      missionResults: [],
      nominationFailCount: 0,
      nominatedTeam: [],
      teamVotes: {},
      allTeamVoted: false,
      missionVotes: {},
      allMissionVoted: false,
      missionTeamSize: missionSizes[0],
      goodScore: 0,
      evilScore: 0,
    }

    return {
      phase: 'role_reveal',
      publicInfo: publicInfo as unknown as Record<string, unknown>,
      privateInfo,
    }
  },

  handleAction(state: GameState, action: Action): GameState {
    const pub = state.publicInfo as unknown as AvalonPublicInfo
    const n = pub.playerOrder.length
    const missionSizes = MISSION_SIZES[n] || MISSION_SIZES[5]

    switch (action.type) {
      case 'confirm_role': {
        return {
          ...state,
          phase: 'nominate',
          publicInfo: { ...pub, phase: 'nominate' } as unknown as Record<string, unknown>,
        }
      }

      case 'nominate': {
        if (pub.phase !== 'nominate') return state
        // Only leader can nominate
        const leaderId = pub.playerOrder[pub.currentLeaderIndex]
        if (action.playerId !== leaderId) return state

        const members = action.payload?.members as string[]
        if (!members || members.length !== pub.missionTeamSize) return state

        const newPub: AvalonPublicInfo = {
          ...pub,
          phase: 'team_vote',
          nominatedTeam: members,
          teamVotes: {},
          allTeamVoted: false,
          teamVoteResult: undefined,
        }
        return { ...state, phase: 'team_vote', publicInfo: newPub as unknown as Record<string, unknown> }
      }

      case 'team_vote': {
        if (pub.phase !== 'team_vote') return state
        const vote = action.payload?.value as 'approve' | 'reject'
        if (!vote) return state

        const newVotes = { ...pub.teamVotes, [action.playerId]: vote }
        const allVoted = pub.playerOrder.every((id) => id in newVotes)

        if (!allVoted) {
          return {
            ...state,
            publicInfo: { ...pub, teamVotes: newVotes, allTeamVoted: false } as unknown as Record<string, unknown>,
          }
        }

        // Tally
        const approveCount = Object.values(newVotes).filter((v) => v === 'approve').length
        const rejectCount = Object.values(newVotes).filter((v) => v === 'reject').length
        const approved = approveCount > rejectCount

        if (approved) {
          const newPub: AvalonPublicInfo = {
            ...pub,
            phase: 'team_vote_result',
            teamVotes: newVotes,
            allTeamVoted: true,
            teamVoteResult: { approved, approveCount, rejectCount },
          }
          return { ...state, phase: 'team_vote_result', publicInfo: newPub as unknown as Record<string, unknown> }
        } else {
          // Rejected
          const newFailCount = pub.nominationFailCount + 1

          // 5 consecutive failures = evil wins
          if (newFailCount >= 5) {
            const newPub: AvalonPublicInfo = {
              ...pub,
              phase: 'team_vote_result',
              teamVotes: newVotes,
              allTeamVoted: true,
              nominationFailCount: newFailCount,
              teamVoteResult: { approved, approveCount, rejectCount },
              evilScore: 3,  // force evil win
            }
            return { ...state, phase: 'team_vote_result', publicInfo: newPub as unknown as Record<string, unknown> }
          }

          const nextLeader = (pub.currentLeaderIndex + 1) % n
          const newPub: AvalonPublicInfo = {
            ...pub,
            phase: 'team_vote_result',
            teamVotes: newVotes,
            allTeamVoted: true,
            nominationFailCount: newFailCount,
            currentLeaderIndex: nextLeader,
            teamVoteResult: { approved, approveCount, rejectCount },
          }
          return { ...state, phase: 'team_vote_result', publicInfo: newPub as unknown as Record<string, unknown> }
        }
      }

      case 'continue_after_team_vote': {
        if (pub.phase !== 'team_vote_result') return state

        if (pub.nominationFailCount >= 5) {
          // Game over - evil wins, handled by checkWinCondition
          return state
        }

        if (pub.teamVoteResult?.approved) {
          // Move to mission
          const newPub: AvalonPublicInfo = {
            ...pub,
            phase: 'mission',
            missionVotes: {},
            allMissionVoted: false,
            missionVoteResult: undefined,
          }
          return { ...state, phase: 'mission', publicInfo: newPub as unknown as Record<string, unknown> }
        } else {
          // Back to nominate with new leader
          const newPub: AvalonPublicInfo = {
            ...pub,
            phase: 'nominate',
            nominatedTeam: [],
            teamVotes: {},
            allTeamVoted: false,
            teamVoteResult: undefined,
          }
          return { ...state, phase: 'nominate', publicInfo: newPub as unknown as Record<string, unknown> }
        }
      }

      case 'mission_vote': {
        if (pub.phase !== 'mission') return state
        // Only team members can vote
        if (!pub.nominatedTeam.includes(action.playerId)) return state

        const vote = action.payload?.value as 'success' | 'fail'
        if (!vote) return state

        // Good players must vote success
        const priv = state.privateInfo[action.playerId] as unknown as AvalonPrivateInfo
        if (priv.team === 'good' && vote !== 'success') return state

        const newVotes = { ...pub.missionVotes, [action.playerId]: vote }
        const allVoted = pub.nominatedTeam.every((id) => id in newVotes)

        if (!allVoted) {
          return {
            ...state,
            publicInfo: { ...pub, missionVotes: newVotes, allMissionVoted: false } as unknown as Record<string, unknown>,
          }
        }

        // Tally
        const failCount = Object.values(newVotes).filter((v) => v === 'fail').length
        const success = failCount === 0

        const newMissionResults = [...pub.missionResults, success ? 'success' as const : 'fail' as const]
        const newGoodScore = newMissionResults.filter((r) => r === 'success').length
        const newEvilScore = newMissionResults.filter((r) => r === 'fail').length

        const nextMission = pub.currentMission + 1
        const nextLeader = (pub.currentLeaderIndex + 1) % n

        const newPub: AvalonPublicInfo = {
          ...pub,
          phase: 'mission_result',
          missionVotes: newVotes,
          allMissionVoted: true,
          missionResults: newMissionResults,
          missionVoteResult: { success, failCount },
          goodScore: newGoodScore,
          evilScore: newEvilScore,
          currentMission: nextMission,
          currentLeaderIndex: nextLeader,
          missionTeamSize: missionSizes[nextMission] || 0,
          nominationFailCount: 0,
        }

        return { ...state, phase: 'mission_result', publicInfo: newPub as unknown as Record<string, unknown> }
      }

      case 'continue_after_mission': {
        if (pub.phase !== 'mission_result') return state

        // Check if good wins 3 → assassinate
        if (pub.goodScore >= 3) {
          const newPub: AvalonPublicInfo = {
            ...pub,
            phase: 'assassinate',
          }
          return { ...state, phase: 'assassinate', publicInfo: newPub as unknown as Record<string, unknown> }
        }

        // Check if evil wins 3 → game over (handled by checkWinCondition)
        if (pub.evilScore >= 3) {
          return state
        }

        // Next mission
        const newPub: AvalonPublicInfo = {
          ...pub,
          phase: 'nominate',
          nominatedTeam: [],
          teamVotes: {},
          allTeamVoted: false,
          missionVotes: {},
          allMissionVoted: false,
          teamVoteResult: undefined,
          missionVoteResult: undefined,
        }
        return { ...state, phase: 'nominate', publicInfo: newPub as unknown as Record<string, unknown> }
      }

      case 'assassinate': {
        if (pub.phase !== 'assassinate') return state

        // Only assassin can do this
        const priv = state.privateInfo[action.playerId] as unknown as AvalonPrivateInfo
        if (priv.role !== 'assassin') return state

        const targetId = action.payload?.value as string
        if (!targetId) return state

        const targetPriv = state.privateInfo[targetId] as unknown as AvalonPrivateInfo
        const assassinatedMerlin = targetPriv.role === 'merlin'

        const newPub: AvalonPublicInfo = {
          ...pub,
          phase: 'game_over',
          assassinTarget: targetId,
          // If merlin killed, evil wins despite missions
          evilScore: assassinatedMerlin ? 3 : pub.evilScore,
        }

        return { ...state, phase: 'game_over', publicInfo: newPub as unknown as Record<string, unknown> }
      }

      default:
        return state
    }
  },

  getPhaseUI(state: GameState, viewerPlayerId: string): PhaseUI {
    const pub = state.publicInfo as unknown as AvalonPublicInfo
    const priv = state.privateInfo[viewerPlayerId] as unknown as AvalonPrivateInfo

    const roleName = ROLE_NAMES[priv.role]
    const teamName = priv.team === 'good' ? '正义阵营' : '邪恶阵营'
    const leaderId = pub.playerOrder[pub.currentLeaderIndex]
    const leaderName = pub.playerNames[leaderId]
    const isLeader = viewerPlayerId === leaderId

    const missionProgress = pub.missionResults.map((r, i) =>
      `任务${i + 1}: ${r === 'success' ? '✅' : '❌'}`
    ).join(' | ')

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
            角色: `${roleName} (${teamName})`,
            ...(priv.knownEvil ? { '你看到的邪恶方': priv.knownEvil.join(', ') } : {}),
            ...(priv.knownMerlinOrMorgana ? { '梅林或莫甘娜': priv.knownMerlinOrMorgana.join(', ') } : {}),
            ...(priv.knownEvilTeam ? { '邪恶同伴': priv.knownEvilTeam.join(', ') } : {}),
          },
          availableActions: [{ type: 'confirm_role', label: '我知道了' }],
        }

      case 'nominate': {
        const playerOptions = pub.playerOrder.map((id) => ({
          value: id,
          label: pub.playerNames[id],
        }))
        return {
          ...base,
          title: '👑 组队阶段',
          description: isLeader
            ? `你是领袖！请选择 ${pub.missionTeamSize} 名队员`
            : `等待领袖 ${leaderName} 选择队员...`,
          publicData: {
            任务轮次: `第 ${pub.currentMission + 1} 轮`,
            需要人数: `${pub.missionTeamSize} 人`,
            领袖: leaderName,
            提名失败次数: `${pub.nominationFailCount}/5`,
            ...(missionProgress ? { 任务进度: missionProgress } : {}),
          },
          privateData: { 角色: `${roleName} (${teamName})` },
          availableActions: isLeader
            ? [{ type: 'nominate', label: `选择 ${pub.missionTeamSize} 名队员`, options: playerOptions }]
            : [],
        }
      }

      case 'team_vote': {
        const hasVoted = viewerPlayerId in pub.teamVotes
        return {
          ...base,
          title: '🗳️ 组队投票',
          description: `领袖 ${leaderName} 提名了：${pub.nominatedTeam.map((id) => pub.playerNames[id]).join(', ')}`,
          publicData: {
            已投票: `${Object.keys(pub.teamVotes).length}/${pub.playerOrder.length}`,
            ...(missionProgress ? { 任务进度: missionProgress } : {}),
          },
          privateData: { 角色: `${roleName} (${teamName})` },
          availableActions: !hasVoted
            ? [{
                type: 'team_vote',
                label: '你的投票',
                options: [
                  { value: 'approve', label: '👍 赞成' },
                  { value: 'reject', label: '👎 反对' },
                ],
              }]
            : [],
        }
      }

      case 'team_vote_result': {
        const result = pub.teamVoteResult!
        return {
          ...base,
          title: result.approved ? '✅ 组队通过' : '❌ 组队被否决',
          description: `赞成 ${result.approveCount} / 反对 ${result.rejectCount}`,
          publicData: {
            投票详情: Object.entries(pub.teamVotes)
              .map(([id, v]) => `${pub.playerNames[id]}: ${v === 'approve' ? '赞成' : '反对'}`)
              .join('\n'),
            ...(pub.nominationFailCount >= 5 ? { 结果: '连续5次提名失败，邪恶方胜利！' } : {}),
            ...(missionProgress ? { 任务进度: missionProgress } : {}),
          },
          availableActions: [{ type: 'continue_after_team_vote', label: '继续' }],
        }
      }

      case 'mission': {
        const isOnTeam = pub.nominatedTeam.includes(viewerPlayerId)
        const hasVoted = viewerPlayerId in pub.missionVotes

        const missionActions = isOnTeam && !hasVoted
          ? priv.team === 'evil'
            ? [{
                type: 'mission_vote',
                label: '任务投票',
                options: [
                  { value: 'success', label: '✅ 成功' },
                  { value: 'fail', label: '❌ 失败' },
                ],
              }]
            : [{
                type: 'mission_vote',
                label: '任务投票',
                options: [
                  { value: 'success', label: '✅ 成功' },
                ],
              }]
          : []

        return {
          ...base,
          title: '⚔️ 任务执行',
          description: isOnTeam
            ? (hasVoted ? '等待其他队员投票...' : '你在任务队伍中，请投票')
            : '等待任务队伍执行...',
          publicData: {
            任务队员: pub.nominatedTeam.map((id) => pub.playerNames[id]).join(', '),
            已投票: `${Object.keys(pub.missionVotes).length}/${pub.nominatedTeam.length}`,
            ...(missionProgress ? { 任务进度: missionProgress } : {}),
          },
          privateData: { 角色: `${roleName} (${teamName})` },
          availableActions: missionActions,
        }
      }

      case 'mission_result': {
        const result = pub.missionVoteResult!
        return {
          ...base,
          title: result.success ? '✅ 任务成功' : '❌ 任务失败',
          description: result.failCount > 0
            ? `有 ${result.failCount} 张失败票！`
            : '全票成功！',
          publicData: {
            正义方得分: `${pub.goodScore}`,
            邪恶方得分: `${pub.evilScore}`,
            任务进度: pub.missionResults.map((r, i) => `任务${i + 1}: ${r === 'success' ? '✅' : '❌'}`).join(' | '),
          },
          availableActions: [{ type: 'continue_after_mission', label: '继续' }],
        }
      }

      case 'assassinate': {
        const isAssassin = priv.role === 'assassin'
        const targetOptions = pub.playerOrder
          .filter((id) => {
            const p = state.privateInfo[id] as unknown as AvalonPrivateInfo
            return p.team === 'good'
          })
          .map((id) => ({ value: id, label: pub.playerNames[id] }))

        return {
          ...base,
          title: '🗡️ 刺杀阶段',
          description: isAssassin
            ? '正义方赢得了3轮任务！作为刺客，请选择你认为是梅林的人'
            : '正义方赢得了3轮任务！等待刺客选择目标...',
          publicData: {
            任务进度: pub.missionResults.map((r, i) => `任务${i + 1}: ${r === 'success' ? '✅' : '❌'}`).join(' | '),
          },
          privateData: { 角色: `${roleName} (${teamName})` },
          availableActions: isAssassin
            ? [{ type: 'assassinate', label: '选择刺杀目标', options: targetOptions }]
            : [],
        }
      }

      case 'game_over':
        return base // handled by checkWinCondition in GameContainer

      default:
        return base
    }
  },

  checkWinCondition(state: GameState): WinResult | null {
    const pub = state.publicInfo as unknown as AvalonPublicInfo

    const revealedRoles = pub.playerOrder.map((id) => {
      const priv = state.privateInfo[id] as unknown as AvalonPrivateInfo
      return {
        playerId: id,
        role: ROLE_NAMES[priv.role],
        team: priv.team === 'good' ? '正义阵营' : '邪恶阵营',
      }
    })

    // 5 consecutive nomination failures
    if (pub.nominationFailCount >= 5) {
      return {
        winner: '⚔️ 邪恶阵营',
        reason: '连续5次组队提名被否决！',
        revealedRoles,
      }
    }

    // Evil won 3 missions
    if (pub.evilScore >= 3 && pub.phase !== 'assassinate') {
      // Check if it's assassination result
      if (pub.assassinTarget) {
        const targetPriv = state.privateInfo[pub.assassinTarget] as unknown as AvalonPrivateInfo
        if (targetPriv.role === 'merlin') {
          return {
            winner: '⚔️ 邪恶阵营',
            reason: `刺客成功刺杀了梅林 (${pub.playerNames[pub.assassinTarget]})！邪恶方逆转！`,
            revealedRoles,
          }
        }
      }

      if (!pub.assassinTarget) {
        return {
          winner: '⚔️ 邪恶阵营',
          reason: '邪恶方赢得了3轮任务！',
          revealedRoles,
        }
      }
    }

    // Good won 3 missions + assassination phase complete
    if (pub.phase === 'game_over') {
      if (pub.assassinTarget) {
        const targetPriv = state.privateInfo[pub.assassinTarget] as unknown as AvalonPrivateInfo
        if (targetPriv.role === 'merlin') {
          return {
            winner: '⚔️ 邪恶阵营',
            reason: `刺客成功刺杀了梅林 (${pub.playerNames[pub.assassinTarget]})！`,
            revealedRoles,
          }
        } else {
          return {
            winner: '🛡️ 正义阵营',
            reason: `刺客刺杀了 ${pub.playerNames[pub.assassinTarget]}，但他不是梅林！正义方获胜！`,
            revealedRoles,
          }
        }
      }
    }

    return null
  },
}

// Auto-register
GameRegistry.register(AvalonPlugin)
