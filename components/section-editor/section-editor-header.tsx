"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Save, X, ChevronDown,
  FileText, BookOpen, GraduationCap, Star, ClipboardList,
  Wrench, Train, Shield, Zap, Bell, Map, Clock, Users,
  Info, Calendar, Award, Megaphone, Settings, Radio,
  Layers, Target, Globe, Cpu, BarChart, MessageSquare,
  Briefcase, HardHat, Gauge, Database, Archive, Flag,
  AlertTriangle, CheckCircle, Headphones, Camera,
  FileSearch, Landmark, Wifi, ChevronRight, Package,
  Layout, Lightbulb, BookMarked, Clipboard, Activity,
} from "lucide-react"
import type { CustomSection } from "@/data/custom-sections"

const ICON_OPTIONS: { name: string; component: React.ComponentType<any> }[] = [
  { name: "FileText", component: FileText },
  { name: "BookOpen", component: BookOpen },
  { name: "GraduationCap", component: GraduationCap },
  { name: "Star", component: Star },
  { name: "ClipboardList", component: ClipboardList },
  { name: "Wrench", component: Wrench },
  { name: "Train", component: Train },
  { name: "Shield", component: Shield },
  { name: "Zap", component: Zap },
  { name: "Bell", component: Bell },
  { name: "Map", component: Map },
  { name: "Clock", component: Clock },
  { name: "Users", component: Users },
  { name: "Info", component: Info },
  { name: "Calendar", component: Calendar },
  { name: "Award", component: Award },
  { name: "Megaphone", component: Megaphone },
  { name: "Settings", component: Settings },
  { name: "Radio", component: Radio },
  { name: "Layers", component: Layers },
  { name: "Target", component: Target },
  { name: "Globe", component: Globe },
  { name: "Cpu", component: Cpu },
  { name: "BarChart", component: BarChart },
  { name: "MessageSquare", component: MessageSquare },
  { name: "Briefcase", component: Briefcase },
  { name: "HardHat", component: HardHat },
  { name: "Gauge", component: Gauge },
  { name: "Database", component: Database },
  { name: "Archive", component: Archive },
  { name: "Flag", component: Flag },
  { name: "AlertTriangle", component: AlertTriangle },
  { name: "CheckCircle", component: CheckCircle },
  { name: "Headphones", component: Headphones },
  { name: "Camera", component: Camera },
  { name: "FileSearch", component: FileSearch },
  { name: "Landmark", component: Landmark },
  { name: "Wifi", component: Wifi },
  { name: "ChevronRight", component: ChevronRight },
  { name: "Package", component: Package },
  { name: "Layout", component: Layout },
  { name: "Lightbulb", component: Lightbulb },
  { name: "BookMarked", component: BookMarked },
  { name: "Clipboard", component: Clipboard },
  { name: "Activity", component: Activity },
]

export function getIconComponent(name: string): React.ComponentType<any> {
  return ICON_OPTIONS.find((i) => i.name === name)?.component ?? FileText
}

interface SectionEditorHeaderProps {
  draft: CustomSection
  onDraftChange: (s: CustomSection) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isNew: boolean
  tieColor: string
  isDark: boolean
}

export function SectionEditorHeader({
  draft,
  onDraftChange,
  onSave,
  onCancel,
  saving,
  isNew,
  tieColor,
  isDark,
}: SectionEditorHeaderProps) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  const CurrentIcon = getIconComponent(draft.icon)

  const textMuted = isDark ? "text-white/50" : "text-black/40"
  const border = isDark ? "border-white/10" : "border-black/10"
  const hoverBg = isDark ? "hover:bg-white/5" : "hover:bg-black/5"

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      {/* Icon picker */}
      <div className="relative">
        <button
          onClick={() => setIconPickerOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${border} ${hoverBg} transition-colors`}
          title="Выбрать иконку"
        >
          <CurrentIcon className="w-5 h-5" style={{ color: tieColor }} />
          <ChevronDown className={`w-3 h-3 ${textMuted}`} />
        </button>

        {iconPickerOpen && (
          <div
            className={`absolute top-full left-0 mt-1 z-50 rounded-xl border ${border} shadow-2xl p-2`}
            style={{ backgroundColor: isDark ? "#111" : "#fff", width: 320 }}
          >
            <div className="grid grid-cols-9 gap-1">
              {ICON_OPTIONS.map(({ name, component: Ic }) => (
                <button
                  key={name}
                  onClick={() => {
                    onDraftChange({ ...draft, icon: name })
                    setIconPickerOpen(false)
                  }}
                  className={`p-2 rounded-lg ${hoverBg} transition-colors`}
                  style={draft.icon === name ? { outline: `2px solid ${tieColor}`, outlineOffset: 1 } : undefined}
                  title={name}
                >
                  <Ic
                    className="w-4 h-4"
                    style={{ color: draft.icon === name ? tieColor : isDark ? "#aaa" : "#555" }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Title input */}
      <Input
        value={draft.title}
        onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
        placeholder="Название раздела"
        className={`flex-1 text-xl font-bold border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0 ${isDark ? "text-white placeholder:text-white/30" : "text-black placeholder:text-black/30"}`}
        style={{ fontSize: 20 }}
      />

      <span className={`text-sm ${textMuted} hidden sm:block`}>
        {isNew ? "Новый раздел" : "Редактирование"}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-2 ml-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className={`${isDark ? "border-white/10 text-white hover:bg-white/5" : "border-black/10 text-black hover:bg-black/5"} bg-transparent`}
        >
          <X className="w-4 h-4 mr-1.5" />
          Отмена
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || !draft.title.trim()}
          className="text-white font-semibold"
          style={{ backgroundColor: tieColor }}
        >
          <Save className="w-4 h-4 mr-1.5" />
          {saving ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>
    </div>
  )
}

export { ICON_OPTIONS }
