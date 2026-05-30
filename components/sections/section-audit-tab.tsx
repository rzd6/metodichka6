"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, History, Plus, Edit, Trash2, Eye, ChevronDown, ChevronUp } from "lucide-react"
import { getSectionAuditLog, type SectionAuditEntry } from "@/data/custom-sections"

interface Props {
  tieColor: string
  isDark: boolean
}

const ACTION_LABELS: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  create:            { label: "Создан",  icon: Plus,    color: "#22c55e" },
  update:            { label: "Изменён", icon: Edit,    color: "#3b82f6" },
  delete:            { label: "Удалён",  icon: Trash2,  color: "#ef4444" },
  toggle_visibility: { label: "Видимость", icon: Eye,  color: "#f59e0b" },
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function ChangesDiff({ changes, isDark, tieColor }: { changes: SectionAuditEntry["changes"]; isDark: boolean; tieColor: string }) {
  if (!changes || Object.keys(changes).length === 0) return null

  const textMuted = isDark ? "text-white/50" : "text-black/40"
  const border = isDark ? "border-white/10" : "border-black/8"

  const FIELD_NAMES: Record<string, string> = {
    title: "Название",
    icon: "Иконка",
    content: "Содержимое",
    hidden_from_roles: "Скрытые роли",
    is_hidden: "Скрыт",
  }

  return (
    <div className="space-y-1.5 mt-2">
      {Object.entries(changes).map(([field, diff]) => {
        const fieldName = FIELD_NAMES[field] ?? field
        const isContent = field === "content"
        const oldVal = isContent ? `${Array.isArray(diff.old) ? diff.old.length : 0} блоков` : JSON.stringify(diff.old)
        const newVal = isContent ? `${Array.isArray(diff.new) ? diff.new.length : 0} блоков` : JSON.stringify(diff.new)
        return (
          <div key={field} className={`rounded-lg border ${border} p-2 text-xs`}>
            <span className="font-semibold" style={{ color: tieColor }}>{fieldName}</span>
            {diff.old !== undefined && (
              <div className={`mt-1 ${textMuted}`}>
                <span className="text-red-400">- </span>
                <span className="font-mono break-all">{oldVal}</span>
              </div>
            )}
            {diff.new !== undefined && (
              <div className={`mt-0.5 ${isDark ? "text-white/80" : "text-black/70"}`}>
                <span className="text-green-400">+ </span>
                <span className="font-mono break-all">{newVal}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function SectionAuditTab({ tieColor, isDark }: Props) {
  const [entries, setEntries] = useState<SectionAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const border = isDark ? "border-white/10" : "border-black/10"
  const cardBg = isDark ? "bg-[#0f1419]/50" : "bg-white"
  const textMuted = isDark ? "text-white/50" : "text-black/40"

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    const data = await getSectionAuditLog()
    setEntries(data)
    if (!silent) setLoading(false); else setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: tieColor + "40" }}>
        <div className="p-3 rounded-xl" style={{ background: `linear-gradient(135deg, ${tieColor}20, ${tieColor}10)` }}>
          <History className="w-6 h-6" style={{ color: tieColor }} />
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-bold" style={{ color: tieColor }}>Аудит разделов</h2>
          <p className={`text-sm ${textMuted}`}>Кто, когда и что изменил в разделах</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}
          className={`h-8 px-3 text-xs ${isDark ? "border-white/10 bg-transparent text-white hover:bg-white/5" : "border-gray-200 bg-transparent text-black hover:bg-gray-50"}`}>
          <RefreshCw className={`w-3 h-3 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? "bg-white/5" : "bg-gray-100"}`} style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className={`rounded-2xl border-2 border-dashed ${border} p-12 text-center ${textMuted}`}>
          <History className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Записей аудита пока нет</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const meta = ACTION_LABELS[entry.action] ?? { label: entry.action, icon: Edit, color: "#888" }
            const ActionIcon = meta.icon
            const hasChanges = entry.changes && Object.keys(entry.changes).length > 0
            const isExp = expanded.has(entry.id)

            return (
              <div key={entry.id} className={`rounded-2xl border ${border} ${cardBg} p-3`}>
                <div className="flex items-start gap-3">
                  {/* Action badge */}
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: meta.color + "20" }}>
                    <ActionIcon className="w-4 h-4" style={{ color: meta.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold text-sm" style={{ color: isDark ? "#fff" : "#000" }}>
                          {entry.section_title}
                        </span>
                        <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: meta.color + "20", color: meta.color }}>
                          {meta.label}
                        </span>
                      </div>
                      <span className={`text-xs flex-shrink-0 ${textMuted}`}>{formatDate(entry.created_at)}</span>
                    </div>
                    <div className={`text-xs mt-0.5 ${textMuted}`}>
                      <span className="font-medium" style={{ color: tieColor }}>{entry.actor_nickname}</span>
                      <span className="ml-1">({entry.actor_role})</span>
                    </div>

                    {hasChanges && (
                      <button
                        onClick={() => toggleExpand(entry.id)}
                        className={`mt-1.5 flex items-center gap-1 text-xs ${textMuted} hover:text-current transition-colors`}
                      >
                        {isExp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {isExp ? "Скрыть изменения" : "Показать изменения"}
                      </button>
                    )}

                    {isExp && (
                      <ChangesDiff changes={entry.changes} isDark={isDark} tieColor={tieColor} />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
