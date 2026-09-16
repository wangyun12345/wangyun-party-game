import { useState } from 'react'
import { createRoom, joinRoom, loadSession, type JoinResult } from '../lib/roomClient'

interface HomePageProps {
  initialRoomCode: string | null
  onJoinRoom: (result: JoinResult) => void
}

function validateNickname(value: string): string | null {
  const name = value.trim()
  if (!name) return '请输入昵称'
  if (name.length < 2 || name.length > 12) return '昵称需要为 2-12 个字符'
  return null
}

export function HomePage({ initialRoomCode, onJoinRoom }: HomePageProps) {
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? '')
  const [mode, setMode] = useState<'home' | 'join'>(initialRoomCode ? 'join' : 'home')
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async (operation: () => Promise<JoinResult>) => {
    const nameError = validateNickname(nickname)
    if (nameError) { setError(nameError); return }
    setLoading(true)
    setError('')
    try {
      const result = await operation()
      onJoinRoom(result)
      if (result.shareUrl) setShareUrl(result.shareUrl)
      const code = result.roomCode ?? result.room.code
      setRoomCode(code)
      window.history.replaceState({}, '', `/room/${code}`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '房间请求失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => { void run(() => createRoom(nickname)) }
  const handleJoin = () => {
    const code = roomCode.trim()
    if (!/^\d{6}$/.test(code)) { setError('请输入6位房间码'); return }
    void run(() => joinRoom(code, nickname, loadSession(code) ?? undefined))
  }

  if (shareUrl) {
    const qrUrl = `https://quickchart.io/qr?size=220&text=${encodeURIComponent(shareUrl)}`
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-3xl font-bold">房间已创建</h1>
          <p className="text-4xl font-mono font-bold tracking-widest text-indigo-400">{roomCode || '------'}</p>
          <img src={qrUrl} alt="房间二维码" className="mx-auto rounded bg-white p-2 w-56 h-56" />
          <button onClick={() => navigator.clipboard?.writeText(shareUrl)} className="w-full bg-indigo-600 rounded-lg py-3 min-h-[44px]">复制分享链接</button>
          <button onClick={() => setShareUrl(null)} className="w-full bg-gray-700 rounded-lg py-3 min-h-[44px]">继续进入房间</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold mb-2">🎲 聚会桌游</h1>
      <p className="text-gray-400 mb-8">打开链接即可加入，不需要注册</p>
      <div className="w-full max-w-sm space-y-4">
        <input type="text" placeholder="输入你的昵称" value={nickname} onChange={(event) => { setNickname(event.target.value); setError('') }} maxLength={12} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 min-h-[44px]" />
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        {mode === 'home' ? (
          <div className="space-y-3">
            <button onClick={handleCreate} disabled={loading} className="w-full bg-indigo-600 rounded-lg py-3 font-semibold min-h-[44px]">{loading ? '创建中...' : '创建房间'}</button>
            <button onClick={() => setMode('join')} className="w-full bg-gray-700 rounded-lg py-3 font-semibold min-h-[44px]">加入房间</button>
          </div>
        ) : (
          <div className="space-y-3">
            <input type="text" placeholder="输入6位房间码" value={roomCode} onChange={(event) => { setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} inputMode="numeric" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-center text-2xl tracking-widest min-h-[44px]" />
            <button onClick={handleJoin} disabled={loading} className="w-full bg-indigo-600 rounded-lg py-3 font-semibold min-h-[44px]">{loading ? '加入中...' : '加入房间'}</button>
            <button onClick={() => setMode('home')} className="w-full bg-gray-700 rounded-lg py-3 font-semibold min-h-[44px]">返回</button>
          </div>
        )}
      </div>
    </div>
  )
}
