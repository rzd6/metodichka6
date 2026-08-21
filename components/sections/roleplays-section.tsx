"use client"

import { useEffect, useState } from "react"
import { Copy, Check, MessagesSquare } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { contentData } from "@/data/content"
import { applyGenderToText } from "@/lib/gender-text"
import type { UserGender } from "@/data/roles"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import { getBuiltinOverrides } from "@/data/custom-sections"
import { BugReportButton } from "@/components/bug-report-button"
import { clipboardCopy } from "@/lib/clipboard"

type Roleplay = { id: string; number: number; title: string; content: string[] }

export function RoleplaysSection() {
  const { theme } = useTheme()
  const [gender, setGender] = useState<UserGender>("male")
  const [selectedCategory, setSelectedCategory] = useState<"main" | "additional">("main")
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null)
  const [contentOverride, setContentOverride] = useState<{ main?: Roleplay[]; additional?: Roleplay[] } | null>(null)
  const tieColor = getThemeColor(theme.colorTheme)
  const isDark = theme.mode === "dark"

  useEffect(() => {
    const readGender = () => {
      try {
        const user = JSON.parse(localStorage.getItem("currentUser") || "null")
        setGender(user?.gender === "female" ? "female" : "male")
      } catch {
        setGender("male")
      }
    }
    readGender()
    window.addEventListener("userGenderUpdated", readGender)
    window.addEventListener("userDataUpdated", readGender)
    return () => {
      window.removeEventListener("userGenderUpdated", readGender)
      window.removeEventListener("userDataUpdated", readGender)
    }
  }, [])

  useEffect(() => {
    const loadOverrides = () => getBuiltinOverrides().then((overrides) => {
      const value = overrides["roleplays"]?.content_override
      setContentOverride(value ?? null)
    })
    loadOverrides()
    window.addEventListener("builtinOverridesUpdated", loadOverrides)
    return () => window.removeEventListener("builtinOverridesUpdated", loadOverrides)
  }, [])

  useEffect(() => setCopiedIndex(null), [selectedCategory])

  const staticData = contentData.roleplays[selectedCategory]
  const roleplays = contentOverride?.[selectedCategory] ?? staticData
  const copyToClipboard = (text: string, id: string) => {
    clipboardCopy(text)
    setCopiedIndex(id)
  }

  const renderContent = (content: string[], roleplayId: string) => content.map((line, index) => {
    const id = `${roleplayId}-${index}`
    const isCopied = copiedIndex === id
    const text = applyGenderToText(line, gender)
    return (
      <button key={id} onClick={() => copyToClipboard(text, id)} className={`group mb-3 w-full rounded-xl border-2 p-4 text-left transition-all ${isCopied ? (isDark ? "border-green-500/60 bg-green-900/40" : "border-green-400 bg-green-50") : (isDark ? "border-white/10 bg-[#0f1419]/80 hover:border-white/30" : "border-gray-200 bg-white hover:border-gray-300")}`} style={{ borderLeftWidth: 4, borderLeftColor: isCopied ? "#22c55e" : tieColor }}>
        <div className="flex items-start justify-between gap-4">
          <p className={`flex-1 text-sm ${isCopied ? "text-green-500" : isDark ? "text-white/90" : "text-gray-900"}`}>{text}</p>
          {isCopied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" style={{ color: tieColor }} />}
        </div>
      </button>
    )
  })

  return (
    <div className="flex flex-col gap-6 opacity-95">
      <div className="flex items-center gap-3 border-b pb-4" style={{ borderColor: `${tieColor}40` }}>
        <div className="rounded-xl p-3" style={{ background: `linear-gradient(135deg, ${tieColor}20, ${tieColor}10)` }}><MessagesSquare className="size-6" style={{ color: tieColor }} /></div>
        <div className="flex-1"><h2 className="text-3xl font-bold" style={{ color: tieColor }}>РП отыгровки</h2><p className={isDark ? "text-sm text-white/70" : "text-sm text-gray-600"}>Готовые игровые действия для всех сотрудников</p></div>
        <BugReportButton sectionLabel="РП отыгровки" />
      </div>
      <div className="flex gap-3">
        {(["main", "additional"] as const).map((category) => (
          <button key={category} onClick={() => setSelectedCategory(category)} className={`rounded-xl border-2 px-6 py-3 font-medium transition-all ${selectedCategory === category ? "text-white shadow-lg" : isDark ? "border-white/10 bg-[#0f1419]/50 text-white/70 hover:border-white/30" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`} style={selectedCategory === category ? { backgroundColor: tieColor, borderColor: tieColor } : undefined}>
            {category === "main" ? "Основные отыгровки" : "Дополнительные отыгровки"}
          </button>
        ))}
      </div>
      <Accordion type="single" collapsible className="flex flex-col gap-4">
        {roleplays.map((roleplay) => <AccordionItem key={roleplay.id} value={roleplay.id} className={`overflow-hidden rounded-2xl border-2 ${isDark ? "border-white/10 bg-[#0f1419]/50" : "border-gray-200 bg-white"}`}>
          <AccordionTrigger className="px-6 py-4 hover:no-underline"><div className="flex items-center gap-3"><MessagesSquare className="size-5" style={{ color: tieColor }} /><span className="font-bold">{roleplay.number}. {roleplay.title}</span></div></AccordionTrigger>
          <AccordionContent className="px-6 pb-6">{renderContent(roleplay.content, roleplay.id)}</AccordionContent>
        </AccordionItem>)}
      </Accordion>
    </div>
  )
}
