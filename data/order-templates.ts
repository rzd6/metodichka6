import type { User } from "./users"
import { resolveFactionLabels } from "./factions"

/**
 * Структурированные шаблоны приказов для конструктора в orders-section.tsx.
 * Каждый приказ описывает набор полей-контролов и функцию сборки итогового
 * текста приказа (без верхней строки [Должность | Имя Фамилия] и без
 * заголовка «Название приказа» — это добавляет сам компонент раздела).
 */

export type OrderCategoryId =
  | "disciplinary"
  | "dismissal"
  | "hiring"
  | "vacation"
  | "promotion"
  | "events"
  | "bonuses"

export const ORDER_CATEGORIES: { id: OrderCategoryId; label: string }[] = [
  { id: "disciplinary", label: "Дисциплина" },
  { id: "dismissal", label: "Увольнение" },
  { id: "hiring", label: "Приём" },
  { id: "vacation", label: "Отпуск" },
  { id: "promotion", label: "Повышение" },
  { id: "events", label: "Мероприятия" },
  { id: "bonuses", label: "Премии" },
]

export type OrderFieldKind =
  /** Комбобокс выбора сотрудника из активных аккаунтов */
  | "user"
  /** Обычный select с фиксированным набором options */
  | "select"
  /** Поиск по объединённому списку ПСГО + УРЖД */
  | "violationSearch"
  /** Поиск по списку пунктов ОЧС */
  | "ochsSearch"
  /** Select числа 0..max (текущее положение сотрудника) */
  | "positionNumber"
  /** Складываемые чипсы дней бана (30/60/90/999) */
  | "banDaysChips"
  /** Обычная дата (дд.мм.гггг) */
  | "date"
  /** «Умная» дата мероприятия (Сегодня/Завтра/Послезавтра/дд.мм.гггг) */
  | "eventDate"
  /** Поиск по полному списку должностей */
  | "positionSearch"
  /** Время чч:мм */
  | "time"
  /** Множественный выбор фракций (дерево) */
  | "factions"
  /** Числовое поле */
  | "number"
  /** Текстовое поле */
  | "text"

export interface OrderFieldDef {
  id: string
  kind: OrderFieldKind
  label: string
  /** Для kind === "select" */
  options?: { value: string; label: string }[]
  /** Для kind === "positionNumber" */
  max?: number
  /** Подсказка (иконка "?" рядом с полем) */
  hint?: string
  /** Placeholder для number/text */
  placeholder?: string
}

export interface BuildCtx {
  values: Record<string, any>
  users: User[]
}

export interface OrderTemplate {
  id: string
  category: OrderCategoryId
  title: string
  fields: OrderFieldDef[]
  build: (ctx: BuildCtx) => string
}

/* ------------------------------------------------------------------ */
/* Форматирующие помощники                                            */
/* ------------------------------------------------------------------ */

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function formatPlainDate(date: Date): string {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatEventDatePhrase(date: Date): string {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const dayAfterTomorrow = new Date(today)
  dayAfterTomorrow.setDate(today.getDate() + 2)

  const plain = formatPlainDate(date)

  if (isSameDay(date, today)) return `Сегодня, (*${plain}*)`
  if (isSameDay(date, tomorrow)) return `Завтра, (*${plain}*)`
  if (isSameDay(date, dayAfterTomorrow)) return `Послезавтра, (*${plain}*)`
  return `*${plain}*`
}

export function formatTime(value: string): string {
  return value.replace(":", ".")
}

export function formatMoney(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

export function resolveUserMention(userId: string | undefined, users: User[]): string {
  const user = users.find((u) => u.id === userId)
  if (!user) return ""
  if (user.vkId) {
    return `${user.nickname} (https://vk.com/id${user.vkId})`
  }
  return user.nickname
}

function positionStatusLine(values: Record<string, any>): string {
  const up = values.positionUp ?? 0
  const p = values.positionP ?? 0
  const v = values.positionV ?? 0
  return `Текущее положение: УП: ${up}/5 П: ${p}/5 В: ${v}/3`
}

/* ------------------------------------------------------------------ */
/* Общие поля                                                          */
/* ------------------------------------------------------------------ */

const userField: OrderFieldDef = { id: "userId", kind: "user", label: "Сотрудник" }

const positionStatusFields: OrderFieldDef[] = [
  { id: "positionUp", kind: "positionNumber", label: "УП", max: 5 },
  { id: "positionP", kind: "positionNumber", label: "П", max: 5 },
  { id: "positionV", kind: "positionNumber", label: "В", max: 3 },
]

/* ------------------------------------------------------------------ */
/* Шаблоны приказов                                                    */
/* ------------------------------------------------------------------ */

export const ORDER_TEMPLATES: OrderTemplate[] = [
  // ---------------------------------------------------------------- Дисциплина
  {
    id: "disciplinary-reprimand",
    category: "disciplinary",
    title: "Приказ о привлечении к дисциплинарной ответственности",
    fields: [
      userField,
      {
        id: "punishmentType",
        kind: "select",
        label: "Тип наказания",
        options: [
          { value: "warning", label: "Предупреждение" },
          { value: "reprimand", label: "Выговор" },
        ],
      },
      { id: "violation", kind: "violationSearch", label: "Пункт нарушения (ПСГО/УРЖД)" },
      ...positionStatusFields,
    ],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      const isReprimand = values.punishmentType === "reprimand"
      const verb = isReprimand ? "объявлен выговор" : "объявлено предупреждение"
      const violation = values.violation as { code: string; label: string; source: string } | undefined
      const violationText = violation ? `${violation.code} ${violation.source} (${violation.label})` : ""
      return `Сотруднику ${mention} ${verb} за нарушение ${violationText}.\n\n${positionStatusLine(values)}`
    },
  },
  {
    id: "disciplinary-release",
    category: "disciplinary",
    title: "Приказ об освобождении от дисциплинарной ответственности",
    fields: [userField, ...positionStatusFields],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      return `Сотрудник ${mention} снимает выговор по факту его отработки и успешной подачи заявления в соответствующем разделе.\n\n${positionStatusLine(values)}`
    },
  },

  // ---------------------------------------------------------------- Увольнение
  {
    id: "dismissal-own",
    category: "dismissal",
    title: "Приказ об увольнении по собственному желанию",
    fields: [
      userField,
      {
        id: "severance",
        kind: "select",
        label: "Неустойка",
        options: [
          { value: "none", label: "Без неустойки" },
          { value: "reprimand", label: "В связи с неотработанным выговором" },
          { value: "no-promotion", label: "В связи с неотработкой недели и не повышением во фракции" },
        ],
      },
      ...positionStatusFields,
    ],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      let text = `Сотрудник ${mention} уволен из открытого акционерного общества "Республиканские Железные Дороги" по-собственному желанию.`
      if (values.severance === "reprimand") {
        text += ` *В связи с неотработанным выговором оплачена неустойка*.`
      } else if (values.severance === "no-promotion") {
        text += ` *В связи с неотработкой недели и не повышением во фракции оплачена неустойка*.`
      }
      text += ` Всего доброго.`
      return `${text}\n\n${positionStatusLine(values)}`
    },
  },
  {
    id: "dismissal-forced",
    category: "dismissal",
    title: "Приказ о принудительном увольнении",
    fields: [
      userField,
      { id: "ochsViolation", kind: "ochsSearch", label: "Пункт ОЧС" },
      { id: "banDays", kind: "banDaysChips", label: "Дни в ОЧС" },
      ...positionStatusFields,
    ],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      const ochs = values.ochsViolation as { code: string; label: string } | undefined
      const days = values.banDays ?? 0
      return `Сотрудник ${mention} уволен из открытого акционерного общества "Республиканские Железные Дороги" за нарушение пункта ${ochs?.code ?? ""} ОЧС. Занесен в Общий Черный Список на ${days} дней.\n\n${positionStatusLine(values)}`
    },
  },

  // ---------------------------------------------------------------- Приём
  {
    id: "hiring-new",
    category: "hiring",
    title: "Приказ о принятии в организацию",
    fields: [
      userField,
      {
        id: "interviewType",
        kind: "select",
        label: "Тип собеседования",
        options: [
          { value: "открытому", label: "Открытое" },
          { value: "индивидуальному", label: "Индивидуальное" },
        ],
      },
    ],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      return `Сотрудник ${mention} принят в открытое акционерное общество "Республиканские Железные Дороги" по ${values.interviewType ?? ""} собеседованию на должность "Слесарь-электрик". Зачислен в производственно-технический отдел.`
    },
  },
  {
    id: "hiring-restore",
    category: "hiring",
    title: "Приказ о восстановлении в организацию",
    fields: [
      userField,
      {
        id: "reprimandRestored",
        kind: "select",
        label: "Выговор при прошлом увольнении",
        hint:
          "Откройте архив уволенных в гугл-таблице, нажмите ctrl + H и, выбрав определённый диапазон, столбец с банковскими счетами, ищите счёт сотрудника там, в последнем увольнении смотрите сколько было выговоров, и восстанавливаете их. (Исключение: 3+/3 выговора)",
        options: [
          { value: "yes", label: "Выговор был" },
          { value: "no", label: "Выговора не было" },
        ],
      },
    ],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      let text = `Сотрудник ${mention} восстановлен на должность "Помощник машиниста" в связи с успешной подачей заявления на государственном портале и прохождении индивидуального собеседования. Зачислен в центральную дирекцию управления движения.`
      if (values.reprimandRestored === "yes") {
        text += ` *Восстановлен выговор в связи с его наличием при прошлом увольнении (2.9 ПСГО).*`
      }
      return text
    },
  },

  // ---------------------------------------------------------------- Отпуск
  {
    id: "vacation-start",
    category: "vacation",
    title: "Приказ об уходе в отпуск",
    fields: [userField, { id: "vacationDate", kind: "date", label: "Дата окончания отпуска" }],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      const date = values.vacationDate instanceof Date ? formatPlainDate(values.vacationDate) : ""
      return `Сотрудник ${mention} отправлен в отпуск до ${date}.`
    },
  },
  {
    id: "vacation-early-return",
    category: "vacation",
    title: "Приказ о досрочном возвращении из отпуска",
    fields: [userField],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      return `Сотрудник ${mention} досрочно возвращен из отпуска по-собственному желанию. Приступает к выполнению должностных обязанностей.`
    },
  },
  {
    id: "vacation-return",
    category: "vacation",
    title: "Приказ о возвращении из отпуска",
    fields: [userField],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      return `Сотрудник ${mention} возвращен из отпуска. Приступает к выполнению должностных обязанностей.`
    },
  },

  // ---------------------------------------------------------------- Повышение
  {
    id: "promotion-position",
    category: "promotion",
    title: "Приказ о повышении в должности",
    fields: [userField, { id: "position", kind: "positionSearch", label: "Новая должность" }],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      return `Сотрудник ${mention} повышен в должности до "${values.position ?? ""}" в связи с успешной подачей заявления в соответствующем разделе.`
    },
  },
  {
    id: "promotion-transfer-cdud",
    category: "promotion",
    title: "Приказ о повышении в должности и переводе",
    fields: [userField],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      return `Сотрудник ${mention} повышен в должности до "Помощник машиниста" и переведён в центральную дирекцию управления движением в связи с успешной подачей заявления в соответствующем разделе.`
    },
  },
  {
    id: "promotion-internal-transfer",
    category: "promotion",
    title: "Приказ о внутриорганизационном переводе",
    fields: [userField, { id: "position", kind: "positionSearch", label: "Новая должность" }],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      return `Сотрудник ${mention} переведен до должности "${values.position ?? ""}" в связи с успешной подачей заявления в соответствующем разделе.`
    },
  },

  // ---------------------------------------------------------------- Мероприятия
  {
    id: "events-lectures",
    category: "events",
    title: "Приказ о проведении комплекса лекций и мероприятий",
    fields: [
      { id: "eventDate", kind: "eventDate", label: "Дата" },
      { id: "startTime", kind: "time", label: "Время начала" },
      { id: "gatherTime", kind: "time", label: "Время сбора" },
      {
        id: "mandatory",
        kind: "select",
        label: "Обязательность",
        options: [
          { value: "обязательно", label: "Обязательно" },
          { value: "по желанию", label: "По желанию" },
        ],
      },
      {
        id: "bonusPaid",
        kind: "select",
        label: "Премии по окончанию",
        options: [
          { value: "yes", label: "Да" },
          { value: "no", label: "Нет" },
        ],
      },
    ],
    build: ({ values }) => {
      const datePhrase = values.eventDate instanceof Date ? formatEventDatePhrase(values.eventDate) : ""
      const startTime = values.startTime ? formatTime(values.startTime) : ""
      const gatherTime = values.gatherTime ? formatTime(values.gatherTime) : ""
      const bonusSentence = values.bonusPaid === "yes" ? ` *По окончанию будут выплачены премии*.` : ""
      return `${datePhrase} в *${startTime}.* по МСК будет проведен комплекс лекций и мероприятий. Сбор будет происходить в *${gatherTime}* в актовом зале. Присутствие сотрудников на смене ${values.mandatory ?? ""}.${bonusSentence}`
    },
  },
  {
    id: "events-interfaction",
    category: "events",
    title: "Приказ о проведении межфракционного мероприятия",
    fields: [
      { id: "eventDate", kind: "eventDate", label: "Дата" },
      { id: "startTime", kind: "time", label: "Время начала" },
      { id: "gatherTime", kind: "time", label: "Время сбора" },
      { id: "factions", kind: "factions", label: "Фракции" },
      {
        id: "mandatory",
        kind: "select",
        label: "Обязательность",
        options: [
          { value: "обязательно", label: "Обязательно" },
          { value: "по желанию", label: "По желанию" },
        ],
      },
      {
        id: "bonusPaid",
        kind: "select",
        label: "Премии по окончанию",
        options: [
          { value: "yes", label: "Да" },
          { value: "no", label: "Нет" },
        ],
      },
    ],
    build: ({ values }) => {
      const datePhrase = values.eventDate instanceof Date ? formatEventDatePhrase(values.eventDate) : ""
      const startTime = values.startTime ? formatTime(values.startTime) : ""
      const gatherTime = values.gatherTime ? formatTime(values.gatherTime) : ""
      const bonusSentence = values.bonusPaid === "yes" ? ` *По окончанию будут выплачены премии*.` : ""
      const factionLabels = resolveFactionLabels((values.factions as string[] | undefined) ?? [])
      const factionsText = factionLabels.join(", ")
      return `${datePhrase} в *${startTime}.* по МСК будет проведено межфракционное мероприятие с *${factionsText}*. Сбор будет происходить в *${gatherTime}* на парковке. Присутствие сотрудников на смене ${values.mandatory ?? ""}.${bonusSentence}`
    },
  },

  // ---------------------------------------------------------------- Премии
  {
    id: "bonuses-achievement",
    category: "bonuses",
    title: "Приказ о премировании за выполнение достижения",
    fields: [
      userField,
      { id: "amount", kind: "number", label: "Сумма премии (провинциальных рублей)", placeholder: "Например 150000" },
      { id: "reason", kind: "text", label: "Достижение", placeholder: "Например: рекорд по онлайну" },
    ],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      const amount = Number(values.amount ?? 0)
      return `Сотруднику ${mention} будет выплачена премия в размере ${formatMoney(amount)} провинциальных рублей за выполнение достижения "${values.reason ?? ""}".`
    },
  },
  {
    id: "bonuses-weekly",
    category: "bonuses",
    title: "Приказ о премировании сотрудника",
    fields: [
      userField,
      { id: "amount", kind: "number", label: "Сумма премии (провинциальных рублей)", placeholder: "Например 100000" },
      { id: "reason", kind: "text", label: "Причина", placeholder: "Например: качественную работу за неделю" },
    ],
    build: ({ values, users }) => {
      const mention = resolveUserMention(values.userId, users)
      const amount = Number(values.amount ?? 0)
      return `Сотруднику ${mention} будет выплачена премия в размере ${formatMoney(amount)} провинциальных рублей за ${values.reason ?? ""} (недельную работу).`
    },
  },
]

export function getOrdersByCategory(category: OrderCategoryId): OrderTemplate[] {
  return ORDER_TEMPLATES.filter((t) => t.category === category)
}
