import { connectDB } from "@/lib/db"
import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import User from "@/models/User"
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get("q")?.toLowerCase().trim() ?? ""

  if (!q || q.length < 1) {
    return NextResponse.json({ users: [] })
  }

  if (q.length > 20) {
    return NextResponse.json({ users: [] })
  }

  try {
    await connectDB()

    const results = await User.find(
      { username: { $regex: `^${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, $options: "i" } },
      { username: 1, followers: 1, following: 1, _id: 0 }
    )
      .limit(20)
      .lean()

    const viewer = await User.findByUsername(viewerUsername)
    const viewerFollowing = viewer?.following ?? []

    const users = results.map((u) => ({
      username: u.username,
      followerCount: u.followers.length,
      isFollowing: viewerFollowing.includes(u.username),
      isOwnProfile: u.username === viewerUsername,
    }))

    return NextResponse.json({ users })
  } catch (err) {
    console.error("[users/search GET]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
