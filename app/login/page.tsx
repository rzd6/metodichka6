"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Script from "next/script"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authenticateUser, findUsersByVkId } from "@/data/users"
import { DEV_VK_USER_ID, makeDevUser } from "@/lib/dev-account"
import { useTheme } from "@/contexts/theme-context"
import Image from "next/image"

// VK ID разрешает только redirect URL, добавленные в настройках приложения.
const VK_APP_ID = Number(process.env.NEXT_PUBLIC_VK_APP_ID || 54678517)
const VK_REDIRECT_URI =
  process.env.NEXT_PUBLIC_VK_REDIRECT_URI || "https://metodichka-rzd6.vercel.app/login"

export default function LoginPage() {
  const [nickname, setNickname] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [copiedVkId, setCopiedVkId] = useState(false)
  const [vkAccounts, setVkAccounts] = useState<any[]>([])
  const [vkPhoto, setVkPhoto] = useState<string | undefined>()
  const floatingOneTapRef = useRef<any>(null)
  const router = useRouter()
  const { theme } = useTheme()

  const loginColor = "#d32f2f"
  const roleAvatars: Record<string, string> = {
    "Руководство": "/avatars/management.png",
    "Заместитель": "/avatars/senior-staff.png",
    "Старший Состав": "/avatars/senior-staff.png",
    "ЦдУД": "/avatars/cdud.png",
    "ПТО": "/avatars/pto.png",
    "Тех. Администратор": "/avatars/management.png",
  }

  useEffect(() => {
    const currentUser = localStorage.getItem("currentUser")
    if (currentUser && window.location.pathname === "/login") {
      window.location.replace("/")
    }
  }, [])

  const completeVkLogin = async (user: any, photo?: string) => {
    const updatedUser = photo && user.id !== "dev-test-account"
      ? (await fetch("/api/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: user.id, vk_avatar: photo }),
        }).then(async (response) => {
          const result = await response.json()
          return response.ok && result.data ? { ...user, ...result.data, vkAvatar: photo } : { ...user, vkAvatar: photo }
        }).catch(() => ({ ...user, vkAvatar: photo })))
      : user
    localStorage.setItem("currentUser", JSON.stringify(updatedUser))
    router.push("/")
  }

  const vkidOnSuccess = async (data: any) => {
    try {
      const exchangeResponse = await fetch("/api/vk/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          redirect_uri: VK_REDIRECT_URI,
        }),
      })
      const exchanged = await exchangeResponse.json()
      if (!exchangeResponse.ok || exchanged.error) throw new Error(exchanged.description || exchanged.error)

      const vkUserId = String(
        exchanged?.user_id ?? exchanged?.user?.id ?? data?.user_id ?? data?.user?.id ?? data?.id ?? ""
      )
      if (!vkUserId || vkUserId === "undefined") {
        setError("Не удалось получить числовой ID ВКонтакте.")
        return
      }

      const databaseAccounts = await findUsersByVkId(vkUserId)
      const accounts = vkUserId === DEV_VK_USER_ID ? [makeDevUser(), ...databaseAccounts] : databaseAccounts

      if (accounts.length === 0) {
        setError(`VK ID ${vkUserId} не привязан ни к одному аккаунту. Попросите администратора прописать именно этот числовой ID в настройках пользователя.`)
        return
      }

      const photo = exchanged?.photo
      if (accounts.length === 1) {
        await completeVkLogin(accounts[0], photo)
      } else {
        setVkPhoto(photo)
        setVkAccounts(accounts)
      }

    } catch {
      setError("Ошибка авторизации через ВКонтакте. Попробуйте снова.")
    }
  }

  const vkidOnError = (err: any) => {
    console.error("[VK] error:", err)
    const description = err?.message || err?.text || ""
    setError(description ? `Ошибка авторизации VK: ${description}` : "Ошибка авторизации через ВКонтакте. Попробуйте снова.")
  }

  // Вызывается после загрузки SDK — сразу рендерим виджет без ручной кнопки
  const initVkSdk = () => {
    const win = window as any
    if (!("VKIDSDK" in win) || floatingOneTapRef.current) return
    const VKID = win.VKIDSDK

    VKID.Config.init({
      app: VK_APP_ID,
      redirectUrl: VK_REDIRECT_URI,
      responseMode: VKID.ConfigResponseMode.Callback,
      source: VKID.ConfigSource.LOWCODE,
      scope: "",
    })

    // Рендерим виджет сразу после инициализации
    const container = document.getElementById("vk-onetap-container")
    if (!container) return
    floatingOneTapRef.current = VKID

    const oneTap = new VKID.OneTap()
    oneTap
      .render({
        container,
        showAlternativeLogin: false,
        styles: { borderRadius: 8, width: container.offsetWidth || 340 },
      })
      .on(VKID.WidgetEvents.ERROR, vkidOnError)
      .on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, function (payload: any) {
        const code = payload.code
        const deviceId = payload.device_id

        VKID.Auth.exchangeCode(code, deviceId)
          .then(vkidOnSuccess)
          .catch(vkidOnError)
      })

  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    if (!nickname || !password) {
      setError("Заполните все поля")
      setLoading(false)
      return
    }

    const user = await authenticateUser(nickname, password)

    if (!user) {
      setError("Неверный никнейм или пароль")
      setLoading(false)
      return
    }

    localStorage.setItem("currentUser", JSON.stringify(user))
    setLoading(false)
    router.push("/")
  }

  return (
    <>
      {/* VK ID SDK — загружается один раз, инициализация сразу после загрузки */}
      <Script
        src="https://unpkg.com/@vkid/sdk@2.6.8/dist-sdk/umd/index.js"
        strategy="afterInteractive"
        onLoad={initVkSdk}
      />

      <div
        className="flex min-h-screen w-full items-center justify-center p-6 relative"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        {/* Background image — loaded as a separate layer so the dark fallback shows instantly */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "url('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/sapsan-bridge-P2tdAk8LEJIgwJMoqXjcGPvLxnyjps.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div className="absolute inset-0 bg-black/40" />

        <Card
          className={`w-full max-w-sm shadow-2xl border-2 relative z-10 ${
            theme.mode === "dark" ? "bg-black/70 border-white/10" : "bg-white/95 border-gray-200"
          }`}
        >
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center mb-2">
              <div className="w-32 h-32 flex items-center justify-center rounded-full overflow-hidden shadow-lg">
                <Image
                  src="https://i.imgur.com/Jf1SDzt.jpeg"
                  alt="РЖД Logo"
                  width={128}
                  height={128}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold" style={{ color: loginColor }}>
              РЖД
            </CardTitle>
            <CardDescription className={`text-base ${theme.mode === "dark" ? "text-white/70" : "text-gray-600"}`}>
              Методичка РЖД — Вход в систему
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {vkAccounts.length > 1 ? (
              <div className="space-y-4" role="dialog" aria-labelledby="vk-account-title">
<div className="rounded-xl border border-red-600/45 bg-red-950/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <h2 id="vk-account-title" className="text-lg font-semibold text-red-50">Выберите аккаунт</h2>
              <p className="mt-1 text-sm text-red-100/75">Выберите профиль для входа в Методичку.</p>
                </div>
                <div className="space-y-2">
                  {vkAccounts.map((account) => {
                    const avatar = roleAvatars[account.role] || "/avatars/cdud.png"
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => completeVkLogin(account, vkPhoto)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-red-400/70 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      >
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-red-600/70 bg-red-950/70 shadow-[0_0_0_3px_rgba(127,29,29,0.35)]">
                          <img
                    src={avatar}
                    alt=""
                    className="h-full w-full scale-110 object-cover"
                    style={{ filter: theme.mode === "dark" ? "sepia(0.18) saturate(1.18) hue-rotate(-8deg)" : "sepia(0.1) saturate(1.08) hue-rotate(-5deg)" }}
                  />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-white">{account.nickname}</span>
                          <span className="mt-0.5 block truncate text-sm text-red-100/70">{account.role}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <Button
                type="button"
                className="h-11 w-full font-semibold text-white transition-colors hover:bg-[#b71c1c]"
                style={{ backgroundColor: loginColor }}
                onClick={() => setVkAccounts([])}
              >
                Назад
              </Button>
              </div>
            ) : <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nickname" className={theme.mode === "dark" ? "text-white" : "text-black"}>
                  Никнейм
                </Label>
                <Input
                  id="nickname"
                  type="text"
                  placeholder="Введите ваш никнейм"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                  className={`h-11 ${
                    theme.mode === "dark"
                      ? "bg-white/5 border-white/10 text-white"
                      : "bg-white border-gray-300 text-black"
                  }`}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className={theme.mode === "dark" ? "text-white" : "text-black"}>
                  Пароль
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Введите ваш пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`h-11 ${
                    theme.mode === "dark"
                      ? "bg-white/5 border-white/10 text-white"
                      : "bg-white border-gray-300 text-black"
                  }`}
                />
              </div>

              {error && (() => {
                // Извлекаем числовой VK ID из текста ошибки если есть
                const vkIdMatch = error.match(/VK ID (\d+)/)
                const embeddedVkId = vkIdMatch?.[1] ?? null
                return (
                  <div
                    className={`text-sm p-3 rounded-lg border space-y-2 ${
                      theme.mode === "dark"
                        ? "text-red-200 bg-red-900/20 border-red-800"
                        : "text-red-600 bg-red-50 border-red-200"
                    }`}
                  >
                    <p>{error}</p>
                    {embeddedVkId && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(embeddedVkId)
                          setCopiedVkId(true)
                          setTimeout(() => setCopiedVkId(false), 2000)
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono font-semibold transition-colors"
                        style={{
                          backgroundColor: copiedVkId ? "#16a34a20" : "#0077FF20",
                          color: copiedVkId ? "#16a34a" : "#0077FF",
                          border: `1px solid ${copiedVkId ? "#16a34a40" : "#0077FF40"}`,
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                          <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.713-1.033-1.01-1.49-1.146-1.745-1.146-.356 0-.458.103-.458.6v1.564c0 .43-.136.686-1.27.686-1.865 0-3.932-1.129-5.387-3.236C4.937 11.57 4.22 9.436 4.22 9.003c0-.254.102-.491.6-.491h1.744c.447 0 .617.204.789.682.869 2.509 2.324 4.708 2.927 4.708.224 0 .326-.103.326-.668V10.64c-.067-1.198-.7-1.3-.7-1.727 0-.204.167-.408.433-.408h2.744c.375 0 .51.2.51.63v3.39c0 .375.167.51.272.51.224 0 .41-.136.82-.547 1.27-1.42 2.175-3.607 2.175-3.607.12-.254.326-.491.773-.491h1.744c.525 0 .64.27.525.63-.22.99-2.361 4.049-2.361 4.049-.187.306-.254.44 0 .783.188.256.8.783 1.21 1.256.748.852 1.32 1.565 1.474 2.059.153.477-.09.72-.573.72z" />
                        </svg>
                        {copiedVkId ? "Скопировано!" : `Скопировать ID: ${embeddedVkId}`}
                      </button>
                    )}
                  </div>
                )
              })()}

              <Button
                type="submit"
                className="w-full h-11 text-white font-semibold"
                disabled={loading}
                style={{ backgroundColor: loginColor }}
              >
                {loading ? "Вход..." : "Войти"}
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <div className={`flex-1 h-px ${theme.mode === "dark" ? "bg-white/10" : "bg-gray-200"}`} />
              <span className={`text-xs ${theme.mode === "dark" ? "text-white/40" : "text-gray-400"}`}>
                или
              </span>
              <div className={`flex-1 h-px ${theme.mode === "dark" ? "bg-white/10" : "bg-gray-200"}`} />
            </div>
              <div id="vk-onetap-container" className="min-h-11 w-full overflow-hidden rounded-lg" />
            </>}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
