"use client"

import { useState, useCallback } from "react"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import { Sidebar } from "@/components/sidebar"
import { SectionEditorCanvas } from "./section-editor-canvas"
import { SectionEditorHeader } from "./section-editor-header"
import type { CustomSection } from "@/data/custom-sections"
import type { UserRole } from "@/data/roles"

interface Actor {
  nickname: string
  role: string
}

interface SidebarUser {
  id: string
  nickname: string
  role: UserRole
  vkAccessToken: string
  secondaryRole?: "Тех. Администратор" | "РЖД"
  reportTag?: string
}

interface SectionEditorPageProps {
  section: CustomSection | null  // null = создание нового
  sidebarUser: SidebarUser
  actor: Actor
  isCollapsed: boolean
  setIsCollapsed: (v: boolean) => void
  onSave: (section: CustomSection) => Promise<void>
  onCancel: () => void
}

export function SectionEditorPage({
  section,
  sidebarUser,
  actor,
  isCollapsed,
  setIsCollapsed,
  onSave,
  onCancel,
}: SectionEditorPageProps) {
  const { theme } = useTheme()
  const tieColor = getThemeColor(theme.colorTheme)
  const isDark = theme.mode === "dark"

  const [draft, setDraft] = useState<CustomSection>(() => {
    if (section) return { ...section, content: [...section.content] }
    return {
      id: `custom-${Date.now()}`,
      title: "Новый раздел",
      icon: "FileText",
      content: [],
      hidden_from_roles: [],
      is_hidden: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: actor.nickname,
      updated_by: actor.nickname,
      section_order: 0,
    }
  })

  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }, [draft, onSave])

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Sidebar
        activeSection="__editor__"
        onSectionChange={() => {}}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        user={sidebarUser}
      />

      {/* Main editor area */}
      <main
        className={`flex-1 flex flex-col transition-all duration-300 ${isCollapsed ? "ml-20" : "ml-64"}`}
      >
        {/* Editor header bar */}
        <div
          className={`sticky top-0 z-40 border-b ${isDark ? "border-white/10" : "border-black/10"}`}
          style={{ backgroundColor: isDark ? "#0a0a0a" : "#ffffff" }}
        >
          <SectionEditorHeader
            draft={draft}
            onDraftChange={setDraft}
            onSave={handleSave}
            onCancel={onCancel}
            saving={saving}
            isNew={!section}
            tieColor={tieColor}
            isDark={isDark}
          />
        </div>

        {/* Editor canvas */}
        <div
          className={`flex-1 ${isDark ? "bg-black/70" : "bg-white/80"}`}
          style={{
            backdropFilter: `blur(${theme.blurAmount ?? 4}px)`,
            WebkitBackdropFilter: `blur(${theme.blurAmount ?? 4}px)`,
          }}
        >
          <div className="p-6 max-w-4xl mx-auto">
            <SectionEditorCanvas
              blocks={draft.content}
              onChange={(content) => setDraft((d) => ({ ...d, content }))}
              tieColor={tieColor}
              isDark={isDark}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
