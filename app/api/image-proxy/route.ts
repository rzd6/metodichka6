import { type NextRequest, NextResponse } from "next/server"

// Allowed hostnames — extend as needed
const ALLOWED_HOSTS = [
  "hebbkx1anhila5yf.public.blob.vercel-storage.com",
  "i.ibb.co",
  "ibb.co",
  "i.imgbb.com",
]

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) {
    return new NextResponse("Missing url param", { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new NextResponse("Invalid url", { status: 400 })
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new NextResponse("Host not allowed", { status: 403 })
  }

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      // 10 second timeout
      signal: AbortSignal.timeout(10_000),
    })

    if (!upstream.ok) {
      return new NextResponse("Upstream error", { status: upstream.status })
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream"
    const body = await upstream.arrayBuffer()

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    })
  } catch (err: any) {
    return new NextResponse("Proxy fetch failed", { status: 502 })
  }
}
