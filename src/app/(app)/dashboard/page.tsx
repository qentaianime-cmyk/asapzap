"use client"

import { Button } from "@/components/ui/button"
import { Loading } from "@/components/ui/loading"
import { UserAvatar } from "@/components/custom/user-avatar"
import { useAuth } from "@/hooks/use-auth"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import gsap from "gsap"
import { Copy, LogOut, Search, MessageSquare, Users } from "lucide-react"

interface ActiveRoom {
  roomId: string
  otherParticipant: string | null
  expiresAt: string | null
  secondsLeft: number | null
  createdAt: string
}

function formatSecondsLeft(seconds: number): string {
  if (seconds <= 0) return "expiring..."
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

function RoomCountdownBadge({ secondsLeft }: { secondsLeft: number | null }) {
  const [current, setCurrent] = useState(secondsLeft)

  useEffect(() => {
    setCurrent(secondsLeft)
    if (secondsLeft === null || secondsLeft <= 0) return
    const interval = setInterval(() => {
      setCurrent((prev) => (prev !== null && prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [secondsLeft])

  if (current === null) {
    return <span className="text-[10px] font-mono text-muted-foreground/40">∞</span>
  }

  const isUrgent = current < 300
  return (
    <span className={`text-[10px] font-mono tabular-nums ${isUrgent ? "text-destructive" : "text-primary/70"}`}>
      {formatSecondsLeft(current)}
    </span>
  )
}

export default function DashboardPage() {
  const { user, isLoading, isAuthenticated } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login?next=/dashboard")
    }
  }, [isLoading, isAuthenticated, router])

  const { data: roomsData } = useQuery({
    queryKey: ["active-rooms"],
    queryFn: async () => {
      const res = await fetch("/api/rooms", { credentials: "include" })
      if (!res.ok) return { rooms: [] }
      return res.json() as Promise<{ rooms: ActiveRoom[] }>
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!user || !containerRef.current) return
    const cards = containerRef.current.querySelectorAll<HTMLElement>(".dash-card")
    gsap.fromTo(cards,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "power3.out" }
    )
  }, [user])

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    queryClient.setQueryData(["auth", "me"], null)
    router.push("/login")
  }

  async function handleCopyUsername() {
    if (!user) return
    await navigator.clipboard.writeText(`@${user.username}`)
    toast.success("Copied to clipboard")
  }

  if (isLoading) return <Loading message="Loading..." />
  if (!user) return null

  const activeRooms = roomsData?.rooms ?? []

  return (
    <div ref={containerRef} className="w-full max-w-md space-y-3 px-4 py-8">

      {/* Profile card */}
      <div className="dash-card border border-border/60 rounded-2xl bg-card/30 backdrop-blur-sm p-5 space-y-5">
        <div className="flex items-center gap-4">
          <Link href={`/${user.username}`} className="shrink-0">
            <UserAvatar username={user.username} size="lg" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link href={`/${user.username}`}>
                <h1 className="text-lg font-black font-mono text-foreground hover:text-primary transition-colors truncate">
                  @{user.username}
                </h1>
              </Link>
              <button
                onClick={handleCopyUsername}
                title="Copy handle"
                className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <Copy size={13} />
              </button>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground/40 mt-0.5">
              member since {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/${user.username}`}
            className="group rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-center hover:border-primary/40 hover:bg-primary/[0.03] transition-all"
          >
            <p className="text-2xl font-black font-mono text-foreground group-hover:text-primary transition-colors">
              {user.followers.length}
            </p>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <Users size={9} className="text-muted-foreground/40" />
              <p className="text-[10px] text-muted-foreground/50 font-mono">followers</p>
            </div>
          </Link>
          <Link
            href={`/${user.username}`}
            className="group rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-center hover:border-primary/40 hover:bg-primary/[0.03] transition-all"
          >
            <p className="text-2xl font-black font-mono text-foreground group-hover:text-primary transition-colors">
              {user.following.length}
            </p>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <Users size={9} className="text-muted-foreground/40" />
              <p className="text-[10px] text-muted-foreground/50 font-mono">following</p>
            </div>
          </Link>
        </div>

        <div className="flex gap-2">
          <Link href="/search" className="flex-1">
            <Button variant="outline" size="sm" className="w-full font-mono text-xs rounded-xl gap-1.5 border-border/60 hover:border-primary/40">
              <Search size={12} />
              find people
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="font-mono text-xs text-muted-foreground/50 hover:text-destructive rounded-xl gap-1.5"
          >
            <LogOut size={12} />
            out
          </Button>
        </div>
      </div>

      {/* Active rooms */}
      {activeRooms.length > 0 && (
        <div className="dash-card border border-border/60 rounded-2xl bg-card/30 backdrop-blur-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={11} className="text-primary/60" />
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">Active rooms</p>
          </div>
          <div className="space-y-1.5">
            {activeRooms.map((room) => (
              <Link
                key={room.roomId}
                href={`/room/${room.roomId}`}
                className="flex items-center justify-between rounded-xl border border-border/50 bg-background/40 px-4 py-2.5 hover:border-primary/40 hover:bg-primary/[0.03] transition-all group"
              >
                <div className="flex items-center gap-2">
                  {room.otherParticipant && (
                    <UserAvatar username={room.otherParticipant} size="xs" />
                  )}
                  <span className="font-mono text-sm text-foreground group-hover:text-primary transition-colors">
                    @{room.otherParticipant ?? "unknown"}
                  </span>
                </div>
                <RoomCountdownBadge secondsLeft={room.secondsLeft} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Connections */}
      {(user.following.length > 0 || user.followers.length > 0) ? (
        <>
          {user.following.length > 0 && (
            <div className="dash-card border border-border/60 rounded-2xl bg-card/30 backdrop-blur-sm p-5 space-y-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">Following</p>
              <div className="flex flex-wrap gap-1.5">
                {user.following.map((uname) => (
                  <Link
                    key={uname}
                    href={`/${uname}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border/50 bg-background/40 text-[11px] font-mono text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                  >
                    <UserAvatar username={uname} size="xs" />
                    <span>{uname}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {user.followers.length > 0 && (
            <div className="dash-card border border-border/60 rounded-2xl bg-card/30 backdrop-blur-sm p-5 space-y-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">Followers</p>
              <div className="flex flex-wrap gap-1.5">
                {user.followers.map((uname) => (
                  <Link
                    key={uname}
                    href={`/${uname}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border/50 bg-background/40 text-[11px] font-mono text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                  >
                    <UserAvatar username={uname} size="xs" />
                    <span>{uname}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="dash-card border border-dashed border-border/40 rounded-2xl py-8 text-center">
          <p className="text-xs font-mono text-muted-foreground/30">
            no connections yet —{" "}
            <Link href="/search" className="text-primary/60 hover:text-primary transition-colors">
              find people
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
