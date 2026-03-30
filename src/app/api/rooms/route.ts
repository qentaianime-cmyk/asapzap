import { connectDB } from "@/lib/db"
import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import Room from "@/models/Room"
import { NextRequest, NextResponse } from "next/server"

async function getViewerUsername(req: NextRequest): Promise<string | null> {
  const signedToken = req.cookies.get("authToken")?.value
  if (!signedToken) return null
  const uuid = verifyToken(signedToken)
  if (!uuid) return null
  return redis.get<string>(`session:${uuid}`)
}

export async function GET(req: NextRequest) {
  const viewerUsername = await getViewerUsername(req)
  if (!viewerUsername) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await connectDB()

    const now = new Date()
    const rooms = await Room.find({
      participants: viewerUsername,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .sort({ createdAt: -1 })
      .lean()

    const result = rooms.map((room) => {
      const otherParticipant = room.participants.find((p) => p !== viewerUsername) ?? null
      const secondsLeft = room.expiresAt
        ? Math.max(0, Math.floor((room.expiresAt.getTime() - now.getTime()) / 1000))
        : null

      return {
        roomId: room.roomId,
        otherParticipant,
        expiresAt: room.expiresAt ? room.expiresAt.toISOString() : null,
        secondsLeft,
        createdAt: room.createdAt.toISOString(),
      }
    })

    return NextResponse.json({ rooms: result })
  } catch (err) {
    console.error("[rooms GET]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
