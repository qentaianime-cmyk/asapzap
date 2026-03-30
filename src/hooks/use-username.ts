"use client"

import { useAuth } from "./use-auth"

export const useUsername = () => {
  const { user, isLoading } = useAuth()
  return { username: user?.username ?? "", isLoading }
}
