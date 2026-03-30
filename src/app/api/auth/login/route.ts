import { connectDB } from "@/lib/db"
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit"
import { redis } from "@/lib/redis"
import { signToken } from "@/lib/session"
import User from "@/models/User"
import bcrypt from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, RATE_LIMITS.login)
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait a minute." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      }
    )
  }

  let body: { username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { username, password } = body

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 }
    )
  }

  try {
    await connectDB()

    const user = await User.findByUsername(username)
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      )
    }

    const valid = await bcrypt.compare(password, user.hash)
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      )
    }

    const uuid = crypto.randomUUID()
    const signedToken = signToken(uuid)

    await redis.set(`session:${uuid}`, user.username, { ex: SESSION_TTL_SECONDS })

    const response = NextResponse.json(
      { success: true, username: user.username },
      { status: 200 }
    )

    response.cookies.set("authToken", signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    })

    return response
  } catch (err) {
    console.error("[login]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
