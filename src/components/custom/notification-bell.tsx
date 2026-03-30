"use client"

import { cn } from "@/lib/utils"
import { format } from "date-fns"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

interface Notification {
  id: string
  type: "follow" | "room_invite"
  from: string
  message: string
  timestamp: number
  read: boolean
  extra?: { roomId?: string }
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "include" })
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnread(data.unread ?? 0)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function markAllRead() {
    setLoading(true)
    try {
      await fetch("/api/notifications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      })
      setUnread(0)
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } finally {
      setLoading(false)
    }
  }

  async function clearAll() {
    setLoading(true)
    try {
      await fetch("/api/notifications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      })
      setNotifications([])
      setUnread(0)
    } finally {
      setLoading(false)
    }
  }

  function handleOpen() {
    setOpen((o) => !o)
    if (!open && unread > 0) markAllRead()
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className={cn(
          "relative flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
          open && "text-foreground bg-muted/50"
        )}
        aria-label="Notifications"
      >
        <BellIcon className={cn(unread > 0 && "animate-[wiggle_0.3s_ease-in-out_3]")} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold font-mono flex items-center justify-center px-0.5 leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl z-50 flex flex-col"
          style={{ animation: "slideDown 0.15s ease-out" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
              notifications
            </span>
            <div className="flex gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  disabled={loading}
                  className="text-[10px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  clear all
                </button>
              )}
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs font-mono text-muted-foreground/40">no notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((notif) => {
                const Icon = notif.type === "follow" ? "👤" : "💬"
                const content = (
                  <div
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
                      !notif.read && "bg-primary/5"
                    )}
                  >
                    <span className="text-base shrink-0 mt-0.5">{Icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug text-foreground">
                        {notif.message}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                        {format(notif.timestamp, "MMM d, HH:mm")}
                      </p>
                    </div>
                    {!notif.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                  </div>
                )

                if (notif.type === "room_invite" && notif.extra?.roomId) {
                  return (
                    <Link
                      key={notif.id}
                      href={`/room/${notif.extra.roomId}`}
                      onClick={() => setOpen(false)}
                    >
                      {content}
                    </Link>
                  )
                }

                if (notif.type === "follow") {
                  return (
                    <Link
                      key={notif.id}
                      href={`/${notif.from}`}
                      onClick={() => setOpen(false)}
                    >
                      {content}
                    </Link>
                  )
                }

                return <div key={notif.id}>{content}</div>
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
