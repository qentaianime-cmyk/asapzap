import { NextRequest, NextResponse } from "next/server"

const OG_TIMEOUT_MS = 5000

function extractMeta(html: string) {
  const get = (prop: string): string | null => {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"),
      new RegExp(`<meta[^>]+name=["']twitter:${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:${prop}["']`, "i"),
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) return match[1].trim()
    }
    return null
  }

  const titleMatch =
    html.match(/<title[^>]*>([^<]+)<\/title>/i)

  return {
    title: get("title") || titleMatch?.[1]?.trim() || null,
    description: get("description") || null,
    image: get("image") || null,
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 })
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "invalid protocol" }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), OG_TIMEOUT_MS)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; aspzap-bot/1.0; +https://aspzap.app)",
        "Accept": "text/html",
      },
    }).finally(() => clearTimeout(timeout))

    if (!res.ok) {
      return NextResponse.json({ error: "fetch failed" }, { status: 502 })
    }

    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html")) {
      return NextResponse.json({ error: "not html" }, { status: 415 })
    }

    // Only read first 50KB to avoid huge payloads
    const reader = res.body?.getReader()
    if (!reader) {
      return NextResponse.json({ error: "no body" }, { status: 502 })
    }

    let html = ""
    let bytesRead = 0
    const maxBytes = 50 * 1024

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      bytesRead += value.byteLength
    }
    reader.cancel()

    const meta = extractMeta(html)

    return NextResponse.json({
      title: meta.title,
      description: meta.description,
      image: meta.image,
      domain: parsedUrl.hostname,
      url,
    }, {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: "fetch error" }, { status: 502 })
  }
}
