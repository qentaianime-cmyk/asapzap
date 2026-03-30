import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import { nanoid } from "nanoid"
import { NextRequest, NextResponse } from "next/server"

const MAX_SIZE_BYTES = 3 * 1024 * 1024 // 3 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]

async function getUsername(req: NextRequest): Promise<string | null> {
  const signedToken = req.cookies.get("authToken")?.value
  if (!signedToken) return null
  const uuid = verifyToken(signedToken)
  if (!uuid) return null
  return redis.get<string>(`session:${uuid}`)
}

export async function POST(req: NextRequest) {
  const username = await getUsername(req)
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const roomId = req.nextUrl.searchParams.get("roomId")
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 })
  }

  // Verify user is a participant
  const meta = await redis.hgetall<{ participants?: unknown }>(`meta:${roomId}`)
  if (!meta) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 })
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
    return NextResponse.json({ error: "Not a participant" }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Only JPEG, PNG, GIF, WebP allowed." }, { status: 400 })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large. Max 3 MB." }, { status: 413 })
  }

  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString("base64")
  const dataUrl = `data:${file.type};base64,${base64}`

  const imgId = nanoid()
  const key = `room-img:${roomId}:${imgId}`

  // Get room TTL to set same expiry on the image
  const ttl = await redis.ttl(`meta:${roomId}`)
  await redis.set(key, dataUrl)
  if (ttl > 0) {
    await redis.expire(key, ttl)
  }

  // Track image IDs for this room (for cleanup on destroy)
  await redis.sadd(`room-img-index:${roomId}`, imgId)
  if (ttl > 0) {
    await redis.expire(`room-img-index:${roomId}`, ttl)
  }

  return NextResponse.json({ imgId })
}
