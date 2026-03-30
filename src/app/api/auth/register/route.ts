import { connectDB } from "@/lib/db"
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit"
import User from "@/models/User"
import bcrypt from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"

const USERNAME_REGEX = /^[a-z0-9_]{4,20}$/

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, RATE_LIMITS.register)
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
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

  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Username is required" }, { status: 400 })
  }

  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Password is required" }, { status: 400 })
  }

  const normalised = username.toLowerCase().trim()

  if (!USERNAME_REGEX.test(normalised)) {
    return NextResponse.json(
      {
        error:
          "Username must be 4–20 characters and contain only lowercase letters, numbers, or underscores.",
      },
      { status: 400 }
    )
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    )
  }

  try {
    await connectDB()

    const existing = await User.findByUsername(normalised)
    if (existing) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      )
    }

    const hash = await bcrypt.hash(password, 12)
    await User.create({ username: normalised, hash })

    return NextResponse.json({ success: true, username: normalised }, { status: 201 })
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === 11000
    ) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      )
    }
    console.error("[register]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
