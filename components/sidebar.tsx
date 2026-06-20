"use client"

import { Button } from "@/components/ui/button"
import {
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Crown,
  Shield,
  UsersRound,
  Train,
  Wrench,
  Terminal,
  Bell,
  FlaskConical,
} from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import { SettingsModal } from "@/components/settings-modal"
import { NotificationsModal } from "@/components/notifications-modal"
import { useTheme } from "@/contexts/theme-context"
import { useRouter } from "next/navigation"
import type { JSX } from "react"
import Image from "next/image"
import type { UserRole } from "@/data/users"
import { getEffectiveReportTag } from "@/data/users"
import {
  canAccessManagement,
  canAccessReportCompiler,
  canAccessEducationalContent,
  canAccessOrders,
  canAccessReportGeneration,
  canAccessGovWave,
  canAccessAnnouncements,
  canAccessBugReport,
} from "@/data/users"
import { getThemeColor } from "@/lib/theme-utils"
import { getAvatarFilterFromColor } from "@/lib/color-utils"
import { proxyImageUrl } from "@/lib/image-proxy"
import {
  getCustomSections,
  getBuiltinOverrides,
  toggleCustomSectionVisibility,
  type CustomSection,
  type BuiltinSectionOverride,
} from "@/data/custom-sections"
import { getIconComponent } from "@/components/section-editor/section-editor-header"

interface LocalUser {
  id: string
  nickname: string
  role: UserRole
  vkAccessToken: string
  secondaryRole?: "Тех. Администратор" | "РЖД"
  reportTag?: string
}

interface SidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
  user: LocalUser
}

const DEV_ROLES: UserRole[] = [
  "Тех. Администратор",
  "Руководство",
  "Заместитель",
  "Старший Состав",
  "ЦдУД",
  "ПТО",
]

function DevRoleSwitcher({
  currentRole,
  isCollapsed,
  tieColor,
  isDark,
}: {
  currentRole: UserRole
  isCollapsed: boolean
  tieColor: string
  isDark: boolean
}) {
  const [open, setOpen] = useState(false)

  const switchRole = (role: UserRole) => {
    setOpen(false)
    try {
      const stored = JSON.parse(localStorage.getItem("currentUser") || "{}")
      stored.role = role
      stored.isDev = true
      // When switching away from Тех. Администратор, remove secondaryRole
      // so role-based visibility checks reflect the selected role accurately.
      // When switching back to Тех. Администратор, restore it.
      if (role === "Тех. Администратор") {
        stored.secondaryRole = "Тех. Администратор"
      } else {
        delete stored.secondaryRole
      }
      localStorage.setItem("currentUser", JSON.stringify(stored))
      window.dispatchEvent(new CustomEvent("devRoleChanged", { detail: { role } }))
      // Full reload so all role-based UI recalculates cleanly
      window.location.reload()
    } catch {
      // ignore
    }
  }

  const textMuted = isDark ? "text-white/40" : "text-black/40"
  const bg = isDark ? "#1a1a1a" : "#f5f5f5"
  const border = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"

  if (isCollapsed) {
    return (
      <div className="relative flex justify-center mb-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-10 h-10 rounded-lg flex items-center justify-center border"
          style={{ borderColor: tieColor + "60", color: tieColor }}
          title="DEV: сменить роль"
        >
          <FlaskConical className="w-4 h-4" />
        </button>
        {open && (
          <div
            className="absolute bottom-12 left-0 z-50 rounded-xl shadow-xl border min-w-[160px] overflow-hidden"
            style={{ backgroundColor: bg, borderColor: border }}
          >
            <p className={`text-[10px] uppercase font-bold px-3 pt-2 pb-1 ${textMuted}`}>DEV: роль</p>
            {DEV_ROLES.map((r) => (
              <button
                key={r}
                onClick={() => switchRole(r)}
                className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-opacity"
                style={{ color: r === currentRole ? tieColor : isDark ? "#fff" : "#000", fontWeight: r === currentRole ? 700 : 400 }}
              >
                {r === currentRole ? "• " : ""}{r}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative mb-2 mx-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-opacity hover:opacity-80"
        style={{ borderColor: tieColor + "60", color: tieColor, backgroundColor: tieColor + "10" }}
      >
        <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left truncate">DEV: {currentRole}</span>
        <span className="text-[10px] opacity-60">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          className="absolute bottom-10 left-0 right-0 z-50 rounded-xl shadow-xl border overflow-hidden"
          style={{ backgroundColor: bg, borderColor: border }}
        >
          <p className={`text-[10px] uppercase font-bold px-3 pt-2 pb-1 ${textMuted}`}>Сменить роль</p>
          {DEV_ROLES.map((r) => (
            <button
              key={r}
              onClick={() => switchRole(r)}
              className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-opacity"
              style={{ color: r === currentRole ? tieColor : isDark ? "#fff" : "#000", fontWeight: r === currentRole ? 700 : 400 }}
            >
              {r === currentRole ? "• " : ""}{r}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ activeSection, onSectionChange, isCollapsed, setIsCollapsed, user }: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [customAvatar, setCustomAvatar] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [customSections, setCustomSections] = useState<CustomSection[]>([])
  const [builtinOverrides, setBuiltinOverrides] = useState<Record<string, BuiltinSectionOverride>>({})
  const { theme } = useTheme()
  const router = useRouter()

  const isTechAdmin = user.role === "Тех. Администратор" || user.secondaryRole === "Тех. Администратор"

  const [displayTag, setDisplayTag] = useState("")

  const loadCustomSections = useCallback(async () => {
    const data = await getCustomSections()
    setCustomSections(data)
  }, [])

  const loadBuiltinOverrides = useCallback(async () => {
    const data = await getBuiltinOverrides()
    setBuiltinOverrides(data)
  }, [])

  useEffect(() => {
    loadCustomSections()
    const handler = () => loadCustomSections()
    window.addEventListener("customSectionsUpdated", handler)
    return () => window.removeEventListener("customSectionsUpdated", handler)
  }, [loadCustomSections])

  useEffect(() => {
    loadBuiltinOverrides()
    const handler = () => loadBuiltinOverrides()
    window.addEventListener("builtinOverridesUpdated", handler)
    return () => window.removeEventListener("builtinOverridesUpdated", handler)
  }, [loadBuiltinOverrides])

  useEffect(() => {
    const loadAvatar = () => {
      try {
        const stored = JSON.parse(localStorage.getItem("currentUser") || "null")
        setCustomAvatar(stored?.customAvatar || stored?.custom_avatar || null)
        if (stored?.role) {
          setDisplayTag(getEffectiveReportTag(stored))
        }
      } catch {
        setCustomAvatar(null)
        setDisplayTag("")
      }
    }
    loadAvatar()
    window.addEventListener("userAvatarUpdated", loadAvatar)
    window.addEventListener("userDataUpdated", loadAvatar)
    return () => {
      window.removeEventListener("userAvatarUpdated", loadAvatar)
      window.removeEventListener("userDataUpdated", loadAvatar)
    }
  }, [])

  const getTieColor = () => getThemeColor(theme.colorTheme)

  useEffect(() => {
    document.documentElement.style.setProperty("--scrollbar-color", getTieColor())
    document.documentElement.style.setProperty(
      "--scrollbar-track",
      theme.mode === "dark" ? "#0a0a0a" : "#ffffff",
    )
  }, [theme.colorTheme, theme.mode])

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { getArticles } = await import("@/lib/supabase-rzd")
        const all = await getArticles()
        const readKey = `readArticles_${user.id || user.nickname || "guest"}`
        const readIds: string[] = JSON.parse(localStorage.getItem(readKey) || "[]")
        const visible = all.filter((a: any) => {
          if (!a.is_published || !Array.isArray(a.allowed_roles)) return false
          if (user.role === "Тех. Администратор" || user.secondaryRole === "Тех. Администратор") return true
          return a.allowed_roles.includes(user.role) || (user.secondaryRole ? a.allowed_roles.includes(user.secondaryRole) : false)
        })
        const count = visible.filter((a: any) => !readIds.includes(a.id)).length
        setUnreadCount(count)
      } catch {
        setUnreadCount(0)
      }
    }
    fetchUnread()
  }, [user.role, user.id, user.nickname])

  const getIconColor = (isActive: boolean) => {
    if (isActive) {
      return "#ffffff"
    }
    if (theme.mode === "dark") {
      return "#ffffff"
    } else {
      return "#000000"
    }
  }

  const getAvatarFilter = () => {
    return getAvatarFilterFromColor(theme.colorTheme)
  }

  const getAvatarForRole = (role: UserRole) => {
    const avatarMap: Record<UserRole, string> = {
      Руководство: "/avatars/management.png",
      Заместитель: "/avatars/senior-staff.png",
      "Старший Состав": "/avatars/senior-staff.png",
      ЦдУД: "/avatars/cdud.png",
      ПТО: "/avatars/pto.png",
      "Тех. Администратор": "/avatars/management.png",
    }
    return avatarMap[role] || "/avatars/senior-staff.png"
  }

  const sectionIcons: { [key: string]: (isActive: boolean) => JSX.Element } = {
    contents: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="7" height="7" rx="1" stroke={getIconColor(isActive)} strokeWidth="2" />
        <rect x="14" y="3" width="7" height="7" rx="1" stroke={getIconColor(isActive)} strokeWidth="2" />
        <rect x="3" y="14" width="7" height="7" rx="1" stroke={getIconColor(isActive)} strokeWidth="2" />
        <rect x="14" y="14" width="7" height="7" rx="1" stroke={getIconColor(isActive)} strokeWidth="2" />
      </svg>
    ),
    information: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M12 16v-4M12 8h.01" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    lectures: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
        />
        <path d="M8 7h8M8 11h6" stroke={getIconColor(isActive)} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    training: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6" cy="12" r="2" stroke={getIconColor(isActive)} strokeWidth="2" />
        <circle cx="18" cy="12" r="2" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M8 12h8" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <path d="M6 9v6M18 9v6" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <rect x="11" y="10" width="2" height="4" rx="1" fill={getIconColor(isActive)} />
      </svg>
    ),
    events: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M3 10h18M8 2v4M16 2v4" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <path
          d="M8 14h2M8 18h2M12 14h2M12 18h2M16 14h2M16 18h2"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
    exams: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M9 12l2 2 4-4"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    interviews: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="9" cy="7" r="4" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path
          d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M16 11h5M18.5 8.5v5" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    "retro-train": (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="6" width="16" height="12" rx="2" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M4 10h16M8 6V4M16 6V4" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="18" r="1.5" fill={getIconColor(isActive)} />
        <circle cx="16" cy="18" r="1.5" fill={getIconColor(isActive)} />
        <path d="M8 14h2M14 14h2" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    duty: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M12 6v6l4 2" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <path
          d="M16 2h4v4"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    "reports-section": (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="2" fill={getIconColor(isActive)} />
        <path
          d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
    "gov-wave": (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="2" width="16" height="20" rx="2" stroke={getIconColor(isActive)} strokeWidth="2" />
        <circle cx="12" cy="8" r="2" fill={getIconColor(isActive)} />
        <path d="M8 14h8M8 18h8" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <path
          d="M9 8c0-1.5 1-3 3-3s3 1.5 3 3"
          stroke={getIconColor(isActive)}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    reports: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3 3v18h18"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M7 16v-6M12 16V8M17 16v-9" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    orders: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 2v4M16 2v4" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <path
          d="M4 6h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
        />
        <circle cx="12" cy="14" r="3" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M12 11v6" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    "report-compiler": (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
        />
        <path d="M14 2v6h6" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M9 13h6M9 17h4" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <rect x="16" y="16" width="6" height="6" rx="1" stroke={getIconColor(isActive)} strokeWidth="1.5" />
      </svg>
    ),
    admin: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="3" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path
          d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
    "rzd-website": (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="16" height="16" rx="2" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M8 8h8M8 12h8M8 16h5" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="16" r="1.5" fill={getIconColor(isActive)} />
      </svg>
    ),
    "train-schedule": (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="7" width="20" height="11" rx="2" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M2 11h20" stroke={getIconColor(isActive)} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="20" r="1.5" fill={getIconColor(isActive)} />
        <circle cx="17" cy="20" r="1.5" fill={getIconColor(isActive)} />
        <path d="M7 18v2M17 18v2" stroke={getIconColor(isActive)} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7 7V5M12 7V4M17 7V5" stroke={getIconColor(isActive)} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    "bug-report": (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 15v-5m0-4h.01"
          stroke={getIconColor(isActive)}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    articles: (isActive) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="16" height="16" rx="2" stroke={getIconColor(isActive)} strokeWidth="2" />
        <path d="M8 8h8M8 12h8M8 16h5" stroke={getIconColor(isActive)} strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="16" r="1.5" fill={getIconColor(isActive)} />
      </svg>
    ),
  }

  const sections: { id: string; label: string }[] = []

  sections.push({ id: "contents", label: "Содержание" })
  sections.push({ id: "information", label: "Информация" })

  const sr = user.secondaryRole

  if (canAccessEducationalContent(user.role, sr)) {
    sections.push(
      { id: "lectures", label: "Лекции" },
      { id: "training", label: "Тренировки" },
      { id: "events", label: "Мероприятия" },
      { id: "exams", label: "Экзамены" },
    )
  }

  sections.push({ id: "interviews", label: "Собеседования" })
  sections.push({ id: "retro-train", label: "Ретропоезд" })
  sections.push({ id: "duty", label: "Дежурство" })

  if (canAccessOrders(user.role, sr)) {
    sections.push({ id: "orders", label: "Приказы" })
  }

  sections.push({ id: "reports-section", label: "Доклады в рацию" })

  if (canAccessGovWave(user.role, sr)) {
    sections.push({ id: "gov-wave", label: "Гос. волна" })
  }

  if (canAccessReportGeneration(user.role, sr)) {
    sections.push({ id: "report-generation", label: "Генерация отчётов" })
  }

  if (canAccessReportCompiler(user.role, sr)) {
    sections.push({ id: "report-compiler", label: "Составитель докладов" })
  }

  if (canAccessAnnouncements(user.role, sr)) {
    sections.push({ id: "rzd-website", label: "Официальные уведомления" })
  }

  if (user.role !== "ПТО") {
    sections.push({ id: "train-schedule", label: "Расписание рейсов" })
  }

  if (canAccessManagement(user.role, sr)) {
    sections.push({ id: "admin", label: "Управление" })
  }

  if (canAccessBugReport(user.role, sr)) {
    sections.push({ id: "bug-report", label: "Баг-репорт" })
  }

  const getTextColor = () => {
    return theme.mode === "dark" ? "text-white" : "text-black"
  }

  const handleOpenNotifications = async () => {
    setShowNotifications(true)
    setUnreadCount(0)
    // Persist which articles are read so count stays 0 after page reload
    try {
      const { getArticles } = await import("@/lib/supabase-rzd")
      const all = await getArticles()
      const readKey = `readArticles_${user.id || user.nickname || "guest"}`
      const ids = all.map((a: any) => a.id)
      localStorage.setItem(readKey, JSON.stringify(ids))
    } catch {
      // silent
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("currentUser")
    router.push("/login")
  }

  const getRoleBadgeIcon = (role: UserRole) => {
    const iconSize = "w-3 h-3"
    const color = getTieColor()

    switch (role) {
      case "Руководство":
        return <Crown className={iconSize} style={{ color }} />
      case "Заместитель":
        return <Shield className={iconSize} style={{ color }} />
      case "Старший Состав":
        return <UsersRound className={iconSize} style={{ color }} />
      case "ЦдУД":
        return <Train className={iconSize} style={{ color }} />
      case "ПТО":
        return <Wrench className={iconSize} style={{ color }} />
      case "Тех. Администратор":
        return <Terminal className={iconSize} style={{ color }} />
      default:
        return null
    }
  }

  return (
    <>
      <aside
        className={`fixed left-0 top-0 h-screen border-r ${theme.mode === "dark" ? "border-white/10" : "border-black/10"
          } p-4 transition-all duration-300 z-50 overflow-hidden ${isCollapsed ? "w-20" : "w-64"}`}
        style={{
          backgroundColor: theme.mode === "dark" ? "#0a0a0a" : "#ffffff",
        }}
      >
        <div className="flex flex-col h-full">
          <div className="mb-6">
            {!isCollapsed && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 flex-shrink-0 flex items-center justify-center overflow-hidden rounded-full border-2"
                    style={{ borderColor: getTieColor() }}
                  >
                    <Image
                      src={proxyImageUrl(customAvatar || getAvatarForRole(user.role) || "/placeholder.svg")}
                      alt="Avatar"
                      width={48}
                      height={48}
                      className="w-full h-full object-cover object-center scale-110"
                      style={customAvatar ? undefined : { filter: getAvatarFilter() }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = getAvatarForRole(user.role) || "/placeholder.svg" }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center">
                    <h2 className="text-lg font-bold truncate" style={{ color: getTieColor() }}>
                      {user.role}
                    </h2>
                  </div>
                </div>
                <div className="w-full h-px bg-white/20 mb-2" />
                <div className="mb-2">
                  <p className={`text-xs ${theme.mode === "dark" ? "text-white/50" : "text-gray-400"} mb-1`}>
                    {user.nickname}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {getRoleBadgeIcon(user.role)}
                    <span className="text-xs truncate" style={{ color: getTieColor() }}>
                      {displayTag || user.role}
                    </span>
                  </div>
                </div>
              </>
            )}
            {isCollapsed && (
              <div
                className="w-12 h-12 flex items-center justify-center mx-auto overflow-hidden rounded-full border-2"
                style={{ borderColor: getTieColor() }}
              >
                <Image
                  src={proxyImageUrl(customAvatar || getAvatarForRole(user.role) || "/placeholder.svg")}
                  alt="Avatar"
                  width={48}
                  height={48}
                  className="w-full h-full object-cover object-center scale-110"
                  style={customAvatar ? undefined : { filter: getAvatarFilter() }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = getAvatarForRole(user.role) || "/placeholder.svg" }}
                />
              </div>
            )}
          </div>

          <nav className={`space-y-1 flex-1 overflow-y-auto overflow-x-hidden ${isCollapsed ? "scrollbar-hide" : "pr-2"}`}>
            {sections.map((section) => {
              const ov = builtinOverrides[section.id]
              const displayLabel = ov?.title ?? section.label
              const isActive = activeSection === section.id
              const CustomIconComp = ov?.icon ? getIconComponent(ov.icon) : null
              return (
                <Button
                  key={section.id}
                  variant="ghost"
                  className={`w-full ${isCollapsed ? "justify-center px-2 h-10" : "justify-start h-9"} ${isActive ? "text-white" : getTextColor()} hover:bg-white/10`}
                  style={
                    isActive
                      ? { backgroundColor: getTieColor(), borderColor: getTieColor() }
                      : { backgroundColor: "transparent" }
                  }
                  onClick={() => onSectionChange(section.id)}
                  title={isCollapsed ? displayLabel : undefined}
                >
                  <span className="flex items-center justify-center w-5 h-5 flex-shrink-0">
                    {CustomIconComp
                      ? <CustomIconComp className="w-5 h-5" style={{ color: getIconColor(isActive) }} />
                      : sectionIcons[section.id]?.(isActive)
                    }
                  </span>
                  {!isCollapsed && <span className="ml-2 text-sm truncate">{displayLabel}</span>}
                </Button>
              )
            })}

            {/* Custom sections */}
            {customSections
              .filter((cs) => !cs.is_hidden || isTechAdmin)
              .map((cs) => {
                const IconComp = getIconComponent(cs.icon)
                const isActive = activeSection === cs.id
                const iconColor = isActive ? "#ffffff" : theme.mode === "dark" ? "#ffffff" : "#000000"
                return (
                  <div key={cs.id} className={`relative group flex items-center min-w-0`}>
                    <Button
                      variant="ghost"
                      className={`flex-1 min-w-0 ${isCollapsed ? "justify-center px-2 h-10" : "justify-start h-9"} ${isActive ? "text-white" : getTextColor()} hover:bg-white/10`}
                      style={isActive ? { backgroundColor: getTieColor() } : { backgroundColor: "transparent" }}
                      onClick={() => onSectionChange(cs.id)}
                      title={cs.title}
                    >
                      <span className="flex items-center justify-center w-5 h-5 flex-shrink-0">
                        <IconComp className="w-5 h-5" style={{ color: iconColor }} />
                      </span>
                      {!isCollapsed && (
                        <span className={`ml-2 text-sm truncate min-w-0 ${cs.is_hidden ? "opacity-50 italic" : ""}`}>
                          {cs.title}
                          {cs.is_hidden && " (скрыт)"}
                        </span>
                      )}
                    </Button>
                    {/* Visibility toggle for tech admins, only in expanded mode */}
                    {isTechAdmin && !isCollapsed && (
                      <button
                        className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10"
                        title={cs.is_hidden ? "Сделать видимым" : "Скрыть раздел"}
                        onClick={async (e) => {
                          e.stopPropagation()
                          await toggleCustomSectionVisibility(cs.id, !cs.is_hidden, { nickname: user.nickname, role: user.role }, cs.title)
                          loadCustomSections()
                          window.dispatchEvent(new Event("customSectionsUpdated"))
                        }}
                      >
                        {cs.is_hidden
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={getTieColor()} strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.mode === "dark" ? "#ffffff80" : "#00000060"} strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        }
                      </button>
                    )}
                  </div>
                )
              })}
          </nav>

          {/* Dev role switcher — visible only to the hidden test account */}
          {user.id === "dev-test-account" && (
            <DevRoleSwitcher
              currentRole={user.role}
              isCollapsed={isCollapsed}
              tieColor={getTieColor()}
              isDark={theme.mode === "dark"}
            />
          )}

          <div className={`mt-auto pt-4 mb-2 ${isCollapsed ? "space-y-2" : "space-y-2"}`}>
            {!isCollapsed ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className={`flex-1 relative bg-transparent ${getTextColor()} hover:${getTextColor()} border-white/20 hover:border-white/40 h-9 px-2`}
                  onClick={handleOpenNotifications}
                  title="Уведомления"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className={`flex-1 bg-transparent ${getTextColor()} hover:${getTextColor()} border-white/20 hover:border-white/40 h-9 px-2`}
                  onClick={() => setShowSettings(true)}
                  title="Настройки"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  className={`w-10 h-10 mx-auto p-0 relative flex items-center justify-center bg-transparent ${getTextColor()} hover:${getTextColor()} border-white/20 hover:border-white/40`}
                  onClick={handleOpenNotifications}
                  title="Уведомления"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className={`w-10 h-10 mx-auto p-0 flex items-center justify-center bg-transparent ${getTextColor()} hover:${getTextColor()} border-white/20 hover:border-white/40`}
                  onClick={() => setShowSettings(true)}
                  title="Настройки"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </>
            )}

            {!isCollapsed ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className={`flex-1 bg-transparent ${getTextColor()} hover:${getTextColor()} border-white/20 hover:border-white/40 h-9 px-2`}
                  onClick={handleLogout}
                  title="Выйти"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className={`flex-1 bg-transparent ${getTextColor()} hover:${getTextColor()} border-white/20 hover:border-white/40 h-9 px-2`}
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  title="Свернуть"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  className={`w-10 h-10 mx-auto p-0 flex items-center justify-center bg-transparent ${getTextColor()} hover:${getTextColor()} border-white/20 hover:border-white/40`}
                  onClick={handleLogout}
                  title="Выйти"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className={`w-10 h-10 mx-auto p-0 flex items-center justify-center bg-transparent ${getTextColor()} hover:${getTextColor()} border-white/20 hover:border-white/40`}
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  title="Развернуть"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </aside>

      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
      <NotificationsModal open={showNotifications} onOpenChange={setShowNotifications} userRole={user.role} secondaryRole={user.secondaryRole} />
    </>
  )
}
