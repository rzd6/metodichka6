import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, device_id, state, code_verifier, access_token, user_id } = body

    if (access_token && user_id) {
      const profileUrl = new URL("https://api.vk.com/method/users.get")
      profileUrl.searchParams.set("user_ids", String(user_id))
      profileUrl.searchParams.set("fields", "photo_200,photo_max_orig")
      profileUrl.searchParams.set("access_token", String(access_token))
      profileUrl.searchParams.set("v", "5.199")
      const profileRes = await fetch(profileUrl, { cache: "no-store" })
      const profileData = await profileRes.json()
      const profile = profileData.response?.[0]
      return NextResponse.json({
        photo: profile?.photo_max_orig || profile?.photo_200 || null,
      })
    }

    if (!code || !device_id) {
      console.error("[v0] VK exchange missing params", { hasCode: Boolean(code), hasDeviceId: Boolean(device_id) })
      return NextResponse.json({ error: "missing_params", description: "VK не передал code или device_id" }, { status: 400 })
    }

    const clientId = process.env.VK_APP_ID || "54678517"
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/login`

    const params: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      device_id,
      redirect_uri: redirectUri,
    }

    if (state) params.state = state
    if (code_verifier) params.code_verifier = code_verifier

    const tokenRes = await fetch("https://id.vk.com/oauth2/auth", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    })

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || tokenData.error) {
      console.error("[v0] VK token exchange error:", tokenData)
      return NextResponse.json(
        { error: tokenData.error || "exchange_failed", description: tokenData.error_description },
        { status: 400 },
      )
    }

    // Fetch the profile photo with the short-lived user token returned by VK.
    let photo: string | undefined
    try {
      const profileUrl = new URL("https://api.vk.com/method/users.get")
      profileUrl.searchParams.set("user_ids", String(tokenData.user_id))
      profileUrl.searchParams.set("fields", "photo_200,photo_max_orig")
      profileUrl.searchParams.set("access_token", tokenData.access_token)
      profileUrl.searchParams.set("v", "5.199")
      const profileRes = await fetch(profileUrl, { cache: "no-store" })
      const profile = (await profileRes.json()).response?.[0]
      photo = profile?.photo_max_orig || profile?.photo_200
    } catch {
      // Authentication still succeeds if VK does not return a photo.
    }

    return NextResponse.json({ ...tokenData, photo })
  } catch (err) {
    console.error("[v0] VK exchange route error:", err)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
