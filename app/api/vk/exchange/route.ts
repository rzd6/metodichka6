import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, device_id, state, code_verifier } = body
    const accessToken = body.access_token ?? body.accessToken ?? body.user?.access_token
    const requestedRedirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : null
    const userId = body.user_id ?? body.userId ?? body.user?.id

    if (accessToken && userId) {
      const profileUrl = new URL("https://api.vk.com/method/users.get")
      profileUrl.searchParams.set("user_ids", String(userId))
      profileUrl.searchParams.set("fields", "photo_200,photo_max_orig")
      profileUrl.searchParams.set("access_token", String(accessToken))
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
    const requestOrigin = new URL(request.url).origin
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
    const configuredRedirectUri =
      process.env.VK_REDIRECT_URI ||
      process.env.NEXT_PUBLIC_VK_REDIRECT_URI ||
      (configuredAppUrl ? `${configuredAppUrl}/login` : "https://metodichka-rzd6.vercel.app/login")
    // VK validates redirect_uri against the exact URL configured in the app.
    const redirectUri =
      requestedRedirectUri && new URL(requestedRedirectUri).origin === requestOrigin
        ? requestedRedirectUri
        : configuredRedirectUri

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

    // VK ID access tokens are resolved through VK ID's user_info endpoint.
    // Calling api.vk.com/users.get with this token can succeed for auth while
    // returning no profile photo, which is why the widget's avatar was lost.
    let photo: string | undefined
    try {
      const userInfoRes = await fetch("https://id.vk.ru/oauth2/user_info", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          access_token: String(tokenData.access_token),
        }),
        cache: "no-store",
      })
      const userInfo = await userInfoRes.json()
      const profile = userInfo.user ?? userInfo.response?.user ?? userInfo.response
      photo = profile?.avatar || profile?.photo_max_orig || profile?.photo_200 || profile?.photo
    } catch {
      // Authentication still succeeds if VK does not return a photo.
    }

    // VK ID user_info may omit the avatar. Use the configured service token as
    // a server-side fallback for the numeric VK user ID returned by OAuth.
    if (!photo && tokenData.user_id && process.env.VK_SERVICE_TOKEN) {
      try {
        const profileUrl = new URL("https://api.vk.com/method/users.get")
        profileUrl.searchParams.set("user_ids", String(tokenData.user_id))
        profileUrl.searchParams.set("fields", "photo_max_orig,photo_200")
        profileUrl.searchParams.set("access_token", process.env.VK_SERVICE_TOKEN)
        profileUrl.searchParams.set("v", "5.199")
        const profileRes = await fetch(profileUrl, { cache: "no-store" })
        const profileData = await profileRes.json()
        if (profileData.error) console.error("[v0] VK service profile error:", profileData.error)
        const profile = profileData.response?.[0]
        photo = profile?.photo_max_orig || profile?.photo_200
      } catch (error) {
        console.error("[v0] VK service profile request failed:", error)
      }
    }

    return NextResponse.json({ ...tokenData, photo })
  } catch (err) {
    console.error("[v0] VK exchange route error:", err)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
