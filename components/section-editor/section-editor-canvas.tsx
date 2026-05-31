"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Trash2, GripVertical, ChevronDown, ChevronUp,
  Plus, Type, AlignLeft, List, Table as TableIcon,
  Link2, Image as ImageIcon, Minus, Info, Code,
  Copy, ChevronRight, Tag, ArrowDown, LayoutGrid,
  X, PlusCircle,
} from "lucide-react"
import type { ContentBlock, BlockType, AccordionItem } from "@/data/custom-sections"

// ─── Block factory ─────────────────────────────────────────────────────────────
function newBlock(type: BlockType): ContentBlock {
  const id = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  switch (type) {
    case "heading":    return { type, id, text: "Заголовок", level: 2 }
    case "text":       return { type, id, text: "Текст параграфа..." }
    case "accordion":  return { type, id, items: [{ id: `acc-${Date.now()}`, title: "Пункт 1", body: "" }] }
    case "copyable":   return { type, id, label: "Команда", value: "" }
    case "image":      return { type, id, url: "", caption: "" }
    case "table":      return { type, id, headers: ["Колонка 1", "Колонка 2"], rows: [["", ""]] }
    case "link":       return { type, id, label: "Ссылка", href: "https://", external: true }
    case "divider":    return { type, id }
    case "callout":    return { type, id, variant: "info", text: "Важная информация", title: "" }
    case "code":       return { type, id, code: "", language: "" }
    case "list":       return { type, id, ordered: false, items: ["Пункт 1", "Пункт 2"] }
    case "steps":      return { type, id, steps: [{ title: "Шаг 1", description: "" }] }
    case "badge_row":  return { type, id, badges: [{ label: "Тег", color: "" }] }
  }
}

function newAccordionItem(): AccordionItem {
  return { id: `acc-${Date.now()}-${Math.random().toString(36).slice(2,5)}`, title: "Новый пункт", body: "" }
}

// ─── Block type palette ───────────────────────────────────────────────────────
const BLOCK_PALETTE: { type: BlockType; label: string; icon: React.ComponentType<any> }[] = [
  { type: "heading",   label: "Заголовок",   icon: Type },
  { type: "text",      label: "Текст",       icon: AlignLeft },
  { type: "accordion", label: "Аккордеон",   icon: ChevronRight },
  { type: "copyable",  label: "Копирование", icon: Copy },
  { type: "image",     label: "Изображение", icon: ImageIcon },
  { type: "table",     label: "Таблица",     icon: TableIcon },
  { type: "link",      label: "Ссылка",      icon: Link2 },
  { type: "divider",   label: "Разделитель", icon: Minus },
  { type: "callout",   label: "Выделение",   icon: Info },
  { type: "code",      label: "Код",         icon: Code },
  { type: "list",      label: "Список",      icon: List },
  { type: "steps",     label: "Шаги",        icon: ArrowDown },
  { type: "badge_row", label: "Бейджи",      icon: Tag },
]

// ─── Main canvas ──────────────────────────────────────────────────────────────
interface Props {
  blocks: ContentBlock[]
  onChange: (blocks: ContentBlock[]) => void
  tieColor: string
  isDark: boolean
}

export function SectionEditorCanvas({ blocks, onChange, tieColor, isDark }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false)

  const border = isDark ? "border-white/10" : "border-black/10"
  const cardBg = isDark ? "bg-white/[0.04]" : "bg-black/[0.03]"
  const hoverBg = isDark ? "hover:bg-white/8" : "hover:bg-black/5"
  const textMuted = isDark ? "text-white/50" : "text-black/40"

  const add = (type: BlockType) => {
    onChange([...blocks, newBlock(type)])
    setPaletteOpen(false)
  }

  const update = (idx: number, block: ContentBlock) => {
    const next = [...blocks]
    next[idx] = block
    onChange(next)
  }

  const remove = (idx: number) => onChange(blocks.filter((_, i) => i !== idx))

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...blocks]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {blocks.length === 0 && !paletteOpen && (
        <div className={`rounded-2xl border-2 border-dashed ${border} p-12 text-center ${textMuted}`}>
          <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Раздел пуст. Добавьте блок ниже.</p>
        </div>
      )}

      {blocks.map((block, idx) => (
        <BlockEditor
          key={block.id}
          block={block}
          idx={idx}
          total={blocks.length}
          onChange={(b) => update(idx, b)}
          onRemove={() => remove(idx)}
          onMove={(dir) => move(idx, dir)}
          tieColor={tieColor}
          isDark={isDark}
          border={border}
          cardBg={cardBg}
          hoverBg={hoverBg}
          textMuted={textMuted}
        />
      ))}

      {/* Add block button + inline palette below */}
      <Button
        variant="outline"
        className={`w-full border-dashed ${isDark ? "border-white/20 text-white/60 hover:bg-white/5 hover:text-white" : "border-black/20 text-black/50 hover:bg-black/5 hover:text-black"} bg-transparent`}
        onClick={() => setPaletteOpen((v) => !v)}
      >
        {paletteOpen
          ? <><X className="w-4 h-4 mr-2" />Закрыть</>
          : <><Plus className="w-4 h-4 mr-2" />Добавить блок</>
        }
      </Button>

      {paletteOpen && (
        <div
          className={`rounded-xl border ${border} p-3`}
          style={{ backgroundColor: isDark ? "#111" : "#f9f9f9" }}
        >
          <p className={`text-xs mb-2 font-medium ${textMuted}`}>Выберите тип блока:</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {BLOCK_PALETTE.map(({ type, label, icon: Ic }) => (
              <button
                key={type}
                onClick={() => add(type)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl ${hoverBg} transition-colors text-center border ${border}`}
              >
                <Ic className="w-5 h-5" style={{ color: tieColor }} />
                <span className={`text-[10px] leading-tight ${isDark ? "text-white/70" : "text-black/60"}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Individual block editor ──────────────────────────────────────────────────
interface BlockEditorProps {
  block: ContentBlock
  idx: number
  total: number
  onChange: (b: ContentBlock) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  tieColor: string
  isDark: boolean
  border: string
  cardBg: string
  hoverBg: string
  textMuted: string
}

function BlockEditor({ block, idx, total, onChange, onRemove, onMove, tieColor, isDark, border, cardBg, hoverBg, textMuted }: BlockEditorProps) {
  const inputCls = `w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none transition-colors ${isDark ? "border-white/10 text-white placeholder:text-white/30 focus:border-white/30" : "border-black/10 text-black placeholder:text-black/30 focus:border-black/30"}`
  const labelCls = `text-xs font-medium mb-1.5 block ${textMuted}`

  function wrap(children: React.ReactNode, label: string) {
    return (
      <div className={`rounded-2xl border ${border} ${cardBg} overflow-hidden`}>
        {/* Block header bar */}
        <div
          className={`flex items-center gap-2 px-3 py-2 border-b ${border}`}
          style={{ backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}
        >
          <GripVertical className={`w-4 h-4 flex-shrink-0 ${textMuted}`} />
          <span className="text-xs font-semibold uppercase tracking-wide flex-1" style={{ color: tieColor }}>{label}</span>
          <button
            onClick={() => onMove(-1)}
            disabled={idx === 0}
            className={`p-1.5 rounded-lg ${hoverBg} disabled:opacity-25 transition-colors`}
            title="Вверх"
          >
            <ChevronUp className="w-3.5 h-3.5" style={{ color: isDark ? "#fff" : "#000" }} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={idx === total - 1}
            className={`p-1.5 rounded-lg ${hoverBg} disabled:opacity-25 transition-colors`}
            title="Вниз"
          >
            <ChevronDown className="w-3.5 h-3.5" style={{ color: isDark ? "#fff" : "#000" }} />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
            title="Удалить блок"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
        {/* Block content */}
        <div className="p-3">
          {children}
        </div>
      </div>
    )
  }

  // ── HEADING ──────────────────────────────────────────────────────────────────
  if (block.type === "heading") return wrap(
    <div className="space-y-2">
      <div className="flex gap-2">
        {([1, 2, 3] as const).map((l) => (
          <button
            key={l}
            onClick={() => onChange({ ...block, level: l })}
            className={`px-3 py-1 rounded-lg text-sm font-bold border transition-colors ${block.level === l ? "text-white" : `${isDark ? "text-white/50 border-white/10" : "text-black/40 border-black/10"}`}`}
            style={block.level === l ? { backgroundColor: tieColor, borderColor: tieColor } : {}}
          >H{l}</button>
        ))}
      </div>
      <input
        className={inputCls}
        value={block.text}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        placeholder="Текст заголовка"
      />
    </div>,
    "Заголовок"
  )

  // ── TEXT ─────────────────────────────────────────────────────────────────────
  if (block.type === "text") return wrap(
    <textarea
      className={`${inputCls} min-h-24 resize-y`}
      value={block.text}
      onChange={(e) => onChange({ ...block, text: e.target.value })}
      placeholder="Текст параграфа..."
    />,
    "Текст"
  )

  // ── ACCORDION ────────────────────────────────────────────────────────────────
  if (block.type === "accordion") {
    // Migrate legacy single-item format
    const items: AccordionItem[] = block.items && block.items.length > 0
      ? block.items
      : [{ id: `acc-${Date.now()}`, title: block.title ?? "Пункт 1", body: block.body ?? "" }]

    const updateItem = (i: number, patch: Partial<AccordionItem>) => {
      const next = items.map((it, idx) => idx === i ? { ...it, ...patch } : it)
      onChange({ ...block, items: next })
    }

    const removeItem = (i: number) => {
      if (items.length <= 1) return
      onChange({ ...block, items: items.filter((_, j) => j !== i) })
    }

    const addItem = () => {
      onChange({ ...block, items: [...items, newAccordionItem()] })
    }

    return wrap(
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.id} className={`rounded-xl border ${border} overflow-hidden`}>
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${border}`}
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
              <span className={`text-xs font-semibold flex-1 ${textMuted}`}>Пункт {i + 1}</span>
              {items.length > 1 && (
                <button
                  onClick={() => removeItem(i)}
                  className="p-1 rounded hover:bg-red-500/20 transition-colors"
                  title="Удалить пункт"
                >
                  <X className="w-3 h-3 text-red-500" />
                </button>
              )}
            </div>
            <div className="p-2.5 space-y-2">
              <div>
                <span className={labelCls}>Заголовок пункта</span>
                <input
                  className={inputCls}
                  value={item.title}
                  onChange={(e) => updateItem(i, { title: e.target.value })}
                  placeholder="Заголовок..."
                />
              </div>
              <div>
                <span className={labelCls}>Содержимое пункта</span>
                <textarea
                  className={`${inputCls} min-h-20 resize-y`}
                  value={item.body}
                  onChange={(e) => updateItem(i, { body: e.target.value })}
                  placeholder="Текст, который будет виден при раскрытии..."
                />
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={addItem}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-dashed ${isDark ? "border-white/20 text-white/50 hover:text-white hover:border-white/40" : "border-black/20 text-black/40 hover:text-black hover:border-black/40"} transition-colors w-full justify-center`}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Добавить пункт
        </button>
      </div>,
      "Аккордеон"
    )
  }

  // ── COPYABLE ─────────────────────────────────────────────────────────────────
  if (block.type === "copyable") return wrap(
    <div className="space-y-2">
      <div>
        <span className={labelCls}>Метка</span>
        <input
          className={inputCls}
          value={block.label}
          onChange={(e) => onChange({ ...block, label: e.target.value })}
          placeholder="Название команды / строки"
        />
      </div>
      <div>
        <span className={labelCls}>Значение для копирования</span>
        <textarea
          className={`${inputCls} min-h-16 resize-y font-mono`}
          value={block.value}
          onChange={(e) => onChange({ ...block, value: e.target.value })}
          placeholder="Текст который скопируется при нажатии кнопки..."
        />
      </div>
    </div>,
    "Копирование"
  )

  // ── IMAGE ─────────────────────────────────────────────────────────────────────
  if (block.type === "image") return wrap(
    <div className="space-y-2">
      <div>
        <span className={labelCls}>URL изображения</span>
        <input
          className={inputCls}
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
          placeholder="https://..."
        />
      </div>
      <div>
        <span className={labelCls}>Подпись (необязательно)</span>
        <input
          className={inputCls}
          value={block.caption ?? ""}
          onChange={(e) => onChange({ ...block, caption: e.target.value })}
          placeholder="Описание изображения"
        />
      </div>
      {block.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.url} alt={block.caption ?? ""} className="rounded-lg max-h-48 object-contain border border-white/10" />
      )}
    </div>,
    "Изображение"
  )

  // ── TABLE ─────────────────────────────────────────────────────────────────────
  if (block.type === "table") return wrap(
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "+ Колонка", action: () => onChange({ ...block, headers: [...block.headers, `Колонка ${block.headers.length + 1}`], rows: block.rows.map((r) => [...r, ""]) }) },
          { label: "+ Строка",  action: () => onChange({ ...block, rows: [...block.rows, block.headers.map(() => "")] }) },
          ...(block.headers.length > 1 ? [{ label: "- Колонка", action: () => onChange({ ...block, headers: block.headers.slice(0, -1), rows: block.rows.map((r) => r.slice(0, -1)) }), danger: true }] : []),
          ...(block.rows.length > 1   ? [{ label: "- Строка",  action: () => onChange({ ...block, rows: block.rows.slice(0, -1) }), danger: true }] : []),
        ].map(({ label, action, danger }) => (
          <Button
            key={label}
            size="sm"
            variant="outline"
            onClick={action}
            className={`text-xs h-7 bg-transparent ${danger ? `text-red-500 ${isDark ? "border-white/10" : "border-black/10"}` : isDark ? "border-white/10 text-white/70" : "border-black/10 text-black/60"}`}
          >{label}</Button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {block.headers.map((h, ci) => (
                <th key={ci} className={`border ${isDark ? "border-white/10" : "border-black/10"} p-1`}>
                  <input
                    className={inputCls}
                    value={h}
                    onChange={(e) => {
                      const headers = [...block.headers]
                      headers[ci] = e.target.value
                      onChange({ ...block, headers })
                    }}
                    placeholder={`Заголовок ${ci + 1}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className={`border ${isDark ? "border-white/10" : "border-black/10"} p-1`}>
                    <input
                      className={inputCls}
                      value={cell}
                      onChange={(e) => {
                        const rows = block.rows.map((r, i) =>
                          i === ri ? r.map((c, j) => j === ci ? e.target.value : c) : r
                        )
                        onChange({ ...block, rows })
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    "Таблица"
  )

  // ── LINK ──────────────────────────────────────────────────────────────────────
  if (block.type === "link") return wrap(
    <div className="space-y-2">
      <div>
        <span className={labelCls}>Текст кнопки</span>
        <input
          className={inputCls}
          value={block.label}
          onChange={(e) => onChange({ ...block, label: e.target.value })}
          placeholder="Перейти к..."
        />
      </div>
      <div>
        <span className={labelCls}>URL</span>
        <input
          className={inputCls}
          value={block.href}
          onChange={(e) => onChange({ ...block, href: e.target.value })}
          placeholder="https://..."
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!!block.external}
          onChange={(e) => onChange({ ...block, external: e.target.checked })}
          className="rounded"
        />
        <span className={`text-xs ${isDark ? "text-white/60" : "text-black/60"}`}>Открывать в новой вкладке</span>
      </label>
    </div>,
    "Ссылка"
  )

  // ── DIVIDER ───────────────────────────────────────────────────────────────────
  if (block.type === "divider") return wrap(
    <hr className={`border ${isDark ? "border-white/20" : "border-black/10"} my-1`} />,
    "Разделитель"
  )

  // ── CALLOUT ───────────────────────────────────────────────────────────────────
  if (block.type === "callout") {
    const variantColors: Record<string, string> = {
      info: "#3b82f6", warning: "#f59e0b", danger: "#ef4444", success: "#22c55e"
    }
    const variantLabels: Record<string, string> = {
      info: "Инфо", warning: "Внимание", danger: "Опасность", success: "Успех"
    }
    return wrap(
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          {(["info", "warning", "danger", "success"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onChange({ ...block, variant: v })}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${block.variant === v ? "text-white" : `${isDark ? "text-white/40 border-white/10" : "text-black/40 border-black/10"}`}`}
              style={block.variant === v ? { backgroundColor: variantColors[v], borderColor: "transparent" } : {}}
            >{variantLabels[v]}</button>
          ))}
        </div>
        <div>
          <span className={labelCls}>Заголовок (необязательно)</span>
          <input
            className={inputCls}
            value={block.title ?? ""}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            placeholder="Заголовок блока"
          />
        </div>
        <div>
          <span className={labelCls}>Текст</span>
          <textarea
            className={`${inputCls} min-h-16 resize-y`}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="Текст выделенного блока..."
          />
        </div>
      </div>,
      "Выделение"
    )
  }

  // ── CODE ──────────────────────────────────────────────────────────────────────
  if (block.type === "code") return wrap(
    <div className="space-y-2">
      <div>
        <span className={labelCls}>Язык (например: bash, sql, python)</span>
        <input
          className={inputCls}
          value={block.language ?? ""}
          onChange={(e) => onChange({ ...block, language: e.target.value })}
          placeholder="bash"
        />
      </div>
      <div>
        <span className={labelCls}>Код</span>
        <textarea
          className={`${inputCls} min-h-28 resize-y font-mono text-xs`}
          value={block.code}
          onChange={(e) => onChange({ ...block, code: e.target.value })}
          placeholder="# Введите код..."
        />
      </div>
    </div>,
    "Код"
  )

  // ── LIST ──────────────────────────────────────────────────────────────────────
  if (block.type === "list") return wrap(
    <div className="space-y-2">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={block.ordered}
          onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
        />
        <span className={`text-xs ${isDark ? "text-white/60" : "text-black/60"}`}>Нумерованный список</span>
      </label>
      <div className="space-y-1.5">
        {block.items.map((item, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className={`text-xs w-6 flex-shrink-0 ${textMuted}`}>{block.ordered ? `${i + 1}.` : "•"}</span>
            <input
              className={`${inputCls} flex-1`}
              value={item}
              onChange={(e) => {
                const items = [...block.items]
                items[i] = e.target.value
                onChange({ ...block, items })
              }}
              placeholder={`Пункт ${i + 1}`}
            />
            {block.items.length > 1 && (
              <button
                onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
                className="p-1.5 rounded-lg hover:bg-red-500/20 flex-shrink-0 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange({ ...block, items: [...block.items, ""] })}
        className={`text-xs h-7 bg-transparent ${isDark ? "border-white/10 text-white/70" : "border-black/10 text-black/60"}`}
      >
        + Пункт
      </Button>
    </div>,
    "Список"
  )

  // ── STEPS ─────────────────────────────────────────────────────────────────────
  if (block.type === "steps") return wrap(
    <div className="space-y-2">
      {block.steps.map((step, i) => (
        <div key={i} className={`flex gap-3 p-2.5 rounded-xl border ${border}`}>
          <span
            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
            style={{ backgroundColor: tieColor }}
          >{i + 1}</span>
          <div className="flex-1 space-y-1.5">
            <input
              className={inputCls}
              value={step.title}
              onChange={(e) => {
                const steps = [...block.steps]
                steps[i] = { ...steps[i], title: e.target.value }
                onChange({ ...block, steps })
              }}
              placeholder="Название шага"
            />
            <textarea
              className={`${inputCls} min-h-14 resize-y text-xs`}
              value={step.description ?? ""}
              onChange={(e) => {
                const steps = [...block.steps]
                steps[i] = { ...steps[i], description: e.target.value }
                onChange({ ...block, steps })
              }}
              placeholder="Описание шага (необязательно)..."
            />
          </div>
          {block.steps.length > 1 && (
            <button
              onClick={() => onChange({ ...block, steps: block.steps.filter((_, j) => j !== i) })}
              className="p-1.5 rounded-lg hover:bg-red-500/20 self-start flex-shrink-0 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
          )}
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange({ ...block, steps: [...block.steps, { title: `Шаг ${block.steps.length + 1}`, description: "" }] })}
        className={`text-xs h-7 bg-transparent ${isDark ? "border-white/10 text-white/70" : "border-black/10 text-black/60"}`}
      >
        + Шаг
      </Button>
    </div>,
    "Шаги"
  )

  // ── BADGE ROW ─────────────────────────────────────────────────────────────────
  if (block.type === "badge_row") return wrap(
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {block.badges.map((badge, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              className={`${inputCls} w-28 py-1 px-2 text-xs`}
              value={badge.label}
              onChange={(e) => {
                const badges = [...block.badges]
                badges[i] = { ...badges[i], label: e.target.value }
                onChange({ ...block, badges })
              }}
              placeholder="Текст бейджа"
            />
            {block.badges.length > 1 && (
              <button
                onClick={() => onChange({ ...block, badges: block.badges.filter((_, j) => j !== i) })}
                className="p-1 rounded-lg hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-3 h-3 text-red-500" />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange({ ...block, badges: [...block.badges, { label: "Тег", color: "" }] })}
        className={`text-xs h-7 bg-transparent ${isDark ? "border-white/10 text-white/70" : "border-black/10 text-black/60"}`}
      >
        + Бейдж
      </Button>
    </div>,
    "Бейджи"
  )

  return null
}
