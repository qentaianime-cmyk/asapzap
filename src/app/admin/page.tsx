"use client"

import { UserAvatar } from "@/components/custom/user-avatar"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import gsap from "gsap"

interface Stats {
  totalUsers: number
  totalRooms: number
  activeRooms: number
  roomsToday: number
}

interface AdminUser {
  username: string
  followers: number
  following: number
  joinedAt: string
  roomCount: number
  banned: boolean
}

interface AdminRoom {
  roomId: string
  participants: string[]
  createdAt: number
  ttl: number
  messageCount: number
}

function formatTtl(ttl: number) {
  if (ttl < 0) return "∞"
  if (ttl < 60) return `${ttl}s`
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m`
  if (ttl < 86400) return `${Math.floor(ttl / 3600)}h`
  return `${Math.floor(ttl / 86400)}d`
}

type Tab = "overview" | "users" | "rooms"

export default function AdminPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("overview")
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [rooms, setRooms] = useState<AdminRoom[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [search, setSearch] = useState("")
  const [loadingData, setLoadingData] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)

  const fetchStats = useCallback(async () => {
    setLoadingData(true)
    try {
      const res = await fetch("/api/admin?section=stats", { credentials: "include" })
      if (res.ok) setStats(await res.json())
    } finally { setLoadingData(false) }
  }, [])

  const fetchUsers = useCallback(async (q = "") => {
    setLoadingData(true)
    try {
      const res = await fetch(`/api/admin?section=users&q=${encodeURIComponent(q)}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users ?? [])
        setTotalUsers(data.total ?? 0)
      }
    } finally { setLoadingData(false) }
  }, [])

  const fetchRooms = useCallback(async () => {
    setLoadingData(true)
    try {
      const res = await fetch("/api/admin?section=rooms", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setRooms(data.rooms ?? [])
      }
    } finally { setLoadingData(false) }
  }, [])

  useEffect(() => {
    if (tab === "overview") fetchStats()
    if (tab === "users") fetchUsers(search)
    if (tab === "rooms") fetchRooms()
  }, [tab, fetchStats, fetchUsers, fetchRooms, search])

  useEffect(() => {
    if (!stats || !statsRef.current) return
    const cards = statsRef.current.querySelectorAll<HTMLElement>(".stat-card")
    gsap.fromTo(cards,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: "power3.out" }
    )
  }, [stats])

  async function doAction(action: string, payload: Record<string, string>) {
    const id = toast.loading(`Running ${action}...`)
    const res = await fetch("/api/admin", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    })
    if (res.ok) {
      toast.success(`Done: ${action}`, { id })
      if (tab === "users") fetchUsers(search)
      if (tab === "rooms") fetchRooms()
    } else {
      toast.error("Action failed", { id })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "users", label: "Users", count: tab === "users" ? totalUsers : undefined },
    { key: "rooms", label: "Rooms", count: tab === "rooms" ? rooms.length : undefined },
  ]

  return (
    <div className="w-full min-h-screen">
      {/* Header bar */}
      <div className="border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <span className="font-black font-mono text-base">
              <span className="text-primary">{">"}</span>admin
            </span>
            <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground/40 px-2 py-0.5 rounded-md border border-border/50">
              @{user?.username}
            </span>
          </div>
          <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all duration-200",
                  tab === t.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="ml-1.5 text-[9px] font-mono text-primary/70">{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 py-8">

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {loadingData && !stats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-28 rounded-2xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : stats ? (
              <div ref={statsRef} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total users", value: stats.totalUsers, accent: true, icon: "◉" },
                  { label: "Active rooms", value: stats.activeRooms, accent: true, icon: "◎" },
                  { label: "Rooms created", value: stats.totalRooms, icon: "○" },
                  { label: "Rooms today", value: stats.roomsToday, icon: "◌" },
                ].map(({ label, value, accent, icon }) => (
                  <div key={label} className={cn(
                    "stat-card rounded-2xl border p-5 space-y-3 relative overflow-hidden",
                    accent ? "border-primary/20 bg-primary/[0.03]" : "border-border/60 bg-card/30"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs font-mono", accent ? "text-primary/60" : "text-muted-foreground/40")}>{icon}</span>
                    </div>
                    <div>
                      <p className={cn("text-3xl font-black font-mono tracking-tighter", accent ? "text-primary" : "text-foreground")}>
                        {value.toLocaleString()}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mt-1">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="border border-border/60 rounded-2xl bg-card/20 p-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/40 mb-4">Quick actions</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Manage users", action: () => setTab("users") },
                  { label: "Monitor rooms", action: () => setTab("rooms") },
                  { label: "Refresh stats", action: fetchStats },
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="text-xs font-mono px-4 py-2 rounded-xl border border-border/60 bg-background/50 hover:border-primary/40 hover:text-primary transition-all duration-200"
                  >
                    {label} →
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === "users" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-muted-foreground/30"
                />
              </div>
              <span className="text-xs font-mono text-muted-foreground/40 tabular-nums">{totalUsers} total</span>
            </div>

            <div className="rounded-2xl border border-border/60 overflow-hidden bg-card/20">
              {loadingData ? (
                <div className="divide-y divide-border/30">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 w-28 rounded bg-muted animate-pulse" />
                        <div className="h-2 w-44 rounded bg-muted/60 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : users.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-xs font-mono text-muted-foreground/30">no users found</p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {users.map((u) => (
                    <div key={u.username} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/10 transition-colors group">
                      <UserAvatar username={u.username} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-semibold text-foreground">@{u.username}</span>
                          {u.banned && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                              banned
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground/40 mt-0.5 truncate">
                          {u.followers}f · {u.following}g · {u.roomCount}r · joined {format(new Date(u.joinedAt), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => router.push(`/${u.username}`)}
                          className="text-[10px] font-mono px-2.5 py-1.5 rounded-lg border border-border/60 hover:border-primary/50 hover:text-primary transition-all"
                        >
                          view
                        </button>
                        {u.banned ? (
                          <button
                            onClick={() => doAction("unban", { username: u.username })}
                            className="text-[10px] font-mono px-2.5 py-1.5 rounded-lg border border-green-500/30 text-green-500/70 hover:border-green-500/60 hover:text-green-500 transition-all"
                          >
                            unban
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (confirm(`Ban @${u.username}?`)) doAction("ban", { username: u.username })
                            }}
                            className="text-[10px] font-mono px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive/60 hover:border-destructive/60 hover:text-destructive transition-all"
                          >
                            ban
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ROOMS ── */}
        {tab === "rooms" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono text-muted-foreground/40 tabular-nums">
                {rooms.length} active room{rooms.length !== 1 ? "s" : ""}
              </p>
              <button
                onClick={fetchRooms}
                className="text-xs font-mono px-3 py-1.5 rounded-lg border border-border/60 hover:border-primary/40 hover:text-primary transition-all"
              >
                refresh
              </button>
            </div>

            {loadingData && rooms.length === 0 ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : rooms.length === 0 ? (
              <div className="rounded-2xl border border-border/60 py-20 text-center bg-card/20">
                <p className="text-xs font-mono text-muted-foreground/30">no active rooms</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rooms.map((room) => (
                  <div
                    key={room.roomId}
                    className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card/20 px-5 py-4 hover:border-border transition-colors group"
                  >
                    <div className="flex items-center gap-1.5 shrink-0">
                      {room.participants.map((p) => (
                        <UserAvatar key={p} username={p} size="xs" />
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-foreground/80 truncate max-w-[100px]">
                          {room.roomId}
                        </span>
                        <span className={cn(
                          "text-[9px] font-mono px-1.5 py-0.5 rounded-full border",
                          room.ttl < 0
                            ? "bg-muted/30 text-muted-foreground/50 border-border/40"
                            : room.ttl < 300
                              ? "bg-destructive/10 text-destructive border-destructive/20"
                              : "bg-primary/10 text-primary border-primary/20"
                        )}>
                          {formatTtl(room.ttl)}
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground/30">
                          {room.messageCount} msg
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-muted-foreground/40 mt-0.5">
                        {room.participants.join(" · ")}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Destroy room ${room.roomId}?`)) {
                          doAction("destroy_room", { roomId: room.roomId })
                        }
                      }}
                      className="shrink-0 text-[10px] font-mono px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive/60 hover:border-destructive/60 hover:text-destructive transition-all"
                    >
                      destroy
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
