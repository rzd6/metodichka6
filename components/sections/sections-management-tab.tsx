"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Plus, Edit, Trash2, Eye, EyeOff, RefreshCw,
  Layers, AlertCircle,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import {
  getCustomSections,
  createCustomSection,
  updateCustomSection,
  deleteCustomSection,
  toggleCustomSectionVisibility,
  type CustomSection,
} from "@/data/custom-sections"
import { getIconComponent } from "@/components/section-editor/section-editor-header"
import { SectionEditorPage } from "@/components/section-editor/section-editor-page"
import type { UserRole } from "@/data/roles"

interface SidebarUser {
  id: string
  nickname: string
  role: UserRole
  vkAccessToken: string
  secondaryRole?: "Тех. Администратор" | "РЖД"
  reportTag?: string
}

interface Props {
  currentUser: SidebarUser
  isCollapsed: boolean
  setIsCollapsed: (v: boolean) => void
}

export function SectionsManagementTab({ currentUser, isCollapsed, setIsCollapsed }: Props) {
  const { theme } = useTheme()
  const tieColor = getThemeColor(theme.colorTheme)
  const isDark = theme.mode === "dark"

  const [sections, setSections] = useState<CustomSection[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editorTarget, setEditorTarget] = useState<CustomSection | null | undefined>(undefined) // undefined = closed, null = new
  const [deleteTarget, setDeleteTarget] = useState<CustomSection | null>(null)

  const border = isDark ? "border-white/10" : "border-black/10"
  const cardBg = isDark ? "bg-[#0f1419]/50" : "bg-white"
  const textMuted = isDark ? "text-white/50" : "text-black/40"

  const actor = { nickname: currentUser.nickname, role: currentUser.role }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    const data = await getCustomSections()
    setSections(data)
    if (!silent) setLoading(false); else setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (draft: CustomSection) => {
    const isNew = !sections.find((s) => s.id === draft.id)
    if (isNew) {
      await createCustomSection(draft, actor)
    } else {
      const old = sections.find((s) => s.id === draft.id)
      await updateCustomSection(draft.id, {
        title: draft.title,
        icon: draft.icon,
        content: draft.content,
        hidden_from_roles: draft.hidden_from_roles,
        is_hidden: draft.is_hidden,
        section_order: draft.section_order,
      }, actor, old)
    }
    await load(true)
    setEditorTarget(undefined)
    window.dispatchEvent(new Event("customSectionsUpdated"))
  }

  const handleToggleVisibility = async (section: CustomSection) => {
    await toggleCustomSectionVisibility(section.id, !section.is_hidden, actor, section.title)
    await load(true)
    window.dispatchEvent(new Event("customSectionsUpdated"))
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteCustomSection(deleteTarget.id, actor, deleteTarget.title)
    setDeleteTarget(null)
    await load(true)
    window.dispatchEvent(new Event("customSectionsUpdated"))
  }

  // Editor overlay
  if (editorTarget !== undefined) {
    return (
      <SectionEditorPage
        section={editorTarget}
        sidebarUser={currentUser}
        actor={actor}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        onSave={handleSave}
        onCancel={() => setEditorTarget(undefined)}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: tieColor + "40" }}>
        <div className="p-3 rounded-xl" style={{ background: `linear-gradient(135deg, ${tieColor}20, ${tieColor}10)` }}>
          <Layers className="w-6 h-6" style={{ color: tieColor }} />
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-bold" style={{ color: tieColor }}>Управление разделами</h2>
          <p className={`text-sm ${textMuted}`}>Создание, редактирование и видимость разделов</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}
            className={`h-8 px-3 text-xs ${isDark ? "border-white/10 bg-transparent text-white hover:bg-white/5" : "border-gray-200 bg-transparent text-black hover:bg-gray-50"}`}>
            <RefreshCw className={`w-3 h-3 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Обновить
          </Button>
          <Button size="sm" onClick={() => setEditorTarget(null)}
            className="h-8 px-3 text-xs text-white font-semibold"
            style={{ backgroundColor: tieColor }}>
            <Plus className="w-3 h-3 mr-1.5" />
            Создать раздел
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-16 rounded-xl animate-pulse ${isDark ? "bg-white/5" : "bg-gray-100"}`} style={{ opacity: 1 - i * 0.2 }} />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className={`rounded-2xl border-2 border-dashed ${border} p-12 text-center ${textMuted}`}>
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Нет созданных разделов</p>
          <p className="text-xs mt-1">Нажмите &quot;Создать раздел&quot; чтобы добавить первый</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sections.map((section) => {
            const IconComp = getIconComponent(section.icon)
            return (
              <div
                key={section.id}
                className={`rounded-2xl border ${border} ${cardBg} p-3 flex items-center gap-3`}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${tieColor}18` }}>
                  <IconComp className="w-5 h-5" style={{ color: tieColor }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold truncate ${isDark ? "text-white" : "text-black"}`}>
                      {section.title}
                    </span>
                    {section.is_hidden && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${isDark ? "bg-white/10 text-white/50" : "bg-black/5 text-black/40"}`}>
                        Скрыт
                      </span>
                    )}
                  </div>
                  <div className={`text-xs ${textMuted} flex items-center gap-3 mt-0.5`}>
                    <span>Создал: {section.created_by}</span>
                    <span>{new Date(section.created_at).toLocaleDateString("ru-RU")}</span>
                    <span>{section.content.length} блок{section.content.length === 1 ? "" : section.content.length < 5 ? "а" : "ов"}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => handleToggleVisibility(section)}
                    title={section.is_hidden ? "Сделать видимым" : "Скрыть"}
                    className={`h-8 w-8 p-0 ${isDark ? "border-white/10 bg-transparent hover:bg-white/5" : "border-black/10 bg-transparent hover:bg-black/5"}`}
                  >
                    {section.is_hidden
                      ? <Eye className="w-4 h-4" style={{ color: tieColor }} />
                      : <EyeOff className="w-4 h-4" style={{ color: isDark ? "#fff" : "#000" }} />
                    }
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setEditorTarget(section)}
                    className={`h-8 w-8 p-0 ${isDark ? "border-white/10 bg-transparent hover:bg-white/5" : "border-black/10 bg-transparent hover:bg-black/5"}`}
                  >
                    <Edit className="w-4 h-4" style={{ color: tieColor }} />
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setDeleteTarget(section)}
                    className="h-8 w-8 p-0 border-red-500/30 bg-transparent hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Info card */}
      <div className={`rounded-xl border ${border} p-3 flex gap-2`} style={{ backgroundColor: tieColor + "0d" }}>
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: tieColor }} />
        <p className={`text-xs leading-relaxed ${textMuted}`}>
          Новые разделы по умолчанию <strong style={{ color: tieColor }}>скрыты</strong> и видны только тех. администраторам. Сделайте раздел видимым через иконку глаза или в настройках доступа раздела.
        </p>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent style={{ backgroundColor: isDark ? "#111" : "#fff", borderColor: isDark ? "#333" : "#e5e7eb" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className={isDark ? "text-white" : "text-black"}>Удалить раздел?</AlertDialogTitle>
            <AlertDialogDescription className={textMuted}>
              Раздел <strong>&quot;{deleteTarget?.title}&quot;</strong> будет удалён без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={isDark ? "border-white/10 text-white bg-transparent hover:bg-white/5" : ""}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
