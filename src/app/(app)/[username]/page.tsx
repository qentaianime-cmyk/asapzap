"use client"

import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/custom/user-avatar"
import { useAuth } from "@/hooks/use-auth"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

interface ProfileData {
  username: string
  followerCount: number
  followingCount: number
  isFollowing: boolean
  isFollowedBy: boolean
  isMutual: boolean
  isOwnProfile: boolean
}

async function fetchProfile(username: string): Promise<ProfileData | null> {
  const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
    credentials: "include",
  })
  if (res.status === 404) return null
  if (!res.ok) return null
  return res.json()
}

function ProfileAvatar({ username, isOwnProfile }: { username: string; isOwnProfile: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [key, setKey] = useState(0)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error("Image too large — max 2 MB"); return }
    setUploading(true)
    const toastId = toast.loading("Uploading avatar...")
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/avatar", { method: "POST", body: fd, credentials: "include" })
      if (res.ok) {
        setKey((k) => k + 1)
        toast.success("Avatar updated", { id: toastId })
      } else {
        toast.error("Upload failed — try again", { id: toastId })
      }
    } catch {
      toast.error("Upload failed — network error", { id: toastId })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="relative group shrink-0">
      <UserAvatar key={key} username={username} size="xl" />
      {isOwnProfile && (
        <>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
            title="Change avatar"
          >
            {uploading ? (
              <svg className="w-4 h-4 text-white animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="31.416" strokeDashoffset="10" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleUpload}
          />
        </>
      )}
    </div>
  )
}

const TIMER_OPTIONS = [
  { label: "1 hour", value: "1h" },
  { label: "6 hours", value: "6h" },
  { label: "24 hours", value: "24h" },
  { label: "no expiry", value: null },
]

export default function ProfilePage() {
  const params = useParams()
  const username = (params.username as string).toLowerCase()
  const { user: viewer, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const router = useRouter()
  const [isNavigating, startTransition] = useTransition()
  const [expiresIn, setExpiresIn] = useState<string | null>("1h")
  const [showTimerPicker, setShowTimerPicker] = useState(false)

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => fetchProfile(username),
    staleTime: 15_000,
    retry: false,
  })

  const { mutate: toggleFollow, isPending: isFollowPending } = useMutation({
    mutationFn: async (isFollowing: boolean) => {
      const res = await fetch("/api/users/follow", {
        method: isFollowing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username }),
      })
      if (!res.ok) throw new Error("Failed to toggle follow")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", username] })
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
    },
  })

  const { mutate: startRoom, isPending: isStartingRoom } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ participantUsername: username, expiresIn }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to create room")
      }
      const { roomId } = await res.json()
      startTransition(() => {
        router.push(`/room/${roomId}`)
      })
    },
  })

  if (isLoading) {
    return (
      <div className="w-full max-w-sm px-4 py-16 text-center">
        <p className="text-muted-foreground font-mono text-sm animate-pulse">loading profile...</p>
      </div>
    )
  }

  if (error || profile === null) {
    return (
      <div className="w-full max-w-sm px-4 py-16 text-center space-y-3">
        <p className="text-destructive font-mono font-bold">USER NOT FOUND</p>
        <p className="text-muted-foreground text-sm">@{username} doesn't exist on aspzap.</p>
        <Link href="/search">
          <Button variant="outline" size="sm" className="font-mono text-xs mt-2">
            find people
          </Button>
        </Link>
      </div>
    )
  }

  const canShowStartRoom =
    isAuthenticated && !profile.isOwnProfile && (profile.isFollowing || profile.isFollowedBy)

  return (
    <div className="w-full max-w-sm space-y-4 px-4 py-8">
      {(isStartingRoom || isNavigating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <p className="font-mono text-sm text-muted-foreground animate-pulse">creating room...</p>
        </div>
      )}

      <div className="border border-border rounded-2xl bg-card/50 p-6 backdrop-blur-md space-y-5">
        <div className="flex items-center gap-4">
          <ProfileAvatar username={profile.username} isOwnProfile={profile.isOwnProfile} />
          <div>
            <h1 className="text-xl font-bold font-mono text-foreground">
              @{profile.username}
            </h1>
            {profile.isOwnProfile && (
              <p className="text-xs text-muted-foreground font-mono">this is you · hover avatar to change</p>
            )}
            {profile.isMutual && !profile.isOwnProfile && (
              <p className="text-xs text-primary font-mono">mutual follow</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-background px-4 py-3 text-center">
            <p className="text-2xl font-bold font-mono text-foreground">
              {profile.followerCount}
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">followers</p>
          </div>
          <div className="rounded-xl border border-border bg-background px-4 py-3 text-center">
            <p className="text-2xl font-bold font-mono text-foreground">
              {profile.followingCount}
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">following</p>
          </div>
        </div>

        {isAuthenticated && !profile.isOwnProfile && (
          <div className="space-y-2">
            <Button
              onClick={() => toggleFollow(profile.isFollowing)}
              disabled={isFollowPending}
              variant={profile.isFollowing ? "outline" : "default"}
              className="w-full font-mono"
            >
              {isFollowPending
                ? "..."
                : profile.isFollowing
                ? "unfollow"
                : "follow"}
            </Button>

            {canShowStartRoom && (
              <>
                {showTimerPicker ? (
                  <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                    <p className="text-xs text-muted-foreground font-mono">room self-destructs in</p>
                    <div className="grid grid-cols-2 gap-2">
                      {TIMER_OPTIONS.map((opt) => (
                        <button
                          key={String(opt.value)}
                          onClick={() => setExpiresIn(opt.value)}
                          className={`rounded-lg border px-3 py-2 text-xs font-mono transition-colors ${
                            expiresIn === opt.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={() => startRoom()}
                        disabled={isStartingRoom || isNavigating}
                        className="flex-1 font-mono text-xs"
                        size="sm"
                      >
                        {isStartingRoom || isNavigating ? "creating..." : "create room"}
                      </Button>
                      <Button
                        onClick={() => setShowTimerPicker(false)}
                        variant="ghost"
                        size="sm"
                        className="font-mono text-xs"
                      >
                        cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowTimerPicker(true)}
                    variant="outline"
                    className="w-full font-mono text-primary border-primary/40 hover:bg-primary/5"
                  >
                    start private room
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {profile.isOwnProfile && (
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="w-full font-mono text-xs">
              go to your dashboard
            </Button>
          </Link>
        )}

        {!isAuthenticated && (
          <Link href="/login">
            <Button variant="outline" size="sm" className="w-full font-mono text-xs">
              sign in to follow
            </Button>
          </Link>
        )}
      </div>

      <div className="text-center">
        <Link href="/search" className="text-xs text-muted-foreground hover:text-foreground font-mono transition-colors">
          ← find more people
        </Link>
      </div>
    </div>
  )
}
