import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID не задан" }, { status: 500 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const redirectUri = `${origin}/api/auth/callback`
  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/drive.file",
    state,
  })

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
  return response
}
