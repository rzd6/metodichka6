"use client"

import { useState } from "react"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import { clipboardCopy } from "@/lib/clipboard"
import { Check, Copy, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import type { CustomSection, ContentBlock } from "@/data/custom-sections"
import type { UserRole } from "@/data/users"
import { proxyImageUrl } from "@/lib/image-proxy"

interface Props {
  section: CustomSection
  userRole?: UserRole
}

export function CustomSectionView({ section, userRole }: Props) {
  const { theme } = useTheme()
  const tieColor = getThemeColor(theme.colorTheme)
  const isDark = theme.mode === "dark"

  return (
    <div className="space-y-4">
      <div className="pb-3 border-b" style={{ borderColor: tieColor + "40" }}>
        <h2 className="text-3xl font-bold" style={{ color: tieColor }}>{section.title}</h2>
      </div>
      <div className="space-y-4">
        {section.content.map((block) => (
          <BlockRenderer key={block.id} block={block} tieColor={tieColor} isDark={isDark} />
        ))}
        {section.content.length === 0 && (
          <p className={`text-sm ${isDark ? "text-white/40" : "text-black/40"}`}>Раздел пока пуст.</p>
        )}
      </div>
    </div>
  )
}

function BlockRenderer({ block, tieColor, isDark }: { block: ContentBlock; tieColor: string; isDark: boolean }) {
  const textBase = isDark ? "text-white" : "text-black"
  const textMuted = isDark ? "text-white/60" : "text-black/60"
  const border = isDark ? "border-white/10" : "border-black/10"

  if (block.type === "heading") {
    const classes: Record<1 | 2 | 3, string> = { 1: "text-2xl font-bold", 2: "text-xl font-semibold", 3: "text-lg font-medium" }
    return <p className={`${classes[block.level]} ${textBase}`} style={{ textAlign: block.align ?? "left" }}>{block.text}</p>
  }

  if (block.type === "text") {
    return (
      <p className={`text-sm leading-relaxed ${textBase} ${block.bold ? "font-bold" : ""} ${block.italic ? "italic" : ""}`}
        style={{ textAlign: block.align ?? "left" }}>
        {block.text}
      </p>
    )
  }

  if (block.type === "accordion") {
    return <AccordionBlock block={block} tieColor={tieColor} isDark={isDark} border={border} textBase={textBase} textMuted={textMuted} />
  }

  if (block.type === "copyable") {
    return <CopyableBlock block={block} tieColor={tieColor} isDark={isDark} border={border} textBase={textBase} />
  }

  if (block.type === "image") {
    return (
      <figure className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxyImageUrl(block.url)}
          alt={block.alt ?? block.caption ?? ""}
          className="rounded-xl max-w-full object-cover"
          onError={(e) => {
            const img = e.currentTarget
            if (!img.dataset.errored) {
              img.dataset.errored = "1"
              img.style.display = "none"
              const placeholder = document.createElement("div")
              placeholder.className = "rounded-xl flex items-center justify-center text-xs py-8 px-4 text-center"
              placeholder.style.cssText = `background:${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}; color:${isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}; border:1px dashed ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`
              placeholder.textContent = block.caption ? `[${block.caption}]` : "[Изображение недоступно]"
              img.parentNode?.insertBefore(placeholder, img)
            }
          }}
        />
        {block.caption && <figcaption className={`text-xs text-center ${textMuted}`}>{block.caption}</figcaption>}
      </figure>
    )
  }

  if (block.type === "table") {
    return (
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: tieColor + "30" }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ backgroundColor: tieColor + "18" }}>
              {block.headers.map((h, i) => (
                <th key={i} className={`px-4 py-2.5 text-left font-semibold border-b ${border} ${textBase}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? "" : isDark ? "bg-white/3" : "bg-black/2"}>
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-4 py-2 border-b ${border} ${textMuted} text-xs`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (block.type === "link") {
    return (
      <a
        href={block.href}
        target={block.external ? "_blank" : undefined}
        rel={block.external ? "noopener noreferrer" : undefined}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: tieColor }}
      >
        {block.label}
        {block.external && <ExternalLink className="w-3.5 h-3.5" />}
      </a>
    )
  }

  if (block.type === "divider") {
    return <hr className={`border ${border}`} />
  }

  if (block.type === "callout") {
    const colors: Record<string, string> = { info: "#3b82f6", warning: "#f59e0b", danger: "#ef4444", success: "#22c55e" }
    const c = colors[block.variant] ?? tieColor
    return (
      <div className="rounded-xl p-4 border-l-4 space-y-1" style={{ backgroundColor: c + "15", borderColor: c }}>
        {block.title && <p className="font-semibold text-sm" style={{ color: c }}>{block.title}</p>}
        <p className={`text-sm leading-relaxed ${textBase}`}>{block.text}</p>
      </div>
    )
  }

  if (block.type === "code") {
    return (
      <div className={`rounded-xl border ${border} overflow-hidden`}>
        {block.language && (
          <div className={`px-4 py-1.5 text-xs font-mono ${textMuted} border-b ${border}`} style={{ backgroundColor: isDark ? "#fff1" : "#0001" }}>
            {block.language}
          </div>
        )}
        <pre className={`p-4 text-xs font-mono overflow-x-auto ${textBase}`} style={{ backgroundColor: isDark ? "#fff0a" : "#f5f5f5" }}>
          <code>{block.code}</code>
        </pre>
      </div>
    )
  }

  if (block.type === "list") {
    return (
      <ul className={`space-y-1.5 text-sm ${textBase} ${block.ordered ? "list-decimal pl-5" : "list-disc pl-5"}`}>
        {block.items.map((item, i) => <li key={i} className="leading-relaxed">{item}</li>)}
      </ul>
    )
  }

  if (block.type === "steps") {
    return (
      <div className="space-y-3">
        {block.steps.map((step, i) => (
          <div key={i} className={`flex gap-3 p-3 rounded-xl border ${border}`}>
            <span className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: tieColor }}>{i + 1}</span>
            <div>
              <p className={`font-semibold text-sm ${textBase}`}>{step.title}</p>
              {step.description && <p className={`text-xs mt-0.5 ${textMuted}`}>{step.description}</p>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (block.type === "badge_row") {
    return (
      <div className="flex flex-wrap gap-2">
        {block.badges.map((badge, i) => (
          <span key={i} className="px-3 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: badge.color || tieColor }}>
            {badge.label}
          </span>
        ))}
      </div>
    )
  }

  return null
}

function AccordionBlock({ block, tieColor, isDark, border, textBase, textMuted }: any) {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({})

  // Support both legacy (title+body) and new (items[]) formats
  const items: { id: string; title: string; body: string; blocks?: any[] }[] =
    block.items && block.items.length > 0
      ? block.items
      : [{ id: "legacy", title: block.title ?? "", body: block.body ?? "" }]

  const toggle = (id: string) => setOpenItems((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className={`rounded-xl border ${border} overflow-hidden divide-y`} style={{ borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }}>
      {items.map((item) => {
        const isOpen = !!openItems[item.id]
        const hasBlocks = Array.isArray(item.blocks) && item.blocks.length > 0
        return (
          <div key={item.id}>
            <button
              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold ${textBase} transition-colors text-left`}
              style={{ backgroundColor: isOpen ? tieColor + "18" : "transparent" }}
              onClick={() => toggle(item.id)}
            >
              <span>{item.title}</span>
              {isOpen
                ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: tieColor }} />
                : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: tieColor }} />
              }
            </button>
            {isOpen && (
              <div className={`px-4 py-3 border-t ${border}`}>
                {hasBlocks
                  ? (
                    // Render nested structured blocks
                    <div className="space-y-3">
                      {item.blocks!.map((subBlock: any) => (
                        <BlockRenderer key={subBlock.id} block={subBlock} tieColor={tieColor} isDark={isDark} />
                      ))}
                    </div>
                  )
                  : (
                    // Legacy plain text body
                    <p className={`text-sm leading-relaxed ${textMuted} whitespace-pre-wrap`}>{item.body}</p>
                  )
                }
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CopyableBlock({ block, tieColor, isDark, border, textBase }: any) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    clipboardCopy(block.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className={`flex items-center gap-2 rounded-xl border ${border} overflow-hidden`}>
      <div className="flex-1 px-4 py-2.5">
        {block.label && <p className="text-xs mb-0.5" style={{ color: tieColor }}>{block.label}</p>}
        <p className={`text-sm font-mono break-all ${textBase}`}>{block.value}</p>
      </div>
      <button
        onClick={handleCopy}
        className="px-3 py-2 m-1 rounded-lg text-white transition-colors text-xs font-semibold flex items-center gap-1.5"
        style={{ backgroundColor: copied ? "#22c55e" : tieColor }}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  )
}
