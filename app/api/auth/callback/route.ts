import { NextRequest, NextResponse } from "next/server"

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character)
}

function page(title: string, content: string, status = 200) {
  return new NextResponse(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui;background:#111;color:#eee;padding:32px;max-width:900px;margin:auto}code,pre{display:block;background:#222;padding:16px;border-radius:8px;overflow:auto;word-break:break-all}strong{color:#5eead4}</style></head><body><h1>${escapeHtml(title)}</h1>${content}</body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const error = searchParams.get("error")
  const code = searchParams.get("code")
  const returnedState = searchParams.get("state")
  const savedState = request.cookies.get("google_oauth_state")?.value

  if (error) return page("Google OAuth отменён", `<p>${escapeHtml(error)}</p>`, 400)
  if (!code) return page("Google OAuth: нет кода", "<p>Google не вернул параметр code.</p>", 400)
  if (!returnedState || !savedState || returnedState !== savedState) {
    return page("Google OAuth: неверный state", "<p>Запустите авторизацию заново через /api/auth/google.</p>", 400)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return page("OAuth не настроен", "<p>GOOGLE_CLIENT_ID или GOOGLE_CLIENT_SECRET не задан.</p>", 500)

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || origin}/api/auth/callback`
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    cache: "no-store",
  })
  const tokenData = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok) return page("Google OAuth: ошибка обмена", `<pre>${escapeHtml(JSON.stringify(tokenData, null, 2))}</pre>`, 502)
  if (!tokenData.refresh_token) return page("Refresh token не получен", "<p>Запустите авторизацию заново с prompt=consent и удалите разрешение приложения Google перед повтором.</p>", 502)

  return page("Refresh token получен", `<p>Скопируйте значение и добавьте его в защищённую переменную <strong>GOOGLE_REFRESH_TOKEN</strong>. Не публикуйте его.</p><pre>${escapeHtml(tokenData.refresh_token)}</pre><p>После сохранения переменной этот временный маршрут можно удалить.</p>`)
}
