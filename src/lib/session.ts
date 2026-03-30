import { createHmac, timingSafeEqual } from "crypto"

const SECRET = process.env.SESSION_SECRET
if (!SECRET || SECRET.length < 32) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set and at least 32 characters in production")
  }
}

const secret = SECRET ?? "dev-only-secret-do-not-use-in-prod-32chars"

function hmac(data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex")
}

export function signToken(uuid: string): string {
  const sig = hmac(uuid)
  return `${uuid}.${sig}`
}

export function verifyToken(token: string): string | null {
  const dot = token.lastIndexOf(".")
  if (dot === -1) return null

  const uuid = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = hmac(uuid)

  try {
    const sigBuf = Buffer.from(sig, "hex")
    const expBuf = Buffer.from(expected, "hex")
    if (sigBuf.length !== expBuf.length) return null
    if (!timingSafeEqual(sigBuf, expBuf)) return null
  } catch {
    return null
  }

  return uuid
}
