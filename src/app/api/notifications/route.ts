import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import { nanoid } from "nanoid"
import { NextRequest, NextResponse } from "next/server"

export interface Notification {
  id: string
  type: "follow" | "room_invite"
  from: string
  message: string
  timestamp: number
  read: boolean
  extra?: { roomId?: string }
}

const MAX_NOTIFICATIONS = 50

async function getUsername(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("authToken")?.value
  if (!token) return null
  const uuid = verifyToken(token)
  if (!uuid) return null
  return redis.get<string>(`session:${uuid}`)
}

export async function pushNotification(
  targetUsername: string,
  notif: Omit<Notification, "id" | "read">
) {
  const full: Notification = { ...notif, id: nanoid(), read: false }
  await redis.lpush(`notifications:${targetUsername}`, full)
  await redis.ltrim(`notifications:${targetUsername}`, 0, MAX_NOTIFICATIONS - 1)
}

export async function GET(req: NextRequest) {
  const username = await getUsername(req)
  if (!username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [notifications, readCount] = await Promise.all([
    redis.lrange<Notification>(`notifications:${username}`, 0, MAX_NOTIFICATIONS - 1),
    redis.get<number>(`notifications-read:${username}`),
  ])

  const listLen = notifications.length
  const prevRead = readCount ?? 0
  const unread = Math.max(0, listLen - prevRead)

  return NextResponse.json({ notifications, unread })
}

export async function POST(req: NextRequest) {
  const username = await getUsername(req)
  if (!username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = body?.action

  if (action === "read") {
    const len = await redis.llen(`notifications:${username}`)
    await redis.set(`notifications-read:${username}`, len)
    return NextResponse.json({ success: true })
  }

  if (action === "clear") {
    await redis.del(`notifications:${username}`, `notifications-read:${username}`)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
