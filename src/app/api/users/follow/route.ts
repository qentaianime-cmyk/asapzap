import { connectDB } from "@/lib/db"
import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import User from "@/models/User"
import { NextRequest, NextResponse } from "next/server"
import { pushNotification } from "@/app/api/notifications/route"

async function getViewerUsername(req: NextRequest): Promise<string | null> {
  const signedToken = req.cookies.get("authToken")?.value
  if (!signedToken) return null
  const uuid = verifyToken(signedToken)
  if (!uuid) return null
  return redis.get<string>(`session:${uuid}`)
}

export async function POST(req: NextRequest) {
  const viewerUsername = await getViewerUsername(req)
  if (!viewerUsername) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: { username?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const targetUsername = body.username?.toLowerCase().trim()
  if (!targetUsername) {
    return NextResponse.json({ error: "username is required" }, { status: 400 })
  }

  if (targetUsername === viewerUsername) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 })
  }

  try {
    await connectDB()

    const [viewer, target] = await Promise.all([
      User.findByUsername(viewerUsername),
      User.findByUsername(targetUsername),
    ])

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!viewer) {
      return NextResponse.json({ error: "Viewer not found" }, { status: 404 })
    }

    if (target.followers.includes(viewerUsername)) {
      return NextResponse.json({ success: true, alreadyFollowing: true })
    }

    await Promise.all([
      User.updateOne({ username: targetUsername }, { $addToSet: { followers: viewerUsername } }),
      User.updateOne({ username: viewerUsername }, { $addToSet: { following: targetUsername } }),
      pushNotification(targetUsername, {
        type: "follow",
        from: viewerUsername,
        message: `@${viewerUsername} followed you`,
        timestamp: Date.now(),
      }),
    ])

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error("[users/follow POST]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const viewerUsername = await getViewerUsername(req)
  if (!viewerUsername) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: { username?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const targetUsername = body.username?.toLowerCase().trim()
  if (!targetUsername) {
    return NextResponse.json({ error: "username is required" }, { status: 400 })
  }

  try {
    await connectDB()

    await Promise.all([
      User.updateOne({ username: targetUsername }, { $pull: { followers: viewerUsername } }),
      User.updateOne({ username: viewerUsername }, { $pull: { following: targetUsername } }),
    ])

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error("[users/follow DELETE]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
