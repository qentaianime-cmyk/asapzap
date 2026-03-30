import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const signedToken = req.cookies.get("authToken")?.value

  if (signedToken) {
    const uuid = verifyToken(signedToken)
    if (uuid) {
      await redis.del(`session:${uuid}`)
    }
  }

  const response = NextResponse.json({ success: true }, { status: 200 })

  response.cookies.set("authToken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  })

  return response
}
