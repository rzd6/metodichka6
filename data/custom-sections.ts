import type { UserRole } from "@/data/roles"

// ─── Block types ──────────────────────────────────────────────────────────────

export type BlockType =
  | "heading"       // Заголовок
  | "text"          // Текстовый параграф
  | "accordion"     // Аккордеон (разворачиваемый блок)
  | "copyable"      // Текст с кнопкой копирования
  | "image"         // Изображение с подписью
  | "table"         // Таблица
  | "link"          // Ссылка-кнопка
  | "divider"       // Разделитель
  | "callout"       // Выделенный блок (подсказка/предупреждение)
  | "code"          // Блок кода / команды
  | "list"          // Список (маркированный или нумерованный)
  | "steps"         // Пронумерованные шаги
  | "badge_row"     // Строка бейджей/тегов

export interface HeadingBlock {
  type: "heading"
  id: string
  text: string
  level: 1 | 2 | 3
  align?: "left" | "center" | "right"
}

export interface TextBlock {
  type: "text"
  id: string
  text: string
  bold?: boolean
  italic?: boolean
  align?: "left" | "center" | "right"
}

export interface AccordionBlock {
  type: "accordion"
  id: string
  title: string
  body: string
}

export interface CopyableBlock {
  type: "copyable"
  id: string
  label: string
  value: string
}

export interface ImageBlock {
  type: "image"
  id: string
  url: string
  caption?: string
  alt?: string
}

export interface TableBlock {
  type: "table"
  id: string
  headers: string[]
  rows: string[][]
}

export interface LinkBlock {
  type: "link"
  id: string
  label: string
  href: string
  external?: boolean
}

export interface DividerBlock {
  type: "divider"
  id: string
}

export interface CalloutBlock {
  type: "callout"
  id: string
  variant: "info" | "warning" | "danger" | "success"
  title?: string
  text: string
}

export interface CodeBlock {
  type: "code"
  id: string
  code: string
  language?: string
}

export interface ListBlock {
  type: "list"
  id: string
  ordered: boolean
  items: string[]
}

export interface StepsBlock {
  type: "steps"
  id: string
  steps: { title: string; description?: string }[]
}

export interface BadgeRowBlock {
  type: "badge_row"
  id: string
  badges: { label: string; color?: string }[]
}

export type ContentBlock =
  | HeadingBlock
  | TextBlock
  | AccordionBlock
  | CopyableBlock
  | ImageBlock
  | TableBlock
  | LinkBlock
  | DividerBlock
  | CalloutBlock
  | CodeBlock
  | ListBlock
  | StepsBlock
  | BadgeRowBlock

// ─── Section ──────────────────────────────────────────────────────────────────

export interface CustomSection {
  id: string
  title: string
  icon: string
  content: ContentBlock[]
  hidden_from_roles: UserRole[]
  is_hidden: boolean          // true = виден только тех. администраторам
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  section_order: number
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface SectionAuditEntry {
  id: string
  section_id: string
  section_title: string
  action: "create" | "update" | "delete" | "toggle_visibility"
  actor_nickname: string
  actor_role: string
  changes: Record<string, { old?: any; new?: any }> | null
  created_at: string
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
  const base = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  })
  return res.json()
}

export async function getCustomSections(): Promise<CustomSection[]> {
  try {
    const json = await apiFetch("/api/custom-sections")
    if (json.error) return []
    return (json.data ?? []).map(rowToSection)
  } catch {
    return []
  }
}

export async function createCustomSection(
  section: Omit<CustomSection, "created_at" | "updated_at">,
  actor: { nickname: string; role: string }
): Promise<CustomSection | null> {
  try {
    const json = await apiFetch("/api/custom-sections", {
      method: "POST",
      body: JSON.stringify({ action: "create", section, actor }),
    })
    if (json.error) return null
    return rowToSection(json.data)
  } catch {
    return null
  }
}

export async function updateCustomSection(
  id: string,
  updates: Partial<Omit<CustomSection, "id" | "created_at" | "created_by">>,
  actor: { nickname: string; role: string },
  oldSection?: CustomSection
): Promise<CustomSection | null> {
  try {
    const json = await apiFetch("/api/custom-sections", {
      method: "POST",
      body: JSON.stringify({ action: "update", id, updates, actor, oldSection }),
    })
    if (json.error) return null
    return rowToSection(json.data)
  } catch {
    return null
  }
}

export async function deleteCustomSection(
  id: string,
  actor: { nickname: string; role: string },
  sectionTitle: string
): Promise<boolean> {
  try {
    const json = await apiFetch("/api/custom-sections", {
      method: "POST",
      body: JSON.stringify({ action: "delete", id, actor, sectionTitle }),
    })
    return !!json.success
  } catch {
    return false
  }
}

export async function toggleCustomSectionVisibility(
  id: string,
  is_hidden: boolean,
  actor: { nickname: string; role: string },
  sectionTitle: string
): Promise<boolean> {
  try {
    const json = await apiFetch("/api/custom-sections", {
      method: "POST",
      body: JSON.stringify({ action: "toggle_visibility", id, is_hidden, actor, sectionTitle }),
    })
    return !!json.success
  } catch {
    return false
  }
}

export async function getSectionAuditLog(): Promise<SectionAuditEntry[]> {
  try {
    const json = await apiFetch("/api/section-audit")
    return json.data ?? []
  } catch {
    return []
  }
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

function rowToSection(row: Record<string, any>): CustomSection {
  return {
    id: String(row.id),
    title: String(row.title),
    icon: String(row.icon ?? "FileText"),
    content: typeof row.content === "string" ? JSON.parse(row.content) : (row.content ?? []),
    hidden_from_roles: row.hidden_from_roles ?? [],
    is_hidden: !!row.is_hidden,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    created_by: String(row.created_by ?? ""),
    updated_by: String(row.updated_by ?? ""),
    section_order: Number(row.section_order ?? 0),
  }
}
