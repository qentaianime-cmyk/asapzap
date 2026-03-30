"use client"

import { Button } from "@/components/ui/button"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

const USERNAME_REGEX = /^[a-z0-9_]{4,20}$/

function getUsernameHint(value: string): { ok: boolean; msg: string } | null {
  if (!value) return null
  if (value.length < 4) return { ok: false, msg: "at least 4 characters" }
  if (value.length > 20) return { ok: false, msg: "max 20 characters" }
  if (!/^[a-z0-9_]+$/.test(value))
    return { ok: false, msg: "only lowercase letters, numbers, underscores" }
  return { ok: true, msg: `@${value} looks good` }
}

export default function RegisterPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const normalised = username.toLowerCase().trim()
  const hint = getUsernameHint(normalised)
  const isValidUsername = USERNAME_REGEX.test(normalised)
  const isValidPassword = password.length >= 8
  const canSubmit = isValidUsername && isValidPassword && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalised, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Registration failed.")
        return
      }

      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: normalised, password }),
      })

      if (loginRes.ok) {
        await queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
        router.push("/dashboard")
      } else {
        router.push("/login?registered=1")
      }
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
        <p className="text-muted-foreground text-sm">create your account</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border border-border rounded-2xl bg-card/50 p-6 backdrop-blur-md space-y-4"
      >
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
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            autoComplete="username"
            autoFocus
            placeholder="your_handle"
            maxLength={20}
            required
            className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          />
          {hint && (
            <p
              className={`text-xs font-mono ${
                hint.ok ? "text-green-500" : "text-destructive"
              }`}
            >
              {hint.ok ? `✓ share this ${hint.msg} with friends` : `✗ ${hint.msg}`}
            </p>
          )}
          {!hint && (
            <p className="text-xs text-muted-foreground font-mono">
              4–20 chars, lowercase letters, numbers, underscores
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            required
            className="w-full rounded-md bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          />
          {password.length > 0 && password.length < 8 && (
            <p className="text-xs font-mono text-destructive">
              ✗ minimum 8 characters ({8 - password.length} more)
            </p>
          )}
          {password.length >= 8 && (
            <p className="text-xs font-mono text-green-500">✓ password looks good</p>
          )}
        </div>

        <Button type="submit" className="w-full font-mono" disabled={!canSubmit}>
          {loading ? "creating account..." : "create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline font-mono">
          sign in
        </Link>
      </p>
    </div>
  )
}
