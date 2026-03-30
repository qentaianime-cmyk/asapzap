import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import { NextRequest, NextResponse } from "next/server"

const MAX_AVATAR_BYTES = 2 * 1024 * 1024

async function getUsername(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("authToken")?.value
  if (!token) return null
  const uuid = verifyToken(token)
  if (!uuid) return null
  return redis.get<string>(`session:${uuid}`)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const username = searchParams.get("username")

  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 })
  }

  const data = await redis.get<string>(`avatar:${username.toLowerCase()}`)
  if (!data) {
    return NextResponse.json({ error: "no avatar" }, { status: 404 })
  }

  const base64Data = data.replace(/^data:image\/[^;]+;base64,/, "")
  const mimeMatch = data.match(/^data:(image\/[^;]+)/)
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg"
  const buffer = Buffer.from(base64Data, "base64")

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400",
    },
  })
}

export async function POST(req: NextRequest) {
  const username = await getUsername(req)
  if (!username) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "Image too large (max 2 MB)" }, { status: 400 })
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString("base64")}`

  await redis.set(`avatar:${username}`, base64)

  return NextResponse.json({ success: true, username })
}
