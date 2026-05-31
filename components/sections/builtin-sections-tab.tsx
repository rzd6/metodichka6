"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Edit, RotateCcw, Save, X, ChevronDown,
} from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import {
  getBuiltinOverrides,
  upsertBuiltinOverride,
  resetBuiltinOverride,
  type BuiltinSectionOverride,
} from "@/data/custom-sections"
import { getIconComponent, ICON_OPTIONS } from "@/components/section-editor/section-editor-header"
import type { UserRole } from "@/data/roles"

const BUILTIN_SECTIONS: { id: string; defaultTitle: string }[] = [
  { id: "contents",          defaultTitle: "Содержание" },
  { id: "information",       defaultTitle: "Информация" },
  { id: "lectures",          defaultTitle: "Лекции" },
  { id: "training",          defaultTitle: "Тренировки" },
  { id: "events",            defaultTitle: "Мероприятия" },
  { id: "exams",             defaultTitle: "Экзамены" },
  { id: "interviews",        defaultTitle: "Собеседования" },
  { id: "retro-train",       defaultTitle: "Ретропоезд" },
  { id: "duty",              defaultTitle: "Дежурство" },
  { id: "orders",            defaultTitle: "Приказы" },
  { id: "reports-section",   defaultTitle: "Доклады в рацию" },
  { id: "gov-wave",          defaultTitle: "Гос. волна" },
  { id: "report-generation", defaultTitle: "Генерация отчётов" },
  { id: "report-compiler",   defaultTitle: "Составитель докладов" },
  { id: "rzd-website",       defaultTitle: "Официальные уведомления" },
  { id: "train-schedule",    defaultTitle: "Расписание рейсов" },
]

interface Props {
  currentUser: { nickname: string; role: UserRole }
}

export function BuiltinSectionsTab({ currentUser }: Props) {
  const { theme } = useTheme()
  const tieColor = getThemeColor(theme.colorTheme)
  const isDark = theme.mode === "dark"

  const [overrides, setOverrides] = useState<Record<string, BuiltinSectionOverride>>({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editIcon, setEditIcon] = useState<string | undefined>(undefined)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const border = isDark ? "border-white/10" : "border-black/10"
  const cardBg = isDark ? "bg-[#0f1419]/50" : "bg-white"
  const textMuted = isDark ? "text-white/50" : "text-black/40"
  const inputCls = `rounded-lg border px-3 py-2 text-sm bg-transparent outline-none transition-colors ${isDark ? "border-white/10 text-white placeholder:text-white/30 focus:border-white/30" : "border-black/10 text-black placeholder:text-black/30 focus:border-black/30"}`
  const hoverBg = isDark ? "hover:bg-white/5" : "hover:bg-black/5"

  const actor = { nickname: currentUser.nickname, role: currentUser.role }

  useEffect(() => {
    getBuiltinOverrides().then((data) => { setOverrides(data); setLoading(false) })
  }, [])

  const startEdit = (section: { id: string; defaultTitle: string }) => {
    const ov = overrides[section.id]
    setEditingId(section.id)
    setEditTitle(ov?.title ?? section.defaultTitle)
    setEditIcon(ov?.icon ?? undefined)
    setIconPickerOpen(false)
  }

  const cancelEdit = () => { setEditingId(null); setIconPickerOpen(false) }

  const handleSave = async (section: { id: string; defaultTitle: string }) => {
    setSaving(true)
    const titleChanged = editTitle.trim() !== section.defaultTitle
    const iconChanged = !!editIcon
    await upsertBuiltinOverride(section.id, {
      title: titleChanged ? editTitle.trim() : undefined,
      icon: iconChanged ? editIcon : undefined,
    }, actor)
    const updated = await getBuiltinOverrides()
    setOverrides(updated)
    window.dispatchEvent(new Event("builtinOverridesUpdated"))
    setEditingId(null)
    setSaving(false)
  }

  const handleReset = async (section: { id: string; defaultTitle: string }) => {
    setSaving(true)
    await resetBuiltinOverride(section.id, section.defaultTitle, actor)
    const updated = await getBuiltinOverrides()
    setOverrides(updated)
    window.dispatchEvent(new Event("builtinOverridesUpdated"))
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? "bg-white/5" : "bg-gray-100"}`} style={{ opacity: 1 - i * 0.2 }} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className={`text-xs ${textMuted} pb-1`}>
        Здесь можно переименовать встроенные разделы и сменить иконку в боковом меню. Откат возвращает название и иконку к оригинальным.
      </p>

      <div className="space-y-2">
        {BUILTIN_SECTIONS.map((section) => {
          const ov = overrides[section.id]
          const displayTitle = ov?.title ?? section.defaultTitle
          const hasOverride = !!(ov?.title || ov?.icon)
          const isEditing = editingId === section.id

          if (isEditing) {
            const CurrentEditIcon = editIcon ? getIconComponent(editIcon) : null
            return (
              <div key={section.id} className={`rounded-2xl border ${border} ${cardBg} p-3 space-y-3`}>
                <div className="flex items-center gap-2">
                  {/* Icon picker */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setIconPickerOpen((v) => !v)}
                      className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border ${border} ${hoverBg} transition-colors`}
                      title="Выбрать иконку"
                    >
                      {CurrentEditIcon
                        ? <CurrentEditIcon className="w-4 h-4" style={{ color: tieColor }} />
                        : <span className={`text-xs ${textMuted}`}>Икон.</span>
                      }
                      <ChevronDown className={`w-3 h-3 ${textMuted}`} />
                    </button>
                    {iconPickerOpen && (
                      <div
                        className={`absolute top-full left-0 mt-1 z-50 rounded-xl border ${border} shadow-2xl p-2`}
                        style={{ backgroundColor: isDark ? "#111" : "#fff", width: 300 }}
                      >
                        <div className="grid grid-cols-9 gap-1">
                          {ICON_OPTIONS.map(({ name, component: Ic }) => (
                            <button
                              key={name}
                              onClick={() => { setEditIcon(name); setIconPickerOpen(false) }}
                              className={`p-2 rounded-lg ${hoverBg} transition-colors`}
                              style={editIcon === name ? { outline: `2px solid ${tieColor}`, outlineOffset: 1 } : undefined}
                              title={name}
                            >
                              <Ic className="w-4 h-4" style={{ color: editIcon === name ? tieColor : isDark ? "#aaa" : "#555" }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className={`flex-1 ${inputCls} border-0 px-0 text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0`}
                    placeholder={section.defaultTitle}
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-2">
                  <p className={`text-xs ${textMuted} flex-1`}>Оригинал: {section.defaultTitle}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelEdit}
                    className={`h-7 px-2 text-xs ${isDark ? "border-white/10 text-white bg-transparent hover:bg-white/5" : "border-black/10 text-black bg-transparent hover:bg-black/5"}`}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Отмена
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSave(section)}
                    disabled={saving || !editTitle.trim()}
                    className="h-7 px-3 text-xs text-white font-semibold"
                    style={{ backgroundColor: tieColor }}
                  >
                    <Save className="w-3 h-3 mr-1" />
                    {saving ? "..." : "Сохранить"}
                  </Button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={section.id}
              className={`rounded-2xl border ${border} ${cardBg} px-3 py-2.5 flex items-center gap-3`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold truncate ${isDark ? "text-white" : "text-black"}`}>
                    {displayTitle}
                  </span>
                  {hasOverride && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium"
                      style={{ backgroundColor: tieColor + "20", color: tieColor }}>
                      изменён
                    </span>
                  )}
                </div>
                {hasOverride && (
                  <p className={`text-xs ${textMuted} mt-0.5`}>Оригинал: {section.defaultTitle}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {hasOverride && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReset(section)}
                    disabled={saving}
                    title="Сбросить к оригиналу"
                    className={`h-7 w-7 p-0 ${isDark ? "border-white/10 bg-transparent hover:bg-white/5" : "border-black/10 bg-transparent hover:bg-black/5"}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" style={{ color: isDark ? "#fff" : "#000" }} />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEdit(section)}
                  className={`h-7 w-7 p-0 ${isDark ? "border-white/10 bg-transparent hover:bg-white/5" : "border-black/10 bg-transparent hover:bg-black/5"}`}
                >
                  <Edit className="w-3.5 h-3.5" style={{ color: tieColor }} />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
