"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

const COLOR_PALETTE = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
  "bg-rose-500",
]

function getColorForUsername(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]
}

interface UserAvatarProps {
  username: string
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  className?: string
  showOnline?: boolean
}

const SIZES = {
  xs: "w-5 h-5 text-[9px]",
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-xl",
}

export function UserAvatar({ username, size = "sm", className, showOnline }: UserAvatarProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setSrc(null)
    setError(false)
    const url = `/api/avatar?username=${encodeURIComponent(username)}`
    const img = new Image()
    img.onload = () => setSrc(url)
    img.onerror = () => setError(true)
    img.src = url
  }, [username])

  const sizeClass = SIZES[size]
  const colorClass = getColorForUsername(username)
  const initial = username[0]?.toUpperCase() ?? "?"

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "rounded-full overflow-hidden flex items-center justify-center font-bold font-mono",
          sizeClass,
          src && !error ? "" : colorClass,
          "text-white"
        )}
      >
        {src && !error ? (
          <img
            src={src}
            alt={`@${username}`}
            className="w-full h-full object-cover"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>
      {showOnline && (
        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500 border-2 border-background" />
      )}
    </div>
  )
}
