const DEV_SECRET = "dev-only-secret-do-not-use-in-prod-32chars"

if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("SESSION_SECRET must be set and at least 32 characters in production")
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET ?? DEV_SECRET
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

export async function verifyTokenEdge(token: string): Promise<string | null> {
  const dot = token.lastIndexOf(".")
  if (dot === -1) return null

  const uuid = token.slice(0, dot)
  const sigHex = token.slice(dot + 1)

  if (!uuid || !sigHex || sigHex.length !== 64) return null

  try {
    const key = await getKey()
    const sigBytes = hexToBytes(sigHex)
    const enc = new TextEncoder()

    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(uuid))
    return valid ? uuid : null
  } catch {
    return null
  }
}
