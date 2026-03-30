"use client"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

interface SearchUser {
  username: string
  followerCount: number
  isFollowing: boolean
  isOwnProfile: boolean
}

async function searchUsers(q: string): Promise<SearchUser[]> {
  if (!q.trim()) return []
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
    credentials: "include",
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.users ?? []
}

function UserCard({
  user,
  onFollowToggle,
  isToggling,
}: {
  user: SearchUser
  onFollowToggle: (username: string, isFollowing: boolean) => void
  isToggling: boolean
}) {
  const initials = user.username.slice(0, 2).toUpperCase()
  const colors = [
    "bg-red-500", "bg-blue-500", "bg-green-500", "bg-purple-500",
    "bg-orange-500", "bg-pink-500", "bg-teal-500", "bg-yellow-500",
  ]
  const color = colors[user.username.charCodeAt(0) % colors.length]

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card/50 hover:border-border/80 transition-colors">
      <div
        className={`${color} w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm font-mono flex-shrink-0`}
      >
        {initials}
      </div>
      <Link href={`/${user.username}`} className="flex-1 min-w-0">
        <p className="font-mono font-medium text-sm text-foreground hover:text-primary transition-colors truncate">
          @{user.username}
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          {user.followerCount} {user.followerCount === 1 ? "follower" : "followers"}
        </p>
      </Link>
      {!user.isOwnProfile && (
        <Button
          size="sm"
          variant={user.isFollowing ? "outline" : "default"}
          className="font-mono text-xs flex-shrink-0"
          disabled={isToggling}
          onClick={() => onFollowToggle(user.username, user.isFollowing)}
        >
          {isToggling ? "..." : user.isFollowing ? "following" : "follow"}
        </Button>
      )}
    </div>
  )
}

export default function SearchPage() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [togglingUser, setTogglingUser] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: isAuthenticated && debouncedQuery.length >= 1,
    staleTime: 10_000,
  })

  const { mutate: toggleFollow } = useMutation({
    mutationFn: async ({
      username,
      isFollowing,
    }: {
      username: string
      isFollowing: boolean
    }) => {
      setTogglingUser(username)
      const res = await fetch("/api/users/follow", {
        method: isFollowing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username }),
      })
      if (!res.ok) throw new Error("Failed")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["search"] })
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
    },
    onSettled: () => setTogglingUser(null),
  })

  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-sm px-4 py-16 text-center space-y-3">
        <p className="text-muted-foreground font-mono text-sm">sign in to search people</p>
        <Link href="/login?next=/search">
          <Button size="sm" className="font-mono text-xs">sign in</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm space-y-4 px-4 py-8">
      <div className="space-y-1">
        <h1 className="text-lg font-bold font-mono text-foreground">find people</h1>
        <p className="text-xs text-muted-foreground font-mono">search by @username</p>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">
          @
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) =>
            setQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
          }
          placeholder="username"
          maxLength={20}
          className="w-full rounded-xl bg-background border border-border pl-7 pr-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
        />
      </div>

      <div className="space-y-2">
        {isLoading && debouncedQuery && (
          <p className="text-center text-xs text-muted-foreground font-mono py-4 animate-pulse">
            searching...
          </p>
        )}

        {!isLoading && debouncedQuery && results.length === 0 && (
          <p className="text-center text-xs text-muted-foreground font-mono py-4">
            no users found for &quot;{debouncedQuery}&quot;
          </p>
        )}

        {results.map((user) => (
          <UserCard
            key={user.username}
            user={user}
            onFollowToggle={(u, isFollowing) => toggleFollow({ username: u, isFollowing })}
            isToggling={togglingUser === user.username}
          />
        ))}
      </div>

      {!query && (
        <p className="text-center text-xs text-muted-foreground font-mono pt-4">
          type a username to start searching
        </p>
      )}
    </div>
  )
}
