"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Edit, RotateCcw, Save, X, ChevronDown, Plus, Trash2, GripVertical, ChevronRight,
} from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import {
  getBuiltinOverrides,
  upsertBuiltinOverride,
  resetBuiltinOverride,
  upsertBuiltinContent,
  resetBuiltinContent,
  type BuiltinSectionOverride,
} from "@/data/custom-sections"
import { contentData } from "@/data/content"
import { getIconComponent, ICON_OPTIONS } from "@/components/section-editor/section-editor-header"
import type { UserRole } from "@/data/roles"

const BUILTIN_SECTIONS: { id: string; defaultTitle: string; hasContent?: boolean }[] = [
  { id: "contents",          defaultTitle: "Содержание" },
  { id: "information",       defaultTitle: "Информация" },
  { id: "lectures",          defaultTitle: "Лекции",        hasContent: true },
  { id: "training",          defaultTitle: "Тренировки",    hasContent: true },
  { id: "events",            defaultTitle: "Мероприятия" },
  { id: "exams",             defaultTitle: "Экзамены",      hasContent: true },
  { id: "interviews",        defaultTitle: "Собеседования", hasContent: true },
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

// Map section id to its static content from content.ts
function getStaticContent(sectionId: string): { main?: any[]; additional?: any[] } | null {
  if (sectionId === "lectures") return { main: contentData.lectures.main, additional: contentData.lectures.additional }
  // training may be a flat array
  if (sectionId === "training") {
    const t = (contentData as any).training
    if (Array.isArray(t)) return { main: t }
    return { main: t?.main ?? [], additional: t?.additional ?? [] }
  }
  if (sectionId === "exams") return { main: (contentData as any).exams?.theoretical ?? [], additional: (contentData as any).exams?.practical ?? [] }
  if (sectionId === "interviews") return { main: (contentData as any).interviews ?? [] }
  return null
}

interface Props {
  currentUser: { nickname: string; role: UserRole }
}

type TabType = "appearance" | "content"

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

  // Content editing state
  const [contentEditingId, setContentEditingId] = useState<string | null>(null)
  const [contentEditTab, setContentEditTab] = useState<"main" | "additional">("main")
  const [editedLectures, setEditedLectures] = useState<any[]>([])
  const [editedLecturesAdd, setEditedLecturesAdd] = useState<any[]>([])
  const [expandedLecture, setExpandedLecture] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<TabType>("appearance")

  const border = isDark ? "border-white/10" : "border-black/10"
  const cardBg = isDark ? "bg-[#0f1419]/50" : "bg-white"
  const textMuted = isDark ? "text-white/50" : "text-black/40"
  const inputCls = `rounded-lg border px-3 py-2 text-sm bg-transparent outline-none transition-colors ${isDark ? "border-white/10 text-white placeholder:text-white/30 focus:border-white/30" : "border-black/10 text-black placeholder:text-black/30 focus:border-black/30"}`
  const hoverBg = isDark ? "hover:bg-white/5" : "hover:bg-black/5"

  const actor = { nickname: currentUser.nickname, role: currentUser.role }

  const reload = async () => {
    const data = await getBuiltinOverrides()
    setOverrides(data)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  // ── Appearance editing ──────────────────────────────────────────────────────
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
    await reload()
    window.dispatchEvent(new Event("builtinOverridesUpdated"))
    setEditingId(null)
    setSaving(false)
  }

  const handleReset = async (section: { id: string; defaultTitle: string }) => {
    setSaving(true)
    await resetBuiltinOverride(section.id, section.defaultTitle, actor)
    await reload()
    window.dispatchEvent(new Event("builtinOverridesUpdated"))
    setSaving(false)
  }

  // ── Content editing ─────────────────────────────────────────────────────────
  const startContentEdit = (section: { id: string }) => {
    const staticContent = getStaticContent(section.id)
    if (!staticContent) return
    const ov = overrides[section.id]
    const mainData = ov?.content_override?.main ?? staticContent.main ?? []
    const addData = ov?.content_override?.additional ?? staticContent.additional ?? []
    // Deep clone
    setEditedLectures(JSON.parse(JSON.stringify(mainData)))
    setEditedLecturesAdd(JSON.parse(JSON.stringify(addData)))
    setContentEditingId(section.id)
    setContentEditTab("main")
    setExpandedLecture(null)
  }

  const cancelContentEdit = () => { setContentEditingId(null) }

  const getCurrentList = () => contentEditTab === "main" ? editedLectures : editedLecturesAdd
  const setCurrentList = (list: any[]) => {
    if (contentEditTab === "main") setEditedLectures(list)
    else setEditedLecturesAdd(list)
  }

  const handleContentSave = async () => {
    if (!contentEditingId) return
    setSaving(true)
    const staticContent = getStaticContent(contentEditingId)
    const contentOverride: any = {}
    if (staticContent?.main !== undefined) contentOverride.main = editedLectures
    if (staticContent?.additional !== undefined) contentOverride.additional = editedLecturesAdd
    await upsertBuiltinContent(contentEditingId, contentOverride, actor)
    await reload()
    window.dispatchEvent(new Event("builtinOverridesUpdated"))
    setContentEditingId(null)
    setSaving(false)
  }

  const handleContentReset = async (sectionId: string) => {
    setSaving(true)
    await resetBuiltinContent(sectionId, actor)
    await reload()
    window.dispatchEvent(new Event("builtinOverridesUpdated"))
    setSaving(false)
  }

  // Helpers for line editing inside a lecture
  const updateLine = (lectureIdx: number, lineIdx: number, val: string) => {
    const list = [...getCurrentList()]
    list[lectureIdx] = { ...list[lectureIdx], content: list[lectureIdx].content.map((l: string, i: number) => i === lineIdx ? val : l) }
    setCurrentList(list)
  }
  const addLine = (lectureIdx: number) => {
    const list = [...getCurrentList()]
    list[lectureIdx] = { ...list[lectureIdx], content: [...list[lectureIdx].content, ""] }
    setCurrentList(list)
  }
  const removeLine = (lectureIdx: number, lineIdx: number) => {
    const list = [...getCurrentList()]
    list[lectureIdx] = { ...list[lectureIdx], content: list[lectureIdx].content.filter((_: any, i: number) => i !== lineIdx) }
    setCurrentList(list)
  }
  const updateLectureTitle = (lectureIdx: number, val: string) => {
    const list = [...getCurrentList()]
    list[lectureIdx] = { ...list[lectureIdx], title: val }
    setCurrentList(list)
  }
  const addLecture = () => {
    const list = getCurrentList()
    const newId = `lec-${Date.now()}`
    setCurrentList([...list, { id: newId, title: "Новая лекция", number: list.length + 1, content: [""] }])
    setExpandedLecture(newId)
  }
  const removeLecture = (lectureIdx: number) => {
    setCurrentList(getCurrentList().filter((_: any, i: number) => i !== lectureIdx))
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

  // ── Content editor view ────────────────────────────────────────────────────
  if (contentEditingId) {
    const section = BUILTIN_SECTIONS.find((s) => s.id === contentEditingId)!
    const staticContent = getStaticContent(contentEditingId)!
    const hasAdditional = (staticContent.additional?.length ?? 0) > 0 || contentEditingId === "lectures" || contentEditingId === "training"
    const displayList = getCurrentList()
    const hasOverride = !!overrides[contentEditingId]?.content_override

    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button onClick={cancelContentEdit} className={`p-1.5 rounded-lg ${hoverBg} transition-colors`}>
            <X className="w-4 h-4" style={{ color: tieColor }} />
          </button>
          <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}>
            Контент: {section.defaultTitle}
          </span>
          {hasOverride && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto"
              style={{ backgroundColor: tieColor + "20", color: tieColor }}>изменён</span>
          )}
        </div>

        {/* Category tabs */}
        {hasAdditional && (
          <div className={`flex gap-1 p-1 rounded-xl border ${border}`} style={{ backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}>
            {(["main", "additional"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setContentEditTab(tab)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors`}
                style={contentEditTab === tab ? { backgroundColor: tieColor, color: "#fff" } : { color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)" }}
              >
                {tab === "main" ? "Основные" : "Дополнительные"}
              </button>
            ))}
          </div>
        )}

        {/* Lectures list */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {displayList.map((lecture: any, lectureIdx: number) => {
            const isOpen = expandedLecture === lecture.id
            return (
              <div key={lecture.id} className={`rounded-xl border ${border} overflow-hidden`}>
                {/* Lecture header */}
                <div
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer`}
                  style={{ backgroundColor: isOpen ? tieColor + "12" : isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}
                  onClick={() => setExpandedLecture(isOpen ? null : lecture.id)}
                >
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 transition-transform" style={{ color: tieColor, transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }} />
                  <span className={`text-xs font-semibold flex-1 truncate ${isDark ? "text-white" : "text-black"}`}>
                    {lecture.title || "Без названия"}
                    <span className={`ml-2 font-normal ${textMuted}`}>({lecture.content?.length ?? 0} строк)</span>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeLecture(lectureIdx) }}
                    className="p-1 rounded hover:bg-red-500/20 flex-shrink-0"
                    title="Удалить лекцию"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                </div>

                {/* Lecture content */}
                {isOpen && (
                  <div className={`p-3 space-y-2 border-t ${border}`}>
                    {/* Title edit */}
                    <div>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${textMuted}`}>Название</p>
                      <input
                        className={inputCls}
                        value={lecture.title}
                        onChange={(e) => updateLectureTitle(lectureIdx, e.target.value)}
                        placeholder="Название лекции..."
                      />
                    </div>

                    {/* Lines */}
                    <div>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${textMuted}`}>Строки ({lecture.content?.length ?? 0})</p>
                      <div className="space-y-1.5">
                        {(lecture.content ?? []).map((line: string, lineIdx: number) => (
                          <div key={lineIdx} className="flex items-start gap-1.5">
                            <GripVertical className={`w-3.5 h-3.5 mt-2.5 flex-shrink-0 ${textMuted}`} />
                            <input
                              className={`${inputCls} flex-1 font-mono text-xs`}
                              value={line}
                              onChange={(e) => updateLine(lectureIdx, lineIdx, e.target.value)}
                              placeholder="say Текст строки..."
                            />
                            <button
                              onClick={() => removeLine(lectureIdx, lineIdx)}
                              className="p-1.5 mt-0.5 rounded hover:bg-red-500/20 flex-shrink-0"
                              title="Удалить строку"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => addLine(lectureIdx)}
                        className={`mt-2 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-dashed transition-colors w-full justify-center ${isDark ? "border-white/20 text-white/40 hover:text-white hover:border-white/40" : "border-black/20 text-black/30 hover:text-black hover:border-black/40"}`}
                      >
                        <Plus className="w-3 h-3" />
                        Добавить строку
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Add lecture */}
        <button
          onClick={addLecture}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border border-dashed transition-colors w-full justify-center ${isDark ? "border-white/20 text-white/50 hover:text-white hover:border-white/40" : "border-black/20 text-black/40 hover:text-black hover:border-black/40"}`}
        >
          <Plus className="w-3.5 h-3.5" />
          Добавить лекцию
        </button>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }}>
          {hasOverride && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleContentReset(contentEditingId)}
              disabled={saving}
              className={`h-8 px-3 text-xs gap-1.5 ${isDark ? "border-white/10 text-white bg-transparent hover:bg-white/5" : "border-black/10 text-black bg-transparent hover:bg-black/5"}`}
            >
              <RotateCcw className="w-3 h-3" />
              Сбросить к оригиналу
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={cancelContentEdit}
            className={`h-8 px-3 text-xs ${isDark ? "border-white/10 text-white bg-transparent hover:bg-white/5" : "border-black/10 text-black bg-transparent hover:bg-black/5"}`}
          >
            Отмена
          </Button>
          <Button
            size="sm"
            onClick={handleContentSave}
            disabled={saving}
            className="h-8 px-4 text-xs text-white font-semibold ml-auto"
            style={{ backgroundColor: tieColor }}
          >
            <Save className="w-3 h-3 mr-1.5" />
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>
    )
  }

  // ── Main list view ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Tab switcher */}
      <div className={`flex gap-1 p-1 rounded-xl border ${border}`} style={{ backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}>
        {([["appearance", "Внешний вид"], ["content", "Контент"]] as [TabType, string][]).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors"
            style={activeTab === tab ? { backgroundColor: tieColor, color: "#fff" } : { color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "appearance" && (
        <>
          <p className={`text-xs ${textMuted} pb-1`}>
            Переименуйте разделы и смените иконку в боковом меню. Откат возвращает к оригинальным значениям.
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
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={() => setIconPickerOpen((v) => !v)}
                          className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border ${border} ${hoverBg} transition-colors`}
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
                      <Button size="sm" variant="outline" onClick={cancelEdit}
                        className={`h-7 px-2 text-xs ${isDark ? "border-white/10 text-white bg-transparent hover:bg-white/5" : "border-black/10 text-black bg-transparent hover:bg-black/5"}`}>
                        <X className="w-3 h-3 mr-1" />Отмена
                      </Button>
                      <Button size="sm" onClick={() => handleSave(section)} disabled={saving || !editTitle.trim()}
                        className="h-7 px-3 text-xs text-white font-semibold" style={{ backgroundColor: tieColor }}>
                        <Save className="w-3 h-3 mr-1" />
                        {saving ? "..." : "Сохранить"}
                      </Button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={section.id} className={`rounded-2xl border ${border} ${cardBg} px-3 py-2.5 flex items-center gap-3`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold truncate ${isDark ? "text-white" : "text-black"}`}>
                        {displayTitle}
                      </span>
                      {hasOverride && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium"
                          style={{ backgroundColor: tieColor + "20", color: tieColor }}>изменён</span>
                      )}
                    </div>
                    {hasOverride && (
                      <p className={`text-xs ${textMuted} mt-0.5`}>Оригинал: {section.defaultTitle}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasOverride && (
                      <Button variant="outline" size="sm" onClick={() => handleReset(section)} disabled={saving}
                        title="Сбросить к оригиналу"
                        className={`h-7 w-7 p-0 ${isDark ? "border-white/10 bg-transparent hover:bg-white/5" : "border-black/10 bg-transparent hover:bg-black/5"}`}>
                        <RotateCcw className="w-3.5 h-3.5" style={{ color: isDark ? "#fff" : "#000" }} />
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => startEdit(section)}
                      className={`h-7 w-7 p-0 ${isDark ? "border-white/10 bg-transparent hover:bg-white/5" : "border-black/10 bg-transparent hover:bg-black/5"}`}>
                      <Edit className="w-3.5 h-3.5" style={{ color: tieColor }} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {activeTab === "content" && (
        <>
          <p className={`text-xs ${textMuted} pb-1`}>
            Редактируйте строки лекций и других текстовых разделов. Изменения сохраняются в базу данных поверх оригинала.
          </p>
          <div className="space-y-2">
            {BUILTIN_SECTIONS.filter((s) => s.hasContent).map((section) => {
              const ov = overrides[section.id]
              const hasContentOverride = !!ov?.content_override
              return (
                <div key={section.id} className={`rounded-2xl border ${border} ${cardBg} px-3 py-2.5 flex items-center gap-3`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}>
                        {ov?.title ?? section.defaultTitle}
                      </span>
                      {hasContentOverride && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium"
                          style={{ backgroundColor: tieColor + "20", color: tieColor }}>изменён</span>
                      )}
                    </div>
                    {hasContentOverride && (
                      <p className={`text-xs ${textMuted} mt-0.5`}>Контент переопределён</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {hasContentOverride && (
                      <Button variant="outline" size="sm" onClick={() => handleContentReset(section.id)} disabled={saving}
                        title="Сбросить контент к оригиналу"
                        className={`h-7 w-7 p-0 ${isDark ? "border-white/10 bg-transparent hover:bg-white/5" : "border-black/10 bg-transparent hover:bg-black/5"}`}>
                        <RotateCcw className="w-3.5 h-3.5" style={{ color: isDark ? "#fff" : "#000" }} />
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => startContentEdit(section)}
                      className={`h-7 w-7 p-0 ${isDark ? "border-white/10 bg-transparent hover:bg-white/5" : "border-black/10 bg-transparent hover:bg-black/5"}`}>
                      <Edit className="w-3.5 h-3.5" style={{ color: tieColor }} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
