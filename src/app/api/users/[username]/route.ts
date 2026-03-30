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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const targetUsername = username.toLowerCase().trim()

  try {
    await connectDB()

    const target = await User.findByUsername(targetUsername)
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const viewerUsername = await getViewerUsername(req)

    const isFollowing = viewerUsername
      ? target.followers.includes(viewerUsername)
      : false

    const isFollowedBy = viewerUsername
      ? target.following.includes(viewerUsername)
      : false

    const isMutual = isFollowing && isFollowedBy

    return NextResponse.json({
      username: target.username,
      followerCount: target.followers.length,
      followingCount: target.following.length,
      isFollowing,
      isFollowedBy,
      isMutual,
      isOwnProfile: viewerUsername === targetUsername,
    })
  } catch (err) {
    console.error("[users/[username] GET]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
