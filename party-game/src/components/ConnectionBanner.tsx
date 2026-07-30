interface ConnectionBannerProps {
  connected: boolean
}

export function ConnectionBanner({ connected }: ConnectionBannerProps) {
  if (connected) return null

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 text-sm z-50">
      连接已断开，正在重连...
    </div>
  )
}
