import { redis } from "@/lib/redis"
import { NextRequest } from "next/server"

export interface RateLimitOptions {
  windowSeconds: number
  maxRequests: number
  keyPrefix: string
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0].trim()
  }
  return req.headers.get("x-real-ip") ?? "unknown"
}

export async function rateLimit(
  req: NextRequest,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const ip = getClientIp(req)
  const key = `ratelimit:${options.keyPrefix}:${ip}`
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - options.windowSeconds

  const pipeline = redis.pipeline()
  pipeline.zremrangebyscore(key, 0, windowStart)
  pipeline.zadd(key, { score: now, member: `${now}-${Math.random()}` })
  pipeline.zcard(key)
  pipeline.expire(key, options.windowSeconds)
  const results = await pipeline.exec()

  const count = (results[2] as number) ?? 0
  const remaining = Math.max(0, options.maxRequests - count)
  const resetAt = now + options.windowSeconds

  return {
    success: count <= options.maxRequests,
    remaining,
    resetAt,
  }
}

export const RATE_LIMITS = {
  register: { windowSeconds: 60, maxRequests: 5, keyPrefix: "register" },
  login: { windowSeconds: 60, maxRequests: 10, keyPrefix: "login" },
} as const
