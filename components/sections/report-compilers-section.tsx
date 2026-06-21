"use client"

import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useEffect, useCallback } from "react"
import { Copy, AlertCircle, Train, MapPin, Settings, User, Hash, Check, Clock } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import type { UserRole } from "@/data/users"
import { ROLE_RANK } from "@/data/roles"

// Структура: перегон содержит строки докладов
interface ReportSegment {
  id: string
  title: string        // "Перегон: Депо → Мирный"
  reports: string[]
  // Опоздание применяется к прибытию на конечную станцию перегона
  delayMinutes: number
  isLastSegment?: boolean
}

interface ClaimedShift {
  id: string
  train_number: number
  direction: string
  class: string
  depart_start: string | null
  arrive_end: string | null
  shift_date: string
  delay_minutes: number
}

interface ReportCompilerSectionProps {
  userRole?: UserRole
  userNickname?: string
}

function getMoscowDateISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" })
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  })
  return res.json()
}

export function ReportCompilerSection({ userRole, userNickname }: ReportCompilerSectionProps) {
  // Рейсы пользователя (из расписания)
  const [myShifts, setMyShifts] = useState<ClaimedShift[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return localStorage.getItem("rc_selectedShiftId") ?? null
  })

  const loadMyShifts = useCallback(async () => {
    if (!userNickname) return
    const date = getMoscowDateISO()
    const { data } = await apiFetch(`/api/train-shifts?date=${date}&with_trains=1`)
    if (Array.isArray(data)) {
      setMyShifts(data.filter((s: any) => s.claimed_by_nickname === userNickname))
    }
  }, [userNickname])

  useEffect(() => { loadMyShifts() }, [loadMyShifts])

  const selectedShift = myShifts.find((s) => s.id === selectedShiftId) ?? null

  const [selectedDirection, setSelectedDirection] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [selectedLocomotive, setSelectedLocomotive] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const [locomotiveNumber, setLocomotiveNumber] = useState("")
  const [passNumber, setPassNumber] = useState("")
  const [flightNumber, setFlightNumber] = useState("")
  const [dispatcherName, setDispatcherName] = useState("")
  const [assistantName, setAssistantName] = useState("")

  // Для ТЕХ — генерируется единым списком
  const [generatedReports, setGeneratedReports] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try { return JSON.parse(localStorage.getItem("rc_generatedReports") ?? "[]") } catch { return [] }
  })
  const [generatedWithType, setGeneratedWithType] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return localStorage.getItem("rc_generatedWithType") ?? null
  })
  const [generatedWithRole, setGeneratedWithRole] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return localStorage.getItem("rc_generatedWithRole") ?? null
  })

  // Для обычных рейсов — перегоны
  const [segments, setSegments] = useState<ReportSegment[]>(() => {
    if (typeof window === "undefined") return []
    try { return JSON.parse(localStorage.getItem("rc_segments") ?? "[]") } catch { return [] }
  })
  // Единое поле опоздания (вместо per-segment)
  const [globalDelay, setGlobalDelay] = useState<number>(() => {
    if (typeof window === "undefined") return 0
    return parseInt(localStorage.getItem("rc_globalDelay") ?? "0") || 0
  })

  // Persist state to localStorage so reports survive page refresh
  useEffect(() => { localStorage.setItem("rc_selectedShiftId", selectedShiftId ?? "") }, [selectedShiftId])
  useEffect(() => { localStorage.setItem("rc_segments", JSON.stringify(segments)) }, [segments])
  useEffect(() => { localStorage.setItem("rc_globalDelay", String(globalDelay)) }, [globalDelay])
  useEffect(() => { localStorage.setItem("rc_generatedReports", JSON.stringify(generatedReports)) }, [generatedReports])
  useEffect(() => { localStorage.setItem("rc_generatedWithType", generatedWithType ?? "") }, [generatedWithType])
  useEffect(() => { localStorage.setItem("rc_generatedWithRole", generatedWithRole ?? "") }, [generatedWithRole])

  const [showNotification, setShowNotification] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const { theme } = useTheme()

  const getTieColor = () => getThemeColor(theme.colorTheme)
  const isDark = theme.mode === "dark"

  const selectOption = (type: string, value: string) => {
    switch (type) {
      case "direction": setSelectedDirection(selectedDirection === value ? null : value); break
      case "role": setSelectedRole(selectedRole === value ? null : value); break
      case "locomotive": setSelectedLocomotive(selectedLocomotive === value ? null : value); break
      case "type": setSelectedType(selectedType === value ? null : value); break
      case "category": setSelectedCategory(selectedCategory === value ? null : value); break
    }
  }

  const getLowercaseLocomotive = (locomotive: string) => {
    switch (locomotive) {
      case "Тепловоз ТЭП70БС": return "тепловоз ТЭП70БС"
      case "Электровоз ЭП1": return "электровоз ЭП1"
      case "Паровоз ЛВ": return "паровоз ЛВ"
      default: return locomotive
    }
  }

  const getLowercaseLocomotivePlural = (locomotive: string) => {
    switch (locomotive) {
      case "Тепловоз ТЭП70БС": return "тепловоза ТЭП70БС"
      case "Электровоз ЭП1": return "электровоза ЭП1"
      case "Паровоз ЛВ": return "паровоза ЛВ"
      default: return locomotive
    }
  }

  const generateReport = () => {
    const isTech = selectedCategory === "Технический"
    const isDNC = selectedType === "Рейс с ДНЦ"

    // ТЕХ требует только номер локомотива + тип
    if (isTech) {
      if (!selectedLocomotive || !locomotiveNumber || !flightNumber) {
        setShowNotification(true); setTimeout(() => setShowNotification(false), 2000); return
      }
    } else {
      const requiredFields = selectedDirection && selectedLocomotive && selectedCategory && locomotiveNumber && passNumber && flightNumber
      const hasDispatcherInfo = isDNC ? dispatcherName !== "" && selectedRole !== null : true
      if (!requiredFields || !hasDispatcherInfo) {
        setShowNotification(true); setTimeout(() => setShowNotification(false), 2000); return
      }
    }

    setShowNotification(false)

    const callSign = isTech
      ? `ТЕХ-${flightNumber}`
      : `${selectedCategory === "Пассажирский" ? "П" : "Т"}-${passNumber}-${flightNumber}`

    if (isTech) {
      // ТЕХ — генерируем единый список докладов (технические, без перегонов)
      const techReports: string[] = []
      generateTechReports(techReports, callSign)
      setGeneratedReports(techReports)
      setGeneratedWithType(selectedType)
      setGeneratedWithRole(selectedRole)
      setSegments([])
    } else {
      // Обычный рейс — разбиваем по перегонам
      const newSegments: ReportSegment[] = []

      if (selectedCategory === "Пассажирский") {
        generatePassengerSegments(newSegments, callSign)
      } else if (selectedCategory === "Туристический") {
        generateTouristSegments(newSegments, callSign)
      }

      setSegments(newSegments)
      setGeneratedReports([])
      setGeneratedWithType(selectedType)
      setGeneratedWithRole(selectedRole)
      setGlobalDelay(0)
    }

    // Сброс полей
    setSelectedDirection(null); setSelectedRole(null); setSelectedLocomotive(null)
    setSelectedType(null); setSelectedCategory(null)
    setLocomotiveNumber(""); setPassNumber(""); setFlightNumber("")
    setDispatcherName(""); setAssistantName("")
  }

  // ────────────────────────── ТЕХ ──────────────────────────
  const generateTechReports = (reports: string[], callSign: string) => {
    const loco = selectedLocomotive!
    reports.push(
      `r [ТЕХ] ${loco}-${locomotiveNumber} ${callSign}, технический рейс №${flightNumber}.`,
      `r [ТЕХ] ${loco}-${locomotiveNumber} ${callSign} — выезжаем из депо ТЧЭ-1.`,
      `r [ТЕХ] ${loco}-${locomotiveNumber} ${callSign} — рейс ${flightNumber} завершён, локомотив возвращён в депо.`,
    )
  }

  // ────────────────────────── ПАССАЖИРСКИЙ ПЕРЕГОНЫ ──────────────────────────
  const generatePassengerSegments = (segs: ReportSegment[], callSign: string) => {
    const loco = selectedLocomotive!
    const lowerLoco = getLowercaseLocomotive(loco)
    const lowerLocoPlural = getLowercaseLocomotivePlural(loco)
    const isDNC = selectedType === "Рейс с ДНЦ"
    const assistantText = assistantName.length > 0 ? ` Помощник: ${assistantName}.` : ""

    if (selectedDirection === "Приволжск-Мирный") {
      if (isDNC) {
        const isMachinist = selectedRole === "Машинист"
        const machinistName = isMachinist ? dispatcherName : "Фамилия"

        segs.push({
          id: "seg-depot-priv",
          title: "Перегон: Депо → Приволжск",
          delayMinutes: 0,
          reports: [
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr Машинист ${machinistName}, приняли ${lowerLoco}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
            `cr Заполнили документацию. Магистраль продули, башмаки убрали, состав готов к выезду на линию.`,
            `tr ${passNumber} Понятно, приняли ${lowerLoco}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
            `tr ${passNumber} Заполнили документацию. Магистраль продули, башмаки убрали, ожидайте отправления.`,
            `cr Принято.`,
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Приволжск готов, ЧМ1 лунно-белый.`,
            `cr Принято, выполняю!`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} следует по перегону из депо ТЧЭ-1 до ст. Приволжск.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Приволожск, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Приволожск, ожидайте 1 минуту.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Приволожск, стоянка 1 минута.`,
          ],
        })
        segs.push({
          id: "seg-priv-nevsky",
          title: "Перегон: Приволжск → Невский",
          delayMinutes: 0,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Невский готов, Ч1 два жёлтых, верхний мигающий.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Приволжск на перегон до ст. Невский.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Невский, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Невский, ожидайте 1 минуту.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Невский, стоянка 1 минута.`,
          ],
        })
        segs.push({
          id: "seg-nevsky-mirny",
          title: "Перегон: Невский → Мирный",
          delayMinutes: 0,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Мирный готов, Ч1 зелёный.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Невский на перегон до ст. Мирный.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 2 путь ст. Мирный, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 2 путь ст. Мирный, ожидайте 1 минуту.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 2 путь ст. Мирный, стоянка 1 минута.`,
          ],
        })
        segs.push({
          id: "seg-mirny-depot",
          title: "Перегон: Мирный → Депо",
          delayMinutes: 0,
          isLastSegment: true,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут в депо ТЧЭ-1 готов, ЧМ2 лунно-белый.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Мирный в депо ТЧЭ-1.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1. Рейс № ${flightNumber} окончен, локомотив сдан, машинист ${machinistName}!`,
            `tr ${passNumber} Понятно! Прибыли в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
          ],
        })
      } else {
        // Автономный ��риволжск→Мирный
        segs.push({
          id: "seg-depot-priv",
          title: "Перегон: Депо → Приволжск",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Приняли ${lowerLoco}-${locomotiveNumber} №${flightNumber}, заполнили документацию.`,
            `r [${callSign}] Убираем башмаки, откручиваем ручной, продуваем тормозную магистраль.`,
            `r [${callSign}] Магистраль продули, башмаки убрали, состав готов к выезду на линию.${assistantText}`,
            `r [${callSign}] Вижу ЧМ1 лунно-белый, отправляемся из депо ТЧЭ-1 на перегон до ст. Приволжск…`,
            `r [${callSign}] ...пл. Жуковский без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Приволжск, вижу Ч жёлтый мигающий.`,
            `r [${callSign}] Прибываем под посадку на 1 путь ст. Приволжск.${assistantText}`,
            `r [${callSign}] Прибыли под посадку на 1 путь ст. Приволжск. Интервал: 1 минута.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-priv-nevsky",
          title: "Перегон: Приволжск → Невский",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Вижу, Ч1 два жёлтых, верхний мигающий, отправляемся со ст. Приволжск на перегон до ст. Невский…`,
            `r [${callSign}] ...пл. Азино без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Невский, вижу Ч зелёный.`,
            `r [${callSign}] Прибываем на 1 путь ст. Невский.${assistantText}`,
            `r [${callSign}] Прибыли на 1 путь ст. Невский. Интервал: 1 минута.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-nevsky-mirny",
          title: "Перегон: Невский → Мирный",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Вижу Ч1 зелёный, отправляемся со ст. Невский на перегон до ст. Мирный…`,
            `r [${callSign}] ...пл. 47 км. без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Мирный, вижу, Ч жёлтый.`,
            `r [${callSign}] Прибываем на 2 путь ст. Мирный.${assistantText}`,
            `r [${callSign}] Прибыли на 2 путь ст. Мирный. Интервал: 1 минута.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-mirny-depot",
          title: "Перегон: Мирный → Депо",
          delayMinutes: 0,
          isLastSegment: true,
          reports: [
            `r [${callSign}] Вижу ЧМ2 лунно-белый, отправляемся со ст. Мирный на канаву №2 ТЧЭ-1.${assistantText}`,
            `r [${callSign}] Прибыли в депо на канаву №2. Закрепляем локомотив.`,
            `r [${callSign}] Состав закреплён двумя тормозными башмаками: один с чётной стороны, один с нечётной и одним ручным тормозом.${assistantText}`,
          ],
        })
      }
    } else if (selectedDirection === "Мирный-Приволжск") {
      if (isDNC) {
        const isMachinist = selectedRole === "Машинист"
        const machinistName = isMachinist ? dispatcherName : "Фамилия"

        segs.push({
          id: "seg-depot-mirny",
          title: "Перегон: Депо → Мирный",
          delayMinutes: 0,
          reports: [
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr Машинист ${machinistName}, приняли ${lowerLoco}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
            `cr Заполнили документацию. Магистраль продули, башмаки убрали, состав готов к выезду на линию.`,
            `tr ${passNumber} Понятно, приняли ${lowerLoco}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
            `tr ${passNumber} Заполнили документацию. Магистраль продули, башмаки убрали, ожидайте отправления.`,
            `cr Принято.`,
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Мирный готов, НМ1 лунно-белый.`,
            `cr Принято, выполняю!`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} следует по перегону из депо ТЧЭ-1 до ст. Мирный.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Мирный, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Мирный, ожидайте 1 минуту.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Мирный, стоянка 1 минута.`,
          ],
        })
        segs.push({
          id: "seg-mirny-nevsky",
          title: "Перегон: Мирный → Невский",
          delayMinutes: 0,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Невский готов, Н1 зелёный.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Мирный на перегон до ст. Невский.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 4 путь ст. Невский, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 4 путь ст. Невский, ожидайте 1 минуту.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 4 путь ст. Невский, стоянка 1 минута.`,
          ],
        })
        segs.push({
          id: "seg-nevsky-priv",
          title: "Перегон: Невский → Приволжск",
          delayMinutes: 0,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Приволжск готов, Н4 зелён��й.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Невский на перегон до ст. Приволжск.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 2 путь ст. Приволжск. Машинист: ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 2 путь ст. Приволжск, ожидайте 1 минуту.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 2 путь ст. Приволжск, стоянка 1 минута.`
          ],
        })
        segs.push({
          id: "seg-priv-depot",
          title: "Перегон: Приволжск → Депо",
          delayMinutes: 0,
          isLastSegment: true,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут в депо ТЧЭ-1 готов, Н2 зелёный.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Приволжск в депо ТЧЭ-1.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1. Рейс № ${flightNumber} окончен, локомотив сдан, машинист ${machinistName}!`,
            `tr ${passNumber} Понятно! Прибыли в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
          ],
        })
      } else {
        // Автономный Мирный→Приволжск
        segs.push({
          id: "seg-depot-mirny",
          title: "Перегон: Депо → Мирный",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Приняли ${lowerLoco}-${locomotiveNumber} №${flightNumber}, заполнили документацию.`,
            `r [${callSign}] Убираем башмаки, откручиваем ручной, продуваем тормозную магистраль.`,
            `r [${callSign}] Магистраль продули, башмаки убрали, состав готов к выезду на линию.${assistantText}`,
            `r [${callSign}] Вижу НМ1 лунно-белый, отправляемся из депо ТЧЭ-1 на перегон до ст. Мирный.${assistantText}`,
            `r [${callSign}] Прибыли под посадку на 1 путь ст. Мирный. Интервал: 1 минута.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-mirny-nevsky",
          title: "Перегон: Мирный → Невский",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Вижу Н1 зелёный, отправляемся со ст. Мирный на перегон до ст. Невский,..`,
            `r [${callSign}]...О.П. 47км без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Невский, вижу Н два жёлтых, верхний мигающий.`,
            `r [${callSign}] Прибываем на 4 путь ст. Невский.${assistantText}`,
            `r [${callSign}] Прибыли на 4 путь ст. Невский. Интервал: 1 минута.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-nevsky-priv",
          title: "Перегон: Невский → Приволжск",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Вижу Н4 зелёный, отправляемся со ст. Невский на перегон до ст. Приволжск,..`,
            `r [${callSign}]...пл. Азино без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Приволжск, вижу Н два жёлтых, верхний мигающий.`,
            `r [${callSign}] Прибываем на 2 путь ст. Приволжск.${assistantText}`,
            `r [${callSign}] Прибыли на 2 путь ст. Приволжск. Интервал: 1 минута.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-priv-depot",
          title: "Перегон: Приволжск → Депо",
          delayMinutes: 0,
          isLastSegment: true,
          reports: [
            `r [${callSign}] Вижу Н2 зелёный, отправляемся со ст. Приволжск на перегон до депо ТЧЭ-1,..`,
            `r [${callSign}]...пл. Жуковский без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к депо ТЧЭ-1, вижу НМ2 лунно-белый.`,
            `r [${callSign}] Прибываем на 1 канаву депо ТЧЭ-1.${assistantText}`,
            `r [${callSign}] Прибыли в депо на канаву №1. Закрепляем локомотив.`,
            `r [${callSign}] Состав закреплён двумя тормозными башмаками: один с чётной стороны, один с нечётной и одним ручным тормозом.${assistantText}`,
          ],
        })
      }
    }
  }

  // ────────────────────────── ТУРИСТИЧЕСКИЙ ПЕРЕГОНЫ ──────────────────────────
  const generateTouristSegments = (segs: ReportSegment[], callSign: string) => {
    const loco = selectedLocomotive!
    const lowerLoco = getLowercaseLocomotive(loco)
    const lowerLocoPlural = getLowercaseLocomotivePlural(loco)
    const isDNC = selectedType === "Рейс с ДНЦ"
    const assistantText = assistantName.length > 0 ? ` Помощник: ${assistantName}.` : ""

    if (selectedDirection === "Приволжск-Мирный") {
      if (isDNC) {
        const isMachinist = selectedRole === "Машинист"
        const machinistName = isMachinist ? dispatcherName : "Фамилия"

        segs.push({
          id: "seg-depot-priv",
          title: "Перегон: Депо → Приволжск",
          delayMinutes: 0,
          reports: [
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr Машинист ${machinistName}, приняли ${lowerLoco}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
            `cr Заполнили документацию. Магистраль продули, башмаки убрали, состав готов к выезду на линию.`,
            `tr ${passNumber} Понятно, приняли ${lowerLoco}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
            `tr ${passNumber} Заполнили документацию. Магистраль продули, башмаки убрали, ожидайте отправления.`,
            `cr Принято.`,
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Приволжск готов, ЧМ1 лунно-белый.`,
            `cr Принято, выполняю!`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} следует по перегону из депо ТЧЭ-1 до ст. Приволжск.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Приволжск, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Приволжск, ожидайте 3 минуты.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Приволжск, стоянка 3 минуты.`,
          ],
        })
        segs.push({
          id: "seg-priv-nevsky",
          title: "Перегон: Приволжск → Невский",
          delayMinutes: 0,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Невский готов, Ч1 два жёлтых, верхний мигающий.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Приволжск на перегон до ст. Невский.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Невский, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Невский, ожидайте 3 минуты.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Невский, стоянка 3 минуты.`,
          ],
        })
        segs.push({
          id: "seg-nevsky-mirny",
          title: "Перегон: Невский → Мирный",
          delayMinutes: 0,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Мирный готов, Ч1 зелёный.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Невский на перегон до ст. Мирный.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 2 путь ст. Мирный, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 2 путь ст. Мирный, ожидайте 3 минуты.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 2 путь ст. Мирный, стоянка 3 минуты.`,
          ],
        })
        segs.push({
          id: "seg-mirny-depot",
          title: "Перегон: Мирный → Депо",
          delayMinutes: 0,
          isLastSegment: true,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут в депо ТЧЭ-1 готов, ЧМ2 лунно-белый.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Мирный в депо ТЧЭ-1.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1. Рейс № ${flightNumber} окончен, локомотив сдан, машинист ${machinistName}!`,
            `tr ${passNumber} Понятно! Прибыли в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
          ],
        })
      } else {
        // Автономный Туристический Приволжск→Мирный
        segs.push({
          id: "seg-depot-priv",
          title: "Перегон: Депо → Приволжск",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Приняли ${lowerLoco}-${locomotiveNumber} №${flightNumber}, заполнили документацию.`,
            `r [${callSign}] Убираем башмаки, откручиваем ручной, продуваем тормозную магистраль.`,
            `r [${callSign}] Магистраль продули, башмаки убрали, состав готов к выезду на линию.${assistantText}`,
            `r [${callSign}] Вижу ЧМ1 лунно-белый, отправляемся из депо ТЧЭ-1 на перегон до ст. Приволжск…`,
            `r [${callSign}] ...пл. Жуковский без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Приволжск, вижу Ч жёлтый мигающий.`,
            `r [${callSign}] Прибыли под посадку на 1 путь ст. Приволжск. Интервал: 3 минуты.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-priv-nevsky",
          title: "Перегон: Приволжск → Невский",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Вижу, Ч1 два жёлтых, верхний мигающий, отправляемся со ст. Приволжск на перегон до ст. Невский…`,
            `r [${callSign}] ...пл. Азино без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Невский, вижу Ч зелёный.`,
            `r [${callSign}] Прибываем на 1 путь ст. Невский.${assistantText}`,      
            `r [${callSign}] Прибыли на 1 путь ст. Невский. Интервал: 3 минуты.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-nevsky-mirny",
          title: "Перегон: Невский → Мирный",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Вижу Ч1 зелёный, отправляемся со ст. Невский на перегон до ст. Мирный…`,
            `r [${callSign}] ...пл. 47 км. без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Мирный, вижу, Ч жёлтый.`,
            `r [${callSign}] Прибываем на 2 путь ст. Мирный.${assistantText}`,
            `r [${callSign}] Прибыли на 2 путь ст. Мирный. Интервал: 3 минуты.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-mirny-depot",
          title: "Перегон: Мирный → Депо",
          delayMinutes: 0,
          isLastSegment: true,
          reports: [
            `r [${callSign}] Вижу ЧМ2 лунно-белый, отправляемся со ст. Мирный на канаву №2 ТЧЭ-1.${assistantText}`,
            `r [${callSign}] Прибыли в депо на канаву №2. Закрепляем локомотив.`,
            `r [${callSign}] Состав закреплён двумя тормозными башмаками: один с чётной стороны, один с нечётной и одним ручным тормозом.${assistantText}`,
          ],
        })
      }
    } else if (selectedDirection === "Мирный-Приволжск") {
      if (isDNC) {
        const isMachinist = selectedRole === "Машинист"
        const machinistName = isMachinist ? dispatcherName : "Фамилия"

        segs.push({
          id: "seg-depot-mirny",
          title: "Перегон: Депо → Мирный",
          delayMinutes: 0,
          reports: [
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr Машинист ${machinistName}, приняли ${lowerLoco}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
            `cr Заполнили документацию. Магистраль продули, башмаки убрали, состав готов к выезду на линию.`,
            `tr ${passNumber} Понятно, приняли ${lowerLoco}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
            `tr ${passNumber} Заполнили документацию. Магистраль продули, башмаки убрали, ожидайте отправления.`,
            `cr Принято.`,
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Мирный готов, НМ1 лунно-белый.`,
            `cr Принято, выполняю!`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} следует по перегону из депо ТЧЭ-1 до ст. Мирный.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Мирный, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Мирный, ожидайте 3 минуты.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Мирный, стоянка 3 минуты.`,
          ],
        })
        segs.push({
          id: "seg-mirny-nevsky",
          title: "Перегон: Мирный → Невский",
          delayMinutes: 0,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Невский готов, Н1 зелёный.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Мирный на перегон до ст. Невский.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 4 путь ст. Невский, машинист ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 4 путь ст. Невский, ожидайте 3 минуты.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 4 путь ст. Невский, стоянка 3 минуты.`,
          ],
        })
        segs.push({
          id: "seg-nevsky-priv",
          title: "Перегон: Невский → Приволжск",
          delayMinutes: 0,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Приволжск готов, Н4 зелёный.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Невский на перегон до ст. Приволжск.`,
            `cr Диспетчер!`,
            `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 2 путь ст. Приволжск. Машинист: ${machinistName}.`,
            `tr ${passNumber} Понятно, прибыли под посадку на 2 путь ст. Приволжск, ожидайте 3 минуты.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 2 путь ст. Приволжск, стоянка 3 минуты.`,
          ],
        })
        segs.push({
          id: "seg-priv-depot",
          title: "Перегон: Приволжск → Депо",
          delayMinutes: 0,
          isLastSegment: true,
          reports: [
            `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут в депо ТЧЭ-1 готов, Н2 зелёный.`,
            `cr Принято! Выполняю.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Приволжск в депо ТЧЭ-1.`,
            `cr ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1. Рейс № ${flightNumber} окончен, локомотив сдан, машинист ${machinistName}!`,
            `tr ${passNumber} Понятно! Прибыли в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
            `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
          ],
        })
      } else {
        // Автономный Туристический Мирный→Приволжск
        segs.push({
          id: "seg-depot-mirny",
          title: "Перегон: Депо → Мирный",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Приняли ${lowerLoco}-${locomotiveNumber} №${flightNumber}, заполнили документацию.`,
            `r [${callSign}] Убираем башмаки, откручиваем ручной, продуваем тормозную магистраль.`,
            `r [${callSign}] Магистраль продули, башмаки убрали, состав готов к выезду на линию.${assistantText}`,
            `r [${callSign}] Вижу НМ1 лунно-белый, отправляемся из депо ТЧЭ-1 на перегон до ст. Мирный.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Мирный, вижу Н зелёный.`,
            `r [${callSign}] Прибыли под посадку на 1 путь ст. Мирный. Интервал: 3 минуты.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-mirny-nevsky",
          title: "Перегон: Мирный → Невский",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Вижу Н1 зелёный, отправляемся со ст. Мирный на перегон до ст. Невский,..`,
            `r [${callSign}]...О.П. 47км без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Невский, вижу Н два жёлтых, верхний мигающий.`,
            `r [${callSign}] Прибываем на 4 путь ст. Невский.${assistantText}`,
            `r [${callSign}] Прибыли на 4 путь ст. Невский. Интервал: 3 минуты.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-nevsky-priv",
          title: "Перегон: Невский → Приволжск",
          delayMinutes: 0,
          reports: [
            `r [${callSign}] Вижу Н4 зелёный, отправляемся со ст. Невский на перегон до ст. Приволжск,..`,
            `r [${callSign}]...пл. Азино без остановки.${assistantText}`,
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к ст. Приволжск, вижу Н два жёлтых, ве��хний мигающий.`,
            `r [${callSign}] Прибываем на 2 путь ст. Приволжск.${assistantText}`,
            `r [${callSign}] Прибыли на 2 путь ст. Приволжск. Интервал: 3 минуты.${assistantText}`,
          ],
        })
        segs.push({
          id: "seg-priv-depot",
          title: "Перего��: Приволжск → Депо",
          delayMinutes: 0,
          isLastSegment: true,
          reports: [
            `r [${callSign}] Машинист ${lowerLocoPlural}-${locomotiveNumber} на приближении к депо ТЧЭ-1, вижу НМ2 лунно-белый.`,
            `r [${callSign}] Прибываем на 1 канаву депо ТЧЭ-1.${assistantText}`,
            `r [${callSign}] Прибыли в депо на канаву №1. Закрепляем локомотив.`,
            `r [${callSign}] Состав закреплён двумя тормозными башмаками: один с чётной стороны, один с нечётной и одним ручным тормозом.${assistantText}`,
          ],
        })
      }
    }
  }

  // ────────────────────────── РЕНДЕР ──────────────────────────
  const isOppositeRole = (report: string) => {
    if (generatedWithType !== "Рейс с ДНЦ" || !generatedWithRole) return false
    if (generatedWithRole === "Машинист") return report.startsWith("tr ") || report.startsWith("r ")
    return report.startsWith("cr ")
  }

  const copyReport = (text: string, key: string) => {
    const fallback = () => {
      const el = document.createElement("textarea")
      el.value = text
      el.style.position = "fixed"
      el.style.opacity = "0"
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedKey(key)
        setTimeout(() => setCopiedKey(null), 1500)
      }).catch(fallback)
    } else {
      fallback()
    }
  }

  const renderReportItem = (report: string, key: string, isOpposite: boolean) => {
    const isCopied = copiedKey === key

    if (isOpposite) {
      return (
        <div
          key={key}
          className={`w-full px-4 py-3.5 rounded-xl border-2 text-left mb-2.5 opacity-50 ${isDark
            ? "bg-gradient-to-r from-[#0f1419]/40 to-[#0f1419]/30 border-white/5"
            : "bg-gradient-to-r from-gray-100/60 to-gray-50/40 border-gray-200/50"
          }`}
          style={{ borderLeftWidth: "4px", borderLeftColor: getTieColor() + "30" }}
        >
          <code className={`block font-mono text-sm leading-relaxed opacity-70 ${isDark ? "text-white/60" : "text-gray-600"}`}>{report}</code>
        </div>
      )
    }

    return (
      <button
        key={key}
        onClick={() => copyReport(report, key)}
        className={`w-full px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-200 group mb-2.5 ${isCopied
          ? isDark
            ? "bg-gradient-to-r from-green-900/40 to-green-900/20 border-green-500/60"
            : "bg-gradient-to-r from-green-50 to-green-50/60 border-green-400"
          : isDark
            ? "bg-gradient-to-r from-[#0f1419]/80 to-[#0f1419]/60 border-white/10 hover:border-white/30"
            : "bg-gradient-to-r from-white/80 to-gray-50/60 border-gray-200 hover:border-gray-300"
        }`}
        style={{
          borderLeftWidth: "4px",
          borderLeftColor: isCopied ? "#22c55e" : getTieColor(),
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <code className={`block font-mono text-sm leading-relaxed flex-1 ${isCopied ? "text-green-500" : isDark ? "text-white/80" : "text-gray-800"}`}>
            {report}
          </code>
          <div
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
            style={{ backgroundColor: isCopied ? "#22c55e20" : getTieColor() + "20" }}
          >
            {isCopied
              ? <Check className="w-4 h-4 text-green-500" />
              : <Copy className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" style={{ color: getTieColor() }} />
            }
          </div>
        </div>
      </button>
    )
  }

  const renderOptionButton = (value: string, selectedValue: string | null, label: string, type: string) => {
    const isSelected = selectedValue === value
    return (
      <button
        key={value}
        onClick={() => selectOption(type, value)}
        className={`group relative w-full flex items-center gap-3 p-4 rounded-xl transition-all duration-200 ${isSelected
          ? isDark ? "bg-white/10 shadow-lg" : "bg-black/10 shadow-lg"
          : isDark ? "hover:bg-white/5" : "hover:bg-black/5"
        }`}
        style={isSelected ? { borderLeft: `4px solid ${getTieColor()}`, paddingLeft: "calc(1rem - 4px)" } : {}}
      >
        <div
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isSelected
            ? "border-transparent scale-110"
            : isDark ? "border-white/30 group-hover:border-white/50" : "border-gray-300 group-hover:border-gray-400"
          }`}
          style={isSelected ? { backgroundColor: getTieColor() } : {}}
        >
          {isSelected && (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <span className={`text-base font-medium transition-colors ${isSelected
          ? isDark ? "text-white" : "text-black"
          : isDark ? "text-white/70 group-hover:text-white" : "text-black/70 group-hover:text-black"
        }`}>
          {label}
        </span>
      </button>
    )
  }

  const updateGlobalDelay = async (value: number) => {
    setGlobalDelay(value)
    // Если выбран рейс — сохраняем опоздание в БД + синхронизируем таблицу
    if (selectedShiftId) {
      try {
        await apiFetch("/api/train-shifts", {
          method: "PATCH",
          body: JSON.stringify({ id: selectedShiftId, delay_minutes: value }),
        })
        // Синхронизируем Google Sheets
        await apiFetch("/api/sync-to-sheets", {
          method: "POST",
          body: JSON.stringify({ date: getMoscowDateISO() }),
        })
      } catch {
        // silent
      }
    }
  }

  const canSeeTech = ROLE_RANK[userRole ?? "ПТО"] >= ROLE_RANK["Старший Состав"]
  const isTechSelected = selectedCategory === "Технический"

  return (
    <div className="space-y-6 opacity-95">
      <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: getTieColor() + "40" }}>
        <div className="p-3 rounded-xl" style={{ background: `linear-gradient(135deg, ${getTieColor()}20, ${getTieColor()}10)` }}>
          <Settings className="w-6 h-6" style={{ color: getTieColor() }} />
        </div>
        <div>
          <h2 className="text-3xl font-bold" style={{ color: getTieColor() }}>Составитель докладов</h2>
          <p className={`text-sm ${isDark ? "text-white/70" : "text-gray-600"}`}>
            Генератор докладов для рейсов на поезде
          </p>
        </div>
      </div>

      <Card className={`border-2 rounded-2xl overflow-hidden ${isDark ? "bg-[#0f1419]/50 border-white/10" : "bg-white border-gray-200"}`}>
        <CardHeader className="border-b pb-6" style={{ borderColor: getTieColor() }}>
          <CardTitle className="text-2xl flex items-center gap-3" style={{ color: getTieColor() }}>
            <Train className="w-6 h-6" />
            Параметры рейса
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 pt-8">

          {/* Категория */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Train className="w-5 h-5" style={{ color: getTieColor() }} />
              <Label className={`text-lg font-semibold ${isDark ? "text-white" : "text-black"}`}>Категория</Label>
            </div>
            <div className={`space-y-3 p-4 rounded-xl ${isDark ? "bg-white/5" : "bg-gray-50"}`}>
              {(["Пассажирский", "Туристический", ...(canSeeTech ? ["Технический"] : [])] as string[]).map((cat) =>
                renderOptionButton(cat, selectedCategory, cat, "category"),
              )}
            </div>
          </div>

          {/* Направление — только для не-ТЕХ */}
          {!isTechSelected && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-5 h-5" style={{ color: getTieColor() }} />
                <Label className={`text-lg font-semibold ${isDark ? "text-white" : "text-black"}`}>Направление маршрута</Label>
              </div>
              <div className={`space-y-3 p-4 rounded-xl ${isDark ? "bg-white/5" : "bg-gray-50"}`}>
                {["Мирный-Приволжск", "Приволжск-Мирный"].map((dir) =>
                  renderOptionButton(dir, selectedDirection, dir, "direction"),
                )}
              </div>
            </div>
          )}

          <div className={`grid gap-6 ${!isTechSelected ? "md:grid-cols-2" : ""}`}>
            {/* Тип рейса — только для не-ТЕХ */}
            {!isTechSelected && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="w-5 h-5" style={{ color: getTieColor() }} />
                  <Label className={`text-lg font-semibold ${isDark ? "text-white" : "text-black"}`}>Тип рейса</Label>
                </div>
                <div className={`space-y-3 p-4 rounded-xl ${isDark ? "bg-white/5" : "bg-gray-50"}`}>
                  {["Автономный", "Рейс с ДНЦ"].map((type) => renderOptionButton(type, selectedType, type, "type"))}
                </div>
              </div>
            )}

            {/* Тип локомотива */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Train className="w-5 h-5" style={{ color: getTieColor() }} />
                <Label className={`text-lg font-semibold ${isDark ? "text-white" : "text-black"}`}>Тип локомотива</Label>
              </div>
              <div className={`space-y-3 p-4 rounded-xl ${isDark ? "bg-white/5" : "bg-gray-50"}`}>
                {["Тепловоз ТЭП70БС", "Электровоз ЭП1", "Паровоз ЛВ"].map((loco) =>
                  renderOptionButton(loco, selectedLocomotive, loco, "locomotive"),
                )}
              </div>
            </div>
          </div>

          {!isTechSelected && (
            <Alert className={`border-l-4 rounded-xl ${isDark ? "bg-blue-500/10 border-blue-500 backdrop-blur-sm" : "bg-blue-50 border-blue-400"}`}>
              <AlertCircle className="h-5 w-5 text-blue-400" />
              <AlertDescription className={`text-base ${isDark ? "text-blue-200" : "text-blue-700"}`}>
                <strong>Важно:</strong> Локомотив "Паровоз ЛВ" используется только для туристических рейсов, мероприятий или те��тов.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-5">
            <div className="space-y-2">
              <Label className={`text-base font-medium flex items-center gap-2 ${isDark ? "text-white" : "text-black"}`}>
                <Hash className="w-4 h-4" style={{ color: getTieColor() }} />
                Номер локомотива
              </Label>
              <Input
                value={locomotiveNumber}
                onChange={(e) => setLocomotiveNumber(e.target.value)}
                placeholder="Введите номер локомотива..."
                className={`h-12 text-base ${isDark ? "bg-white/5 border-white/10 text-white placeholder:text-white/40" : "bg-white border-gray-300 text-black placeholder:text-gray-400"}`}
              />
            </div>

            {!isTechSelected && (
              <div className="space-y-2">
                <Label className={`text-base font-medium flex items-center gap-2 ${isDark ? "text-white" : "text-black"}`}>
                  <Hash className="w-4 h-4" style={{ color: getTieColor() }} />
                  Номер ПАССа
                </Label>
                <Input
                  value={passNumber}
                  onChange={(e) => setPassNumber(e.target.value)}
                  placeholder="Введите номер ПАССа..."
                  className={`h-12 text-base ${isDark ? "bg-white/5 border-white/10 text-white placeholder:text-white/40" : "bg-white border-gray-300 text-black placeholder:text-gray-400"}`}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className={`text-base font-medium flex items-center gap-2 ${isDark ? "text-white" : "text-black"}`}>
                <Hash className="w-4 h-4" style={{ color: getTieColor() }} />
                Номер рейса
              </Label>
              <Input
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value)}
                placeholder="Введите номер рейса..."
                className={`h-12 text-base ${isDark ? "bg-white/5 border-white/10 text-white placeholder:text-white/40" : "bg-white border-gray-300 text-black placeholder:text-gray-400"}`}
              />
            </div>

            {!isTechSelected && selectedType === "Рейс с ДНЦ" && (
              <>
                <div className="space-y-2">
                  <Label className={`text-base font-medium flex items-center gap-2 ${isDark ? "text-white" : "text-black"}`}>
                    <User className="w-4 h-4" style={{ color: getTieColor() }} />
                    Фамилия
                  </Label>
                  <Input
                    value={dispatcherName}
                    onChange={(e) => setDispatcherName(e.target.value)}
                    placeholder="Введите фамилию..."
                    className={`h-12 text-base ${isDark ? "bg-white/5 border-white/10 text-white placeholder:text-white/40" : "bg-white border-gray-300 text-black placeholder:text-gray-400"}`}
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-5 h-5" style={{ color: getTieColor() }} />
                    <Label className={`text-lg font-semibold ${isDark ? "text-white" : "text-black"}`}>Ваша роль</Label>
                  </div>
                  <div className={`space-y-3 p-4 rounded-xl ${isDark ? "bg-white/5" : "bg-gray-50"}`}>
                    {["Машинист", "Диспетчер"].map((role) => renderOptionButton(role, selectedRole, role, "role"))}
                  </div>
                </div>
              </>
            )}

            {!isTechSelected && selectedType === "Автономный" && (
              <div className="space-y-2">
                <Label className={`text-base font-medium flex items-center gap-2 ${isDark ? "text-white" : "text-black"}`}>
                  <User className="w-4 h-4" style={{ color: getTieColor() }} />
                  Имя и фамилия помощника <span className="text-sm opacity-60">(необязательно)</span>
                </Label>
                <Input
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  placeholder="Введите имя и фамилию помощника..."
                  className={`h-12 text-base ${isDark ? "bg-white/5 border-white/10 text-white placeholder:text-white/40" : "bg-white border-gray-300 text-black placeholder:text-gray-400"}`}
                />
              </div>
            )}
          </div>

          <Button
            onClick={generateReport}
            className="w-full text-white text-lg font-bold h-14 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02]"
            size="lg"
            style={{ backgroundColor: getTieColor(), boxShadow: `0 4px 20px ${getTieColor()}40` }}
          >
            Сгенерировать доклад
          </Button>

          {showNotification && (
            <Alert className={`border-l-4 rounded-xl animate-in slide-in-from-top-2 ${isDark ? "bg-red-500/10 border-red-500" : "bg-red-50 border-red-400"}`}>
              <AlertCircle className="h-5 w-5 text-red-400" />
              <AlertDescription className={`text-base font-semibold ${isDark ? "text-red-200" : "text-red-700"}`}>
                Не всё заполнено! Проверьте все обязательные поля.
              </AlertDescription>
            </Alert>
          )}

          {/* ТЕХ — единый список */}
          {generatedReports.length > 0 && (
            <div className="space-y-4 mt-8 pt-8 border-t-2" style={{ borderColor: getTieColor() + "30" }}>
              <h3 className={`font-bold text-2xl mb-4 flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                <Settings className="w-8 h-8" />
                <span>Технический рейс — доклады</span>
              </h3>
              <div className="space-y-0">
                {generatedReports.map((report, index) => {
                  const isOpposite = isOppositeRole(report)
                  return renderReportItem(report, `tech-${index}`, isOpposite)
                })}
              </div>
            </div>
          )}

          {/* Обычный рейс — плоский список докладов */}
          {segments.length > 0 && (
            <div className="space-y-0 mt-8 pt-8 border-t-2" style={{ borderColor: getTieColor() + "30" }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className={`font-bold text-2xl flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                  <Train className="w-8 h-8" />
                  <span>Доклады</span>
                </h3>
                {/* Опоздание — одно поле на весь рейс */}
                <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${isDark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}>
                  <Clock className="w-4 h-4 flex-shrink-0" style={{ color: getTieColor() }} />
                  <span className={`text-sm font-medium ${isDark ? "text-white/70" : "text-gray-600"}`}>Опоздание:</span>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={globalDelay}
                    onChange={(e) => updateGlobalDelay(parseInt(e.target.value) || 0)}
                    className={`w-16 h-8 text-sm text-center ${isDark ? "bg-white/5 border-white/10 text-white [color-scheme:dark]" : "bg-white border-gray-300 text-black"}`}
                  />
                  <span className={`text-sm ${isDark ? "text-white/50" : "text-gray-500"}`}>мин</span>
                  {globalDelay > 0 && (
                    <span className="text-sm text-red-400 font-semibold">+{globalDelay} мин</span>
                  )}
                </div>
              </div>

              {segments.flatMap((seg) =>
                seg.reports.map((report, idx) => {
                  const key = `${seg.id}-${idx}`
                  const opposite = isOppositeRole(report)
                  return renderReportItem(report, key, opposite)
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
