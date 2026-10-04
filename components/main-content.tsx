"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { ContentSection } from "@/components/sections/content-section"
import { ThemeProvider, useTheme } from "@/contexts/theme-context"
import { AccessProvider } from "@/contexts/access-context"
import { TechModeGuard } from "@/components/tech-mode-guard"
import type { UserRole } from "@/data/users"
import { getAllUsers } from "@/data/users"
import { getThemeColor } from "@/lib/theme-utils"
import { proxyImageUrl } from "@/lib/image-proxy"

interface LocalUser {
  id: string
  nickname: string
  role: UserRole
  vkAccessToken: string
  secondaryRole?: "Тех. Администратор" | "РЖД"
  customAvatar?: string
  reportTag?: string
  gender?: "male" | "female"
  isDefaultPassword?: boolean
  position?: string
  medicalCard?: string
}

function MainContentInner() {
  const [activeSection, setActiveSection] = useState("contents")
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [user, setUser] = useState<LocalUser | null>(null)
  const [showAccountWarnings, setShowAccountWarnings] = useState(false)
  const [customBg, setCustomBg] = useState<string | null>(null)
  const [globalTechMode, setGlobalTechMode] = useState(false)
  const { theme } = useTheme()

  useEffect(() => {
    void fetch("/api/sync-from-sheets", { cache: "no-store" }).then(() => getAllUsers(true)).catch(() => undefined)
  }, [])

  const DEFAULT_BACKGROUND =
    "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/sapsan-bridge-P2tdAk8LEJIgwJMoqXjcGPvLxnyjps.jpg"

  // Load custom background from localStorage on mount + listen for updates
  useEffect(() => {
    const loadCustomBg = () => {
      const stored = localStorage.getItem("rzd-custom-bg")
      setCustomBg(stored || null)
    }
    loadCustomBg()
    window.addEventListener("customBgUpdated", loadCustomBg)
    return () => window.removeEventListener("customBgUpdated", loadCustomBg)
  }, [])

  // Sync users from Google Sheet on page load (once per mount)
  // After sync completes, run a full DB refresh so isDefaultPassword / position propagate
  useEffect(() => {
  const auth = localStorage.getItem("currentUser")
  if (auth) setShowAccountWarnings(true)
    if (!auth) return
    fetch("/api/sync-from-sheets")
      .then(() => {
        if (refreshCurrentUserRef.current) refreshCurrentUserRef.current()
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll global tech mode from Supabase every 10 seconds
  useEffect(() => {
    const fetchTechMode = async () => {
      try {
        const res = await fetch("/api/tech-mode")
        const data = await res.json()
        setGlobalTechMode(!!data.enabled)
      } catch {
        // Network error — keep current state
      }
    }

    fetchTechMode()
    const interval = setInterval(fetchTechMode, 10000)

    // Also listen for local tech mode toggle events from settings modal
    const handleTechModeChange = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (typeof detail?.enabled === "boolean") {
        setGlobalTechMode(detail.enabled)
      }
    }
    window.addEventListener("techModeChanged", handleTechModeChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener("techModeChanged", handleTechModeChange)
    }
  }, [])

  const getBackgroundImage = () => {
    // Custom uploaded bg takes priority
    if (customBg) return customBg
    const bg = theme.background
    if (!bg || bg.startsWith("/backgrounds/")) return DEFAULT_BACKGROUND
    return bg
  }

  const getTieColor = () => getThemeColor(theme.colorTheme)

  // Keeps a stable reference to the latest refreshFromDb so handleSectionChange
  // can call it without capturing a stale closure.
  const refreshCurrentUserRef = useRef<(() => void) | null>(null)

  const handleSectionChange = useCallback((section: string) => {
    setActiveSection(section)
    if (section === "admin" && refreshCurrentUserRef.current) {
      refreshCurrentUserRef.current()
    }
  }, [])

  useEffect(() => {
    // Initial auth check — load from localStorage, then verify in DB once
    const authData = localStorage.getItem("currentUser")
    if (!authData) {
      window.location.replace("/login")
      return
    }

    let userData: LocalUser
    try {
      userData = JSON.parse(authData)
    } catch {
      window.location.replace("/login")
      return
    }

    // Show stored data immediately — no waiting for DB
    setUser(userData)

    // Verify + refresh from DB in background (does NOT log out on network error)
    const refreshFromDb = async (currentData: LocalUser) => {
      // Dev test account lives only in localStorage — skip DB verification entirely
      if ((currentData as any).isDev === true || currentData.id === "dev-test-account") return

      try {
        const allUsers = await getAllUsers(true)
        const dbUser = allUsers.find((u) => u.id === currentData.id)

        if (!dbUser) {
          // Account was explicitly deleted — log out
          localStorage.removeItem("currentUser")
          window.location.replace("/login")
          return
        }

        if (
          dbUser.nickname !== currentData.nickname ||
          dbUser.role !== currentData.role ||
          dbUser.secondaryRole !== currentData.secondaryRole ||
          dbUser.customAvatar !== currentData.customAvatar ||
          dbUser.reportTag !== currentData.reportTag ||
          dbUser.gender !== currentData.gender ||
          dbUser.position !== currentData.position ||
          dbUser.isDefaultPassword !== currentData.isDefaultPassword ||
          dbUser.medicalCard !== currentData.medicalCard
        ) {
          const updated: LocalUser = {
            id: dbUser.id,
            nickname: dbUser.nickname,
            role: dbUser.role,
            vkAccessToken: currentData.vkAccessToken || "",
            secondaryRole: dbUser.secondaryRole,
            customAvatar: dbUser.customAvatar,
            reportTag: dbUser.reportTag,
            gender: dbUser.gender,
            position: dbUser.position,
            isDefaultPassword: dbUser.isDefaultPassword,
            medicalCard: dbUser.medicalCard,
          }
          localStorage.setItem("currentUser", JSON.stringify(updated))
          setUser(updated)
          window.dispatchEvent(new Event("userDataUpdated"))
        }
      } catch {
        // Network error — keep the user logged in, don't do anything
      }
    }

    // Expose a no-arg version so handleSectionChange can trigger it
    refreshCurrentUserRef.current = () => {
      const latest = localStorage.getItem("currentUser")
      if (latest) {
        try {
          refreshFromDb(JSON.parse(latest))
        } catch { }
      }
    }

    refreshFromDb(userData)

    const handleUserUpdate = () => {
      const latest = localStorage.getItem("currentUser")
      if (latest) {
        try {
          setUser(JSON.parse(latest))
        } catch { }
      }
    }

    window.addEventListener("userRoleUpdated", handleUserUpdate)
    window.addEventListener("userDataUpdated", handleUserUpdate)

    return () => {
      window.removeEventListener("userRoleUpdated", handleUserUpdate)
      window.removeEventListener("userDataUpdated", handleUserUpdate)
    }
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty("--scrollbar-color", getTieColor())
  }, [theme.colorTheme])

  const isTechAdmin =
    user?.role === "Тех. Администратор" ||
    user?.secondaryRole === "Тех. Администратор"



  if (!user) {
    const spinColor = getThemeColor(theme.colorTheme)
    return (
      <div
        className="flex min-h-screen items-center justify-center flex-col gap-4"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <div
          className="w-12 h-12 rounded-full border-4 animate-spin"
          style={{
            borderColor: spinColor + "30",
            borderTopColor: spinColor,
          }}
        />
        <span className="text-sm font-mono" style={{ color: spinColor + "80" }}>
          Загрузка...
        </span>
      </div>
    )
  }

  return (
    <TechModeGuard isTechAdmin={isTechAdmin} currentUserNickname={user?.nickname} techMode={globalTechMode}>
    <div className="flex min-h-screen">
      {/* Fixed background layer */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          backgroundColor: theme.mode === "dark" ? "#0a0a0a" : "#f0f0f0",
          backgroundImage: `url(${proxyImageUrl(getBackgroundImage())})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <Sidebar
        activeSection={activeSection}
          onSectionChange={handleSectionChange}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        user={user}
      />
      <main
        className={`flex-1 transition-all duration-300 ${isCollapsed ? "ml-20" : "ml-64"}`}
      >
        <div
          className={`min-h-screen ${theme.mode === "dark" ? "bg-black/70" : "bg-white/80"}`}
          style={{
            backdropFilter: `blur(${theme.blurAmount ?? 4}px)`,
            WebkitBackdropFilter: `blur(${theme.blurAmount ?? 4}px)`,
            transition: "backdrop-filter 0.4s ease, -webkit-backdrop-filter 0.4s ease",
          }}
        >
          <div className="relative p-4 space-y-3">
            <ContentSection
              activeSection={activeSection}
              onSectionChange={handleSectionChange}
              userRole={user?.role}
              userNickname={user?.nickname}
              secondaryRole={user?.secondaryRole}
            />
          </div>
          </div>
        </main>
        {showAccountWarnings && user && (() => {
          const match = user.medicalCard?.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
          const expiry = match ? new Date(Number(match[3].length === 2 ? `20${match[3]}` : match[3]), Number(match[2]) - 1, Number(match[1])) : null
          const medicalExpired = Boolean(expiry && expiry.getTime() <= Date.now())
          if (!medicalExpired && !user.isDefaultPassword) return null
          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="account-warning-title">
              <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#11161c] p-6 text-white shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="account-warning-title" className="text-xl font-semibold">Требуется внимание</h2>
                    <p className="mt-1 text-sm text-white/65">Проверьте данные аккаунта перед продолжением работы.</p>
                  </div>
                  <button type="button" onClick={() => setShowAccountWarnings(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Закрыть">×</button>
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  {medicalExpired && <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-4 text-red-200">Медицинская карта закончилась ({user.medicalCard}). Требуется её обновить.</div>}
                  {user.isDefaultPassword && <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 text-amber-100">Используется стандартный пароль. Его необходимо сменить в настройках аккаунта.</div>}
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowAccountWarnings(false)} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Закрыть</button>
                  {user.isDefaultPassword && <button type="button" onClick={() => { setShowAccountWarnings(false); window.dispatchEvent(new CustomEvent("openSettings", { detail: { tab: "account" } })) }} className="rounded-xl px-4 py-2 text-sm font-semibold text-black" style={{ backgroundColor: getTieColor() }}>Открыть настройки</button>}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </TechModeGuard>
  )
}

export function MainContent() {
  return (
    <ThemeProvider>
      <AccessProvider>
        <MainContentInner />
      </AccessProvider>
    </ThemeProvider>
  )
}
