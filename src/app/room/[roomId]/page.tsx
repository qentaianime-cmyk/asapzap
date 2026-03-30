import { connectDB } from "@/lib/db"
import { redis } from "@/lib/redis"
import { verifyToken } from "@/lib/session"
import Room from "@/models/Room"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import ChatPage from "./chat"

async function getSessionUsername(): Promise<string | null> {
  const cookieStore = await cookies()
  const signedToken = cookieStore.get("authToken")?.value
  if (!signedToken) return null
  const uuid = verifyToken(signedToken)
  if (!uuid) return null
  return redis.get<string>(`session:${uuid}`)
}

function UnauthorizedRoom() {
  return (
    <div className="flex flex-col items-center justify-center h-[100dvh] bg-background text-foreground px-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="space-y-2">
          <p className="text-5xl font-bold font-mono text-muted-foreground/30">401</p>
          <h1 className="text-xl font-bold font-mono text-foreground">access denied</h1>
          <p className="text-sm text-muted-foreground font-mono leading-relaxed">
            this room is private. you need to be a participant to enter.
          </p>
        </div>
        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="block w-full rounded-xl border border-border bg-card/50 px-4 py-3 text-sm font-mono text-center hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            go to dashboard
          </Link>
          <Link
            href="/"
            className="block w-full text-xs font-mono text-muted-foreground text-center hover:text-foreground transition-colors py-1"
          >
            back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params

  const username = await getSessionUsername()
  if (!username) {
    redirect(`/login?next=/room/${roomId}`)
  }

  await connectDB()

  const now = new Date()
  const room = await Room.findOne({
    roomId,
    participants: username,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).lean()

  if (!room) {
    return <UnauthorizedRoom />
  }

  const otherParticipant = room!.participants.find((p) => p !== username) ?? null

  return <ChatPage otherParticipant={otherParticipant} viewerUsername={username} />
}
