import type { ConnectionStatus } from '../hooks/useRoomSocket'

interface ConnectionBannerProps {
  status: ConnectionStatus
  error?: string
}

export function ConnectionBanner({ status, error }: ConnectionBannerProps) {
  if (status === 'connected' && !error) return null
  const message = error ?? (status === 'connecting' ? '正在连接房间...' : status === 'reconnecting' ? '连接已断开，正在重连...' : '连接已断开')
  return <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 text-sm z-50">{message}</div>
}
