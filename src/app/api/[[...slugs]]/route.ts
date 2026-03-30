import { connectDB } from "@/lib/db"
import { redis } from "@/lib/redis"
import Room from "@/models/Room"
import { Elysia } from "elysia"
import { nanoid } from "nanoid"
import { authMiddleware } from "./auth"
import { z } from "zod"
import { Message, realtime } from "@/lib/realtime"

const rooms = new Elysia({ prefix: "/room" })
  .use(authMiddleware)
  .get(
    "/ttl",
    async ({ auth }) => {
      const ttl = await redis.ttl(`meta:${auth.roomId}`)
      return { ttl: ttl >= 0 ? ttl : -1 }
    },
    { query: z.object({ roomId: z.string() }) }
  )
  .post(
    "/typing",
    async ({ auth }) => {
      await realtime.channel(auth.roomId).emit("chat.typing", { username: auth.username })
    },
    { query: z.object({ roomId: z.string() }) }
  )
  .post(
    "/presence",
    async ({ auth, body }) => {
      const { status } = body
      await realtime.channel(auth.roomId).emit("chat.presence", { username: auth.username, status })
    },
    {
      query: z.object({ roomId: z.string() }),
      body: z.object({ status: z.enum(["online", "away"]) }),
    }
  )
  .delete(
    "/",
    async ({ auth }) => {
      await realtime.channel(auth.roomId).emit("chat.destroy", { isDestroyed: true })

      const imgIds = await redis.smembers<string[]>(`room-img-index:${auth.roomId}`)

      await Promise.allSettled([
        redis.del(auth.roomId),
        redis.del(`meta:${auth.roomId}`),
        redis.del(`messages:${auth.roomId}`),
        redis.del(`room-img-index:${auth.roomId}`),
        ...imgIds.map((id) => redis.del(`room-img:${auth.roomId}:${id}`)),
        (async () => {
          try {
            await connectDB()
            await Room.deleteOne({ roomId: auth.roomId })
          } catch (err) {
            console.error("[room DELETE] MongoDB cleanup error:", err)
          }
        })(),
      ])
    },
    { query: z.object({ roomId: z.string() }) }
  )

const messages = new Elysia({ prefix: "/messages" })
  .use(authMiddleware)
  .post(
    "/",
    async ({ body, auth, set }) => {
      const { text, imageId } = body
      const { roomId, username } = auth

      const roomExists = await redis.exists(`meta:${roomId}`)
      if (!roomExists) {
        set.status = 400
        return { error: "Room does not exist" }
      }

      const message: Message = {
        id: nanoid(),
        sender: username,
        text,
        timestamp: Date.now(),
        roomId,
        imageId: imageId ?? undefined,
      }

      await redis.rpush(`messages:${roomId}`, { ...message, token: auth.token })
      await realtime.channel(roomId).emit("chat.message", message)

      const remaining = await redis.ttl(`meta:${roomId}`)
      if (remaining > 0) {
        await Promise.all([
          redis.expire(`messages:${roomId}`, remaining),
          redis.expire(`history:${roomId}`, remaining),
          redis.expire(roomId, remaining),
        ])
      }
    },
    {
      query: z.object({ roomId: z.string() }),
      body: z.object({
        text: z.string().max(1000),
        imageId: z.string().optional(),
      }),
    }
  )
  .get(
    "/",
    async ({ auth }) => {
      const [messages, deletedIds] = await Promise.all([
        redis.lrange<Message>(`messages:${auth.roomId}`, 0, -1),
        redis.smembers<string[]>(`deleted-msgs:${auth.roomId}`),
      ])
      const deletedSet = new Set(deletedIds ?? [])
      return {
        messages: messages
          .filter((m) => !deletedSet.has(m.id))
          .map((m) => ({
            ...m,
            token: m.token === auth.token ? auth.token : undefined,
          })),
      }
    },
    { query: z.object({ roomId: z.string() }) }
  )
  .delete(
    "/:messageId",
    async ({ auth, params, set }) => {
      const { messageId } = params
      const TWO_MINUTES = 2 * 60 * 1000

      const messages = await redis.lrange<Message>(`messages:${auth.roomId}`, 0, -1)
      const msg = messages.find((m) => m.id === messageId)

      if (!msg) {
        set.status = 404
        return { error: "Message not found" }
      }

      if (msg.sender !== auth.username) {
        set.status = 403
        return { error: "You can only delete your own messages" }
      }

      if (Date.now() - msg.timestamp > TWO_MINUTES) {
        set.status = 403
        return { error: "Message can only be deleted within 2 minutes" }
      }

      const ttl = await redis.ttl(`meta:${auth.roomId}`)
      await redis.sadd(`deleted-msgs:${auth.roomId}`, messageId)
      if (ttl > 0) {
        await redis.expire(`deleted-msgs:${auth.roomId}`, ttl)
      }

      await realtime.channel(auth.roomId).emit("chat.delete", { messageId })
    },
    { query: z.object({ roomId: z.string() }), params: z.object({ messageId: z.string() }) }
  )

const app = new Elysia({ prefix: "/api" }).use(rooms).use(messages)

export const GET = app.fetch
export const POST = app.fetch
export const DELETE = app.fetch

export type App = typeof app
