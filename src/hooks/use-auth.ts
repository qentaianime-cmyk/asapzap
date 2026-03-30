"use client"

import { useQuery } from "@tanstack/react-query"

export interface AuthUser {
  username: string
  followers: string[]
  following: string[]
  createdAt: string
}

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" })
  if (res.status === 401) return null
  if (!res.ok) return null
  return res.json()
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    staleTime: 30_000,
    retry: false,
  })

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
  }
}
