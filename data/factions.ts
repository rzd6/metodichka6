/**
 * Дерево фракций для приказа о межфракционном мероприятии.
 * У родителя с подразделениями выбор родителя выбирает все подразделения,
 * и выбор всех подразделений автоматически отмечает родителя (см. orders-section.tsx).
 */

export interface FactionNode {
  id: string
  label: string
  /** Цвет индикатора-квадрата */
  color: string
  /** Скруглённые углы у индикатора (используется у ГУВД) */
  rounded?: boolean
  children?: FactionNode[]
}

export const FACTIONS: FactionNode[] = [
  {
    id: "mo",
    label: "МО",
    color: "#22c55e",
  },
  {
    id: "mz",
    label: "МЗ",
    color: "#ef4444",
    children: [
      { id: "mz-privolzhsk", label: "ЦГБ г. Приволжска", color: "#ef4444" },
      { id: "mz-mirny", label: "ОКБ г. Мирного", color: "#ef4444" },
      { id: "mz-nevsky", label: "ЦГБ г. Невского", color: "#ef4444" },
    ],
  },
  {
    id: "gibdd",
    label: "ГИБДД",
    color: "#0ea5e9",
    children: [
      { id: "gibdd-privolzhsk", label: "ГИБДД г. Приволжска", color: "#0ea5e9" },
      { id: "gibdd-mirny", label: "ГИБДД г. Мирного", color: "#0ea5e9" },
      { id: "gibdd-nevsky", label: "ГИБДД г. Невского", color: "#0ea5e9" },
    ],
  },
  {
    id: "guvd",
    label: "ГУВД",
    color: "#2563eb",
    rounded: true,
    children: [
      { id: "guvd-privolzhsk", label: "ГУВД г. Приволжска", color: "#2563eb", rounded: true },
      { id: "guvd-mirny", label: "ГУВД г. Мирного", color: "#2563eb", rounded: true },
      { id: "guvd-nevsky", label: "ГУВД г. Невского", color: "#2563eb", rounded: true },
    ],
  },
]

/** Плоский список всех id (родители + подразделения), для инициализации состояния выбора */
export const ALL_FACTION_IDS: string[] = FACTIONS.flatMap((f) => [f.id, ...(f.children?.map((c) => c.id) ?? [])])

/**
 * Преобразует выбранные id фракций в список названий для вставки в текст приказа.
 * Если у родителя выбраны все подразделения (а значит и сам родитель — см. логику
 * синхронизации в orders-section.tsx), в список попадает только название родителя,
 * без перечисления каждого подразделения.
 */
export function resolveFactionLabels(selectedIds: string[]): string[] {
  const idSet = new Set(selectedIds)
  const labels: string[] = []
  for (const node of FACTIONS) {
    if (!node.children || node.children.length === 0) {
      if (idSet.has(node.id)) labels.push(node.label)
      continue
    }
    if (idSet.has(node.id)) {
      labels.push(node.label)
    } else {
      for (const child of node.children) {
        if (idSet.has(child.id)) labels.push(child.label)
      }
    }
  }
  return labels
}
