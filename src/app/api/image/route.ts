import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import { NextRequest, NextResponse } from "next/server"

async function getUsername(req: NextRequest): Promise<string | null> {
  const signedToken = req.cookies.get("authToken")?.value
  if (!signedToken) return null
  const uuid = verifyToken(signedToken)
  if (!uuid) return null
  return redis.get<string>(`session:${uuid}`)
}

export async function GET(req: NextRequest) {
  const username = await getUsername(req)
  if (!username) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const roomId = req.nextUrl.searchParams.get("roomId")
  const imgId = req.nextUrl.searchParams.get("imgId")

  if (!roomId || !imgId) {
    return new NextResponse("Missing params", { status: 400 })
  }

  // Verify participant
  const meta = await redis.hgetall<{ participants?: unknown }>(`meta:${roomId}`)
  if (!meta) {
    return new NextResponse("Room not found", { status: 404 })
  }

  let participants: string[] = []
  if (Array.isArray(meta.participants)) {
    participants = meta.participants as string[]
  } else if (typeof meta.participants === "string") {
    try {
      participants = JSON.parse(meta.participants)
    } catch {
      participants = []
    }
  }

  if (!participants.includes(username)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const dataUrl = await redis.get<string>(`room-img:${roomId}:${imgId}`)
  if (!dataUrl) {
    return new NextResponse("Image not found", { status: 404 })
  }

  // Parse the data URL
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    return new NextResponse("Corrupt image", { status: 500 })
  }

  const [, mimeType, base64] = match
  const buffer = Buffer.from(base64, "base64")

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": buffer.length.toString(),
    },
  })
}
