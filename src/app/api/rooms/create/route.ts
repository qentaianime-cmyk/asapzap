import { connectDB } from "@/lib/db"
import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import Room from "@/models/Room"
import User from "@/models/User"
import { nanoid } from "nanoid"
import { NextRequest, NextResponse } from "next/server"
import { pushNotification } from "@/app/api/notifications/route"

async function getViewerUsername(req: NextRequest): Promise<string | null> {
  const signedToken = req.cookies.get("authToken")?.value
  if (!signedToken) return null
  const uuid = verifyToken(signedToken)
  if (!uuid) return null
  return redis.get<string>(`session:${uuid}`)
}

const EXPIRY_SECONDS: Record<string, number> = {
  "1h": 60 * 60,
  "6h": 60 * 60 * 6,
  "24h": 60 * 60 * 24,
}

export async function POST(req: NextRequest) {
  const viewerUsername = await getViewerUsername(req)
  if (!viewerUsername) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { participantUsername?: string; expiresIn?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { participantUsername, expiresIn } = body

  if (!participantUsername) {
    return NextResponse.json({ error: "participantUsername is required" }, { status: 400 })
  }

  const targetUsername = participantUsername.toLowerCase().trim()

  if (targetUsername === viewerUsername) {
    return NextResponse.json({ error: "Cannot start a room with yourself" }, { status: 400 })
  }

  try {
    await connectDB()

    const [viewer, target] = await Promise.all([
      User.findByUsername(viewerUsername),
      User.findByUsername(targetUsername),
    ])

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!viewer) {
      return NextResponse.json({ error: "Viewer not found" }, { status: 404 })
    }

    const viewerFollowsTarget = target.followers.includes(viewerUsername)
    const targetFollowsViewer = viewer.followers.includes(targetUsername)

    if (!viewerFollowsTarget && !targetFollowsViewer) {
      return NextResponse.json(
        { error: "You must follow this user or be followed by them to start a private room" },
        { status: 403 }
      )
    }

    const roomId = nanoid()
    const participants = [viewerUsername, targetUsername]

    const ttlSeconds =
      expiresIn && EXPIRY_SECONDS[expiresIn] ? EXPIRY_SECONDS[expiresIn] : null

    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null

    await Promise.all([
      redis.hset(`meta:${roomId}`, {
        connected: [],
        createdAt: Date.now(),
        maxConnected: 2,
        participants: JSON.stringify(participants),
      }),
      ...(ttlSeconds ? [redis.expire(`meta:${roomId}`, ttlSeconds)] : []),
      Room.create({
        roomId,
        creatorUsername: viewerUsername,
        participants,
        expiresAt,
        isPrivate: true,
      }),
    ])

    await pushNotification(targetUsername, {
      type: "room_invite",
      from: viewerUsername,
      message: `@${viewerUsername} started a private room with you`,
      timestamp: Date.now(),
      extra: { roomId },
    })

    return NextResponse.json({ roomId })
  } catch (err) {
    console.error("[rooms/create POST]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
