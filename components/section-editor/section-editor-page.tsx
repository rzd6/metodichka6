"use client"

import { useState, useCallback } from "react"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import { SectionEditorCanvas } from "./section-editor-canvas"
import { SectionEditorHeader } from "./section-editor-header"
import type { CustomSection } from "@/data/custom-sections"

interface Actor {
  nickname: string
  role: string
}

interface SectionEditorPageProps {
  section: CustomSection | null  // null = создание нового
  actor: Actor
  onSave: (section: CustomSection) => Promise<void>
  onCancel: () => void
}

export function SectionEditorPage({
  section,
  actor,
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
    <div className="space-y-0">
      {/* Sticky header bar inside the content area — no extra sidebar */}
      <div
        className={`sticky top-0 z-40 border-b rounded-t-2xl ${isDark ? "border-white/10" : "border-black/10"}`}
        style={{ backgroundColor: isDark ? "rgba(10,10,10,0.95)" : "rgba(255,255,255,0.97)" }}
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

      {/* Canvas */}
      <div className="pt-4 pb-8">
        <SectionEditorCanvas
          blocks={draft.content}
          onChange={(content) => setDraft((d) => ({ ...d, content }))}
          tieColor={tieColor}
          isDark={isDark}
        />
      </div>
    </div>
  )
}
