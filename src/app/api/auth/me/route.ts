import { connectDB } from "@/lib/db"
import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import User from "@/models/User"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const signedToken = req.cookies.get("authToken")?.value

  if (!signedToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const uuid = verifyToken(signedToken)
  if (!uuid) {
    return NextResponse.json({ error: "Invalid session token" }, { status: 401 })
  }

  const username = await redis.get<string>(`session:${uuid}`)

  if (!username) {
    return NextResponse.json({ error: "Session expired or invalid" }, { status: 401 })
  }

  try {
    await connectDB()

    const user = await User.findByUsername(username)
    if (!user) {
      await redis.del(`session:${uuid}`)
      return NextResponse.json({ error: "User not found" }, { status: 401 })
    }

    return NextResponse.json(
      {
        username: user.username,
        followers: user.followers,
        following: user.following,
        createdAt: user.createdAt,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error("[me]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
