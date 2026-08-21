"use client"

import { useEffect, useMemo, useState } from "react"
import {
  FileCheck,
  Copy,
  Check,
  ChevronsUpDown,
  HelpCircle,
  RotateCcw,
  Pencil,
  AlertTriangle,
  CalendarIcon,
} from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import { BugReportButton } from "@/components/bug-report-button"
import { clipboardCopy } from "@/lib/clipboard"
import { getThemeColor } from "@/lib/theme-utils"
import { getOrderSignerName, setOrderSignerName, getSignerPosition, ORDER_SIGNER_NAME_EVENT } from "@/lib/order-signer"
import { getAllUsers, type User } from "@/data/users"
import { POSITIONS_BY_ROLE } from "@/data/roles"
import {
  ORDER_CATEGORIES,
  getOrdersByCategory,
  formatPlainDate,
  type OrderCategoryId,
  type OrderFieldDef,
  type OrderTemplate,
} from "@/data/order-templates"
import { PSGO_URZD_VIOLATIONS, OCHS_VIOLATIONS, type ViolationItem } from "@/data/violations"
import { FACTIONS } from "@/data/factions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Все должности всех отделов, кроме тех.администратора — для повышения/перевода */
const ALL_POSITIONS: string[] = Array.from(
  new Set(
    Object.entries(POSITIONS_BY_ROLE)
      .filter(([role]) => role !== "Тех. Администратор")
      .flatMap(([, positions]) => positions)
  )
)

const BAN_DAY_CHIPS = [30, 60, 90, 999]

type FieldValues = Record<string, any>

function isFieldFilled(field: OrderFieldDef, value: any): boolean {
  switch (field.kind) {
    case "user":
    case "select":
    case "positionSearch":
      return typeof value === "string" && value.length > 0
    case "violationSearch":
    case "ochsSearch":
      return !!value && typeof value === "object" && typeof value.code === "string"
    case "positionNumber":
      return value !== undefined && value !== null && value !== ""
    case "banDaysChips":
      return typeof value === "number" && value > 0
    case "date":
    case "eventDate":
      return value instanceof Date
    case "time":
      return typeof value === "string" && /^\d{2}:\d{2}$/.test(value)
    case "factions":
      return Array.isArray(value) && value.length > 0
    case "number":
      return value !== undefined && value !== null && value !== "" && Number(value) > 0
    case "text":
      return typeof value === "string" && value.trim().length > 0
    default:
      return false
  }
}

export function OrdersSection() {
  const { theme } = useTheme()
  const getTieColor = () => getThemeColor(theme.colorTheme)
  const isDark = theme.mode === "dark"

  const [selectedCategory, setSelectedCategory] = useState<OrderCategoryId>("disciplinary")
  const [users, setUsers] = useState<User[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [valuesByOrder, setValuesByOrder] = useState<Record<string, FieldValues>>({})

  const [signerName, setSignerName] = useState("")
  const [signerPosition, setSignerPosition] = useState("")
  const [editingSigner, setEditingSigner] = useState(false)
  const [signerDraft, setSignerDraft] = useState("")

  useEffect(() => {
    getAllUsers().then(setUsers)
    setSignerName(getOrderSignerName())
    setSignerPosition(getSignerPosition())

    const onSignerUpdate = () => setSignerName(getOrderSignerName())
    const onUserUpdate = () => setSignerPosition(getSignerPosition())
    window.addEventListener(ORDER_SIGNER_NAME_EVENT, onSignerUpdate)
    window.addEventListener("userDataUpdated", onUserUpdate)
    return () => {
      window.removeEventListener(ORDER_SIGNER_NAME_EVENT, onSignerUpdate)
      window.removeEventListener("userDataUpdated", onUserUpdate)
    }
  }, [])

  const signerLine = `[${signerPosition || "Должность"} | ${signerName || "Имя Фамилия"}]`

  const handleSaveSigner = () => {
    setOrderSignerName(signerDraft.trim())
    setEditingSigner(false)
  }

  const getValues = (orderId: string): FieldValues => valuesByOrder[orderId] ?? {}

  const setFieldValue = (orderId: string, fieldId: string, value: any) => {
    setValuesByOrder((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] ?? {}), [fieldId]: value },
    }))
  }

  const resetOrderValues = (orderId: string) => {
    setValuesByOrder((prev) => ({ ...prev, [orderId]: {} }))
  }

  const isOrderComplete = (template: OrderTemplate) => {
    const values = getValues(template.id)
    return template.fields.every((f) => isFieldFilled(f, values[f.id]))
  }

  const handleCopy = (template: OrderTemplate) => {
    if (!signerName.trim() || !isOrderComplete(template)) return
    const values = getValues(template.id)
    const body = template.build({ values, users })
    const text = `${signerLine}\n«${template.title}»\n\n${body}`
    clipboardCopy(text)
    setCopiedId(template.id)
    setTimeout(() => setCopiedId((cur) => (cur === template.id ? null : cur)), 2000)
    resetOrderValues(template.id)
  }

  const cardClass = isDark ? "bg-[#0f1419]/50 border-white/10" : "bg-white border-gray-200"
  const mutedText = isDark ? "text-white/60" : "text-gray-500"
  const labelText = isDark ? "text-white/80" : "text-gray-700"

  return (
    <div className="space-y-6 opacity-95">
      <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: getTieColor() + "40" }}>
        <div
          className="p-3 rounded-xl"
          style={{ background: `linear-gradient(135deg, ${getTieColor()}20, ${getTieColor()}10)` }}
        >
          <FileCheck className="w-6 h-6" style={{ color: getTieColor() }} />
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-bold" style={{ color: getTieColor() }}>
            Приказы
          </h2>
          <p className={`text-sm ${mutedText}`}>Заполните пропуски — скопировать можно только готовый приказ</p>
        </div>
        <BugReportButton sectionLabel="Приказы" />
      </div>

      {/* Постоянный блок [Должность | Имя Фамилия] */}
      <div className={`rounded-2xl border-2 p-4 flex items-center gap-4 flex-wrap ${cardClass}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-xs mb-1 ${mutedText}`}>Постоянный блок подписи (не сбрасывается при копировании)</p>
          {editingSigner ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-mono text-sm ${labelText}`}>[{signerPosition || "Должность"} |</span>
              <Input
                autoFocus
                value={signerDraft}
                onChange={(e) => setSignerDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSaveSigner()
                  if (e.key === "Escape") setEditingSigner(false)
                }}
                placeholder="Имя Фамилия"
                className="h-8 w-48"
              />
              <span className={`font-mono text-sm ${labelText}`}>]</span>
              <Button size="sm" onClick={handleSaveSigner} style={{ backgroundColor: getTieColor() }} className="text-white">
                Сохранить
              </Button>
            </div>
          ) : (
            <p className={`font-mono text-sm font-semibold ${signerName ? labelText : "text-red-500"}`}>
              {signerLine}
            </p>
          )}
        </div>
        {!editingSigner && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSignerDraft(signerName)
              setEditingSigner(true)
            }}
            className="gap-2 flex-shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            Изменить
          </Button>
        )}
      </div>

      {!signerName && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Укажите Имя Фамилию выше (или в настройках → Аккаунт), чтобы копирование приказов стало доступно.
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        {ORDER_CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 border-2 ${
              selectedCategory === category.id
                ? "text-white shadow-lg"
                : isDark
                  ? "bg-[#0f1419]/50 border-white/10 text-white/70 hover:border-white/30"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
            style={
              selectedCategory === category.id ? { backgroundColor: getTieColor(), borderColor: getTieColor() } : {}
            }
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {getOrdersByCategory(selectedCategory).map((template) => {
          const values = getValues(template.id)
          const complete = isOrderComplete(template)
          const canCopy = complete && !!signerName.trim()
          const preview = `${signerLine}\n«${template.title}»\n\n${template.build({ values, users })}`

          return (
            <div key={template.id} className={`border-2 rounded-2xl overflow-hidden p-6 ${cardClass}`}>
              <div className="flex items-center gap-3 mb-4">
                <FileCheck className="w-5 h-5" style={{ color: getTieColor() }} />
                <span className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{template.title}</span>
              </div>

              <div className="mb-4 p-4 rounded-xl bg-muted/50 space-y-3">
                <p className="text-sm font-medium mb-2">Заполните поля:</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {template.fields.map((field) => (
                    <FieldControl
                      key={field.id}
                      field={field}
                      value={values[field.id]}
                      onChange={(v) => setFieldValue(template.id, field.id, v)}
                      users={users}
                      isDark={isDark}
                      tieColor={getTieColor()}
                    />
                  ))}
                </div>
              </div>

              <div
                className={`w-full p-4 rounded-xl border-2 mb-3 ${
                  isDark
                    ? "bg-gradient-to-r from-[#0f1419]/80 to-[#0f1419]/60 border-white/10"
                    : "bg-gradient-to-r from-white/80 to-gray-50/60 border-gray-200"
                }`}
                style={{ borderLeftWidth: "4px", borderLeftColor: getTieColor() }}
              >
                <p className={`text-sm whitespace-pre-wrap ${isDark ? "text-white/90" : "text-gray-900"}`}>
                  {preview}
                </p>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block">
                    <button
                      onClick={() => handleCopy(template)}
                      disabled={!canCopy}
                      className="w-full h-11 rounded-xl font-medium flex items-center justify-center gap-2 text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: getTieColor() }}
                    >
                      {copiedId === template.id ? (
                        <>
                          <Check className="w-4 h-4" />
                          Скопировано
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Скопировать
                        </>
                      )}
                    </button>
                  </span>
                </TooltipTrigger>
                {!canCopy && (
                  <TooltipContent>
                    {!signerName.trim() ? "Укажите Имя Фамилию в блоке подписи выше" : "Заполните все поля"}
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Рендер контролов по типу поля                                       */
/* ------------------------------------------------------------------ */

function FieldControl({
  field,
  value,
  onChange,
  users,
  isDark,
  tieColor,
}: {
  field: OrderFieldDef
  value: any
  onChange: (v: any) => void
  users: User[]
  isDark: boolean
  tieColor: string
}) {
  switch (field.kind) {
    case "user":
      return (
        <FieldWrapper label={field.label}>
          <UserCombobox value={value} onChange={onChange} users={users} />
        </FieldWrapper>
      )
    case "select":
      return (
        <FieldWrapper label={field.label} hint={field.hint}>
          <Select value={value ?? undefined} onValueChange={onChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Выберите..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      )
    case "violationSearch":
      return (
        <FieldWrapper label={field.label} full>
          <ViolationCombobox
            items={PSGO_URZD_VIOLATIONS}
            value={value}
            onChange={onChange}
            getLabel={(v) => `${v.code} ${v.source} — ${v.label}`}
          />
        </FieldWrapper>
      )
    case "ochsSearch":
      return (
        <FieldWrapper label={field.label} full>
          <ViolationCombobox
            items={OCHS_VIOLATIONS}
            value={value}
            onChange={onChange}
            getLabel={(v) => `${v.code} — ${v.label}`}
          />
        </FieldWrapper>
      )
    case "positionNumber":
      return (
        <FieldWrapper label={`${field.label}: 0..${field.max}`}>
          <Select
            value={value !== undefined && value !== null ? String(value) : undefined}
            onValueChange={(v) => onChange(Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: (field.max ?? 0) + 1 }, (_, i) => i).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      )
    case "banDaysChips":
      return (
        <FieldWrapper label={field.label} full>
          <div className="flex items-center gap-2 flex-wrap">
            {BAN_DAY_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => onChange((value ?? 0) + chip)}
                className="px-3 h-8 rounded-lg border text-sm font-medium hover:opacity-80 transition-opacity"
                style={{ borderColor: tieColor, color: tieColor }}
              >
                +{chip}
              </button>
            ))}
            <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
              Итого: {value ?? 0} дней
            </span>
            {!!value && (
              <button
                type="button"
                onClick={() => onChange(0)}
                className={`inline-flex items-center gap-1 text-xs ${isDark ? "text-white/50" : "text-gray-400"} hover:opacity-80`}
              >
                <RotateCcw className="w-3 h-3" />
                Сбросить
              </button>
            )}
          </div>
        </FieldWrapper>
      )
    case "date":
    case "eventDate":
      return (
        <FieldWrapper label={field.label}>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                <CalendarIcon className="w-4 h-4" />
                {value instanceof Date ? formatPlainDate(value) : "Выберите дату"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={value instanceof Date ? value : undefined} onSelect={onChange} />
            </PopoverContent>
          </Popover>
        </FieldWrapper>
      )
    case "positionSearch":
      return (
        <FieldWrapper label={field.label} full>
          <PositionCombobox value={value} onChange={onChange} />
        </FieldWrapper>
      )
    case "time":
      return (
        <FieldWrapper label={field.label}>
          <input
            type="time"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "w-full h-9 rounded-md border px-3 text-sm outline-none",
              isDark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-300 text-black"
            )}
          />
        </FieldWrapper>
      )
    case "factions":
      return (
        <FieldWrapper label={field.label} full>
          <FactionsPicker value={value ?? []} onChange={onChange} isDark={isDark} />
        </FieldWrapper>
      )
    case "number":
      return (
        <FieldWrapper label={field.label}>
          <Input
            type="number"
            min={1}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </FieldWrapper>
      )
    case "text":
      return (
        <FieldWrapper label={field.label}>
          <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
        </FieldWrapper>
      )
    default:
      return null
  }
}

function FieldWrapper({
  label,
  hint,
  full,
  children,
}: {
  label: string
  hint?: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>
      <Label className="text-xs flex items-center gap-1.5">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="w-3.5 h-3.5 opacity-60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </Label>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Комбобоксы                                                           */
/* ------------------------------------------------------------------ */

function UserCombobox({
  value,
  onChange,
  users,
}: {
  value: string | undefined
  onChange: (v: string) => void
  users: User[]
}) {
  const [open, setOpen] = useState(false)
  const selected = users.find((u) => u.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected ? selected.nickname : "Выберите сотрудника"}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Поиск по нику..." />
          <CommandList className="max-h-64">
            <CommandEmpty>Никто не найден</CommandEmpty>
            <CommandGroup>
              {users.map((u) => (
                <CommandItem
                  key={u.id}
                  value={u.nickname}
                  onSelect={() => {
                    onChange(u.id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("w-4 h-4", value === u.id ? "opacity-100" : "opacity-0")} />
                  {u.nickname}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ViolationCombobox<T extends ViolationItem>({
  items,
  value,
  onChange,
  getLabel,
}: {
  items: T[]
  value: T | undefined
  onChange: (v: T) => void
  getLabel: (item: T) => string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate">{value ? getLabel(value) : "Поиск по номеру или формулировке..."}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Например: 3.21 или блат..." />
          <CommandList className="max-h-72">
            <CommandEmpty>Не найдено</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.code}
                  value={`${item.code} ${item.label}`}
                  onSelect={() => {
                    onChange(item)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn("w-4 h-4 flex-shrink-0", value?.code === item.code ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{getLabel(item)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function PositionCombobox({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate">{value || "Поиск должности..."}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Поиск должности..." />
          <CommandList className="max-h-72">
            <CommandEmpty>Не найдено</CommandEmpty>
            <CommandGroup>
              {ALL_POSITIONS.map((pos) => (
                <CommandItem
                  key={pos}
                  value={pos}
                  onSelect={() => {
                    onChange(pos)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("w-4 h-4", value === pos ? "opacity-100" : "opacity-0")} />
                  {pos}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------------ */
/* Выбор фракций (дерево с цветными индикаторами)                      */
/* ------------------------------------------------------------------ */

function FactionsPicker({
  value,
  onChange,
  isDark,
}: {
  value: string[]
  onChange: (v: string[]) => void
  isDark: boolean
}) {
  const selected = new Set(value)

  const toggleParent = (parentId: string, childIds: string[], checked: boolean) => {
    const next = new Set(selected)
    if (checked) {
      next.add(parentId)
      childIds.forEach((id) => next.add(id))
    } else {
      next.delete(parentId)
      childIds.forEach((id) => next.delete(id))
    }
    onChange(Array.from(next))
  }

  const toggleChild = (childId: string, parentId: string, allChildIds: string[], checked: boolean) => {
    const next = new Set(selected)
    if (checked) {
      next.add(childId)
      if (allChildIds.every((id) => next.has(id))) next.add(parentId)
    } else {
      next.delete(childId)
      next.delete(parentId)
    }
    onChange(Array.from(next))
  }

  const toggleSimple = (id: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(id)
    else next.delete(id)
    onChange(Array.from(next))
  }

  return (
    <div className={cn("rounded-lg border p-3 space-y-2", isDark ? "border-white/10" : "border-gray-200")}>
      {FACTIONS.map((node) => {
        const childIds = node.children?.map((c) => c.id) ?? []
        return (
          <div key={node.id} className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selected.has(node.id)}
                onChange={(e) =>
                  childIds.length > 0
                    ? toggleParent(node.id, childIds, e.target.checked)
                    : toggleSimple(node.id, e.target.checked)
                }
                className="accent-current"
              />
              <span
                className={cn("w-3 h-3 inline-block flex-shrink-0", node.rounded ? "rounded-full" : "rounded-sm")}
                style={{ backgroundColor: node.color }}
              />
              <span className={isDark ? "text-white" : "text-gray-900"}>{node.label}</span>
            </label>
            {node.children && (
              <div className="ml-6 space-y-1.5">
                {node.children.map((child) => (
                  <label key={child.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(child.id)}
                      onChange={(e) => toggleChild(child.id, node.id, childIds, e.target.checked)}
                      className="accent-current"
                    />
                    <span
                      className={cn(
                        "w-2.5 h-2.5 inline-block flex-shrink-0",
                        child.rounded ? "rounded-full" : "rounded-sm"
                      )}
                      style={{ backgroundColor: child.color }}
                    />
                    <span className={isDark ? "text-white/80" : "text-gray-700"}>{child.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
