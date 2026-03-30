"use client"

import { Button } from "@/components/ui/button"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const rawNext = searchParams.get("next") ?? "/dashboard"
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.toLowerCase().trim(), password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Login failed. Please try again.")
        return
      }

      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
      router.push(next)
    } catch {
      setError("Network error. Please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6 px-4">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary font-mono">
          {">"}<span className="text-foreground">aspzap</span>
        </h1>
        <p className="text-muted-foreground text-sm">sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="border border-border rounded-2xl bg-card/50 p-6 backdrop-blur-md space-y-4">
        {error && (
          <div className="bg-destructive/10 border border-destructive/40 px-3 py-2 rounded-md text-destructive text-sm font-mono">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            placeholder="your_handle"
            required
            className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          />
        </div>

        <Button
          type="submit"
          className="w-full font-mono"
          disabled={loading || !username || !password}
        >
          {loading ? "signing in..." : "sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        no account?{" "}
        <Link href="/register" className="text-primary hover:underline font-mono">
          register
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
