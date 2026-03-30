import { nanoid } from "nanoid"
import { NextRequest, NextResponse } from "next/server"
import { redis } from "./lib/redis"
import { verifyTokenEdge } from "./lib/session-edge"

const AUTH_PROTECTED = ["/dashboard"]
const ADMIN_PATTERN = /^\/admin(\/|$)/
const ROOM_PATTERN = /^\/room\/([^/]+)$/

const ADMIN_USERNAMES = (process.env.ADMIN_USERNAME ?? "")
  .split(",")
  .map((u) => u.trim().toLowerCase())
  .filter(Boolean)

async function getSessionUsername(req: NextRequest): Promise<string | null> {
  const signedToken = req.cookies.get("authToken")?.value
  if (!signedToken) return null

  const uuid = await verifyTokenEdge(signedToken)
  if (!uuid) return null

  const username = await redis.get<string>(`session:${uuid}`)
  return username ?? null
}

function parseParticipants(value: unknown): string[] | null {
  if (!value) return null
  // Upstash auto-parses JSON — value may already be an array
  if (Array.isArray(value)) return value as string[]
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

function parseConnected(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value as string[]
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAuthProtected = AUTH_PROTECTED.some((p) => pathname.startsWith(p))
  const isAdminRoute = ADMIN_PATTERN.test(pathname)
  const roomMatch = pathname.match(ROOM_PATTERN)

  if (isAdminRoute) {
    const username = await getSessionUsername(req)
    if (!username) {
      const loginUrl = new URL("/login", req.url)
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (ADMIN_USERNAMES.length > 0 && !ADMIN_USERNAMES.includes(username)) {
      return NextResponse.redirect(new URL("/?error=unauthorized", req.url))
    }
    return NextResponse.next()
  }

  if (isAuthProtected) {
    const username = await getSessionUsername(req)
    if (!username) {
      const loginUrl = new URL("/login", req.url)
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  if (roomMatch) {
    const roomId = roomMatch[1]

    const username = await getSessionUsername(req)
    if (!username) {
      const loginUrl = new URL("/login", req.url)
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }

    const meta = await redis.hgetall<{
      connected: unknown
      createdAt: number
      maxConnected?: number
      participants?: unknown
    }>(`meta:${roomId}`)

    if (!meta) {
      return NextResponse.redirect(new URL("/?error=room-not-found", req.url))
    }

    const participants = parseParticipants(meta.participants)

    if (participants === null) {
      return NextResponse.redirect(new URL("/?error=unauthorized", req.url))
    }

    if (!participants.includes(username)) {
      return NextResponse.redirect(new URL("/?error=unauthorized", req.url))
    }

    // User is a confirmed participant — always issue a fresh token.
    // We intentionally do NOT block participants with a "room full" check;
    // the participant list is the only gate that matters.
    const connected = parseConnected(meta.connected)
    const existingToken = req.cookies.get("x-auth-token")?.value

    // If they already have a valid token for this room, let them straight through.
    if (existingToken && connected.includes(existingToken)) {
      return NextResponse.next()
    }

    const response = NextResponse.next()
    const token = nanoid()

    response.cookies.set("x-auth-token", token, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    })

    // Keep the connected list bounded so it doesn't grow forever across sessions.
    const MAX_TOKENS = 20
    const trimmed = connected.slice(-(MAX_TOKENS - 1))
    await redis.hset(`meta:${roomId}`, {
      connected: [...trimmed, token],
    })

    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/room/:path*", "/admin/:path*", "/admin"],
}
