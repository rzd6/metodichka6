"use client"

import { useEffect, useState } from "react"
import { Copy, Check, MessagesSquare } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { contentData } from "@/data/content"
import { applyGenderToText } from "@/lib/gender-text"
import type { UserGender } from "@/data/roles"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import { BugReportButton } from "@/components/bug-report-button"
import { clipboardCopy } from "@/lib/clipboard"

export function RoleplaysSection() {
  const { theme } = useTheme()
  const [gender, setGender] = useState<UserGender>("male")
  const [copied, setCopied] = useState<string | null>(null)
  const tieColor = getThemeColor(theme.colorTheme)
  const isDark = theme.mode === "dark"

  useEffect(() => {
    const readGender = () => {
      try {
        const user = JSON.parse(localStorage.getItem("currentUser") || "null")
        setGender(user?.gender === "female" ? "female" : "male")
      } catch { setGender("male") }
    }
    readGender()
    window.addEventListener("userGenderUpdated", readGender)
    window.addEventListener("storage", readGender)
    return () => { window.removeEventListener("userGenderUpdated", readGender); window.removeEventListener("storage", readGender) }
  }, [])

  const data = contentData.roleplays ?? []
  const copy = (text: string, id: string) => { clipboardCopy(text); setCopied(id); window.setTimeout(() => setCopied(null), 1200) }

  return (
    <div className="flex flex-col gap-6 opacity-95">
      <div className="flex items-center gap-3 border-b pb-4" style={{ borderColor: `${tieColor}40` }}>
        <div className="rounded-xl p-3" style={{ backgroundColor: `${tieColor}20` }}><MessagesSquare className="size-6" style={{ color: tieColor }} /></div>
        <div className="flex-1"><h2 className="text-3xl font-bold" style={{ color: tieColor }}>РП отыгровки</h2><p className={isDark ? "text-sm text-white/70" : "text-sm text-gray-600"}>Готовые игровые действия для всех сотрудников</p></div>
        <BugReportButton sectionLabel="РП отыгровки" />
      </div>
      <div className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: `${tieColor}40` }}>
        <div><p className="font-semibold">Форма обращения</p><p className="text-sm text-muted-foreground">Выбрано в настройках профиля</p></div>
        <div className="flex gap-2"><button onClick={() => setGender("male")} className="rounded-lg border px-4 py-2 text-sm" style={gender === "male" ? { backgroundColor: tieColor, color: "#fff" } : undefined}>Мужской</button><button onClick={() => setGender("female")} className="rounded-lg border px-4 py-2 text-sm" style={gender === "female" ? { backgroundColor: tieColor, color: "#fff" } : undefined}>Женский</button></div>
      </div>
      <Accordion type="single" collapsible className="flex flex-col gap-4">
        {data.map((item: any) => <AccordionItem key={item.id} value={item.id} className={`overflow-hidden rounded-2xl border-2 ${isDark ? "border-white/10 bg-[#0f1419]/50" : "border-gray-200 bg-white"}`}>
          <AccordionTrigger className="px-6 py-4 hover:no-underline"><span className="font-bold">{item.number}. {item.title}</span></AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3 px-6 pb-6">{(item.content ?? []).map((line: string, index: number) => { const id = `${item.id}-${index}`; const text = applyGenderToText(line, gender); return <button key={id} onClick={() => copy(text, id)} className="flex items-start justify-between gap-4 rounded-xl border p-4 text-left transition-colors hover:border-current" style={{ borderLeftWidth: 4, borderLeftColor: tieColor }}><span className="flex-1 text-sm">{text}</span>{copied === id ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" style={{ color: tieColor }} />}</button> })}</AccordionContent>
        </AccordionItem>)}
      </Accordion>
    </div>
  )
}
