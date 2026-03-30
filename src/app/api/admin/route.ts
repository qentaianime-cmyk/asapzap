import { connectDB } from "@/lib/db"
import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import Room from "@/models/Room"
import User from "@/models/User"
import { NextRequest, NextResponse } from "next/server"

const ADMIN_USERNAMES = (process.env.ADMIN_USERNAME ?? "")
  .split(",")
  .map((u) => u.trim().toLowerCase())
  .filter(Boolean)

async function getUsername(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("authToken")?.value
  if (!token) return null
  const uuid = verifyToken(token)
  if (!uuid) return null
  return redis.get<string>(`session:${uuid}`)
}

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const username = await getUsername(req)
  if (!username) return null
  if (ADMIN_USERNAMES.length > 0 && !ADMIN_USERNAMES.includes(username)) return null
  return username
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const section = searchParams.get("section") ?? "stats"

  await connectDB()

  if (section === "stats") {
    const [totalUsers, totalRooms] = await Promise.all([
      User.countDocuments(),
      Room.countDocuments(),
    ])

    const activeRoomKeys = await redis.keys("meta:*")
    const activeRooms = activeRoomKeys.length

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const roomsToday = await Room.countDocuments({ createdAt: { $gte: today } })

    return NextResponse.json({
      totalUsers,
      totalRooms,
      activeRooms,
      roomsToday,
    })
  }

  if (section === "users") {
    const search = searchParams.get("q") ?? ""
    const page = parseInt(searchParams.get("page") ?? "1")
    const limit = 30

    const query = search
      ? { username: { $regex: search, $options: "i" } }
      : {}

    const [users, total] = await Promise.all([
      User.find(query)
        .select("username followers following createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ])

    const bannedKeys = await redis.keys("banned:*")
    const banned = new Set(bannedKeys.map((k) => k.replace("banned:", "")))

    const usersWithRooms = await Promise.all(
      users.map(async (u) => {
        const roomCount = await Room.countDocuments({
          participants: u.username,
        })
        return {
          username: u.username,
          followers: u.followers.length,
          following: u.following.length,
          joinedAt: u.createdAt,
          roomCount,
          banned: banned.has(u.username),
        }
      })
    )

    return NextResponse.json({ users: usersWithRooms, total, page, limit })
  }

  if (section === "rooms") {
    const roomMetaKeys = await redis.keys("meta:*")
    const rooms = await Promise.all(
      roomMetaKeys.map(async (key) => {
        const roomId = key.replace("meta:", "")
        const [meta, msgCount, ttl] = await Promise.all([
          redis.hgetall<{
            participants: unknown
            createdAt: number
          }>(key),
          redis.llen(`messages:${roomId}`),
          redis.ttl(key),
        ])
        if (!meta) return null

        let participants: string[] = []
        if (Array.isArray(meta.participants)) participants = meta.participants as string[]
        else if (typeof meta.participants === "string") {
          try { participants = JSON.parse(meta.participants) } catch { /* ignore */ }
        }

        return {
          roomId,
          participants,
          createdAt: meta.createdAt,
          ttl,
          messageCount: msgCount,
        }
      })
    )

    return NextResponse.json({
      rooms: rooms.filter(Boolean).sort((a, b) => (b!.createdAt ?? 0) - (a!.createdAt ?? 0)),
    })
  }

  return NextResponse.json({ error: "Invalid section" }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { action, username, roomId } = body

  if (action === "ban" && username) {
    await redis.set(`banned:${username}`, "1")
    await redis.del(`session:${username}`)
    return NextResponse.json({ success: true })
  }

  if (action === "unban" && username) {
    await redis.del(`banned:${username}`)
    return NextResponse.json({ success: true })
  }

  if (action === "destroy_room" && roomId) {
    await connectDB()
    const imgIds = await redis.smembers<string[]>(`room-img-index:${roomId}`)
    await Promise.allSettled([
      redis.del(`meta:${roomId}`),
      redis.del(`messages:${roomId}`),
      redis.del(`deleted-msgs:${roomId}`),
      redis.del(`room-img-index:${roomId}`),
      ...imgIds.map((id) => redis.del(`room-img:${roomId}:${id}`)),
      Room.deleteOne({ roomId }),
    ])
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
