"use client"

import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { Copy, AlertCircle, Train, MapPin, Settings, User, Hash, Check, Clock } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"

// Секция = один перегон
interface ReportSection {
  title: string
  reports: string[]
}

// Задержки по перегонам (минуты)
interface SegmentDelays {
  toFirstStation: number
  toMiddle: number
  toLastStation: number
  toDepot: number
}

export function ReportCompilerSection() {
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

  const [generatedSections, setGeneratedSections] = useState<ReportSection[]>([])
  const [generatedWithType, setGeneratedWithType] = useState<string | null>(null)
  const [generatedWithRole, setGeneratedWithRole] = useState<string | null>(null)
  const [showNotification, setShowNotification] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<{ section: number; line: number } | null>(null)

  const [delays, setDelays] = useState<SegmentDelays>({ toFirstStation: 0, toMiddle: 0, toLastStation: 0, toDepot: 0 })

  const { theme } = useTheme()
  const getTieColor = () => getThemeColor(theme.colorTheme)

  const selectOption = (type: string, value: string) => {
    switch (type) {
      case "direction": setSelectedDirection(selectedDirection === value ? null : value); break
      case "role": setSelectedRole(selectedRole === value ? null : value); break
      case "locomotive": setSelectedLocomotive(selectedLocomotive === value ? null : value); break
      case "type": setSelectedType(selectedType === value ? null : value); break
      case "category": setSelectedCategory(selectedCategory === value ? null : value); break
    }
  }

  const getLowercaseLocomotive = (l: string) => {
    if (l === "Тепловоз ТЭП70БС") return "тепловоз ТЭП70БС"
    if (l === "Электровоз ЭП1") return "электровоз ЭП1"
    if (l === "Паровоз ЛВ") return "паровоз ЛВ"
    return l
  }
  const getLowercaseLocomotivePlural = (l: string) => {
    if (l === "Тепловоз ТЭП70БС") return "тепловоза ТЭП70БС"
    if (l === "Электровоз ЭП1") return "электровоза ЭП1"
    if (l === "Паровоз ЛВ") return "паровоза ЛВ"
    return l
  }

  const generateReport = () => {
    const isDNC = selectedType === "Рейс с ДНЦ"
    const requiredFields =
      selectedDirection && selectedLocomotive && selectedCategory && locomotiveNumber && passNumber && flightNumber
    const hasDispatcherInfo = isDNC ? dispatcherName !== "" && selectedRole !== null : true

    if (!requiredFields || !hasDispatcherInfo) {
      setShowNotification(true)
      setTimeout(() => setShowNotification(false), 2000)
      return
    }

    setShowNotification(false)

    const prefix = selectedCategory === "Пассажирский" ? "П" : "Т"
    const callSign = `${prefix}-${passNumber}-${flightNumber}`
    const sections: ReportSection[] = []

    if (selectedCategory === "Пассажирский") {
      generatePassengerReports(sections, callSign)
    } else if (selectedCategory === "Туристический") {
      generateTouristReports(sections, callSign)
    }

    setGeneratedSections(sections)
    setGeneratedWithType(selectedType)
    setGeneratedWithRole(selectedRole)
    setCopiedIndex(null)

    setSelectedDirection(null)
    setSelectedRole(null)
    setSelectedLocomotive(null)
    setSelectedType(null)
    setSelectedCategory(null)
    setLocomotiveNumber("")
    setPassNumber("")
    setFlightNumber("")
    setDispatcherName("")
    setAssistantName("")
  }

  // Вспомогательная — собирает ДНЦ-рейс в один блок
  function makeDNCSection(title: string, lines: string[]): ReportSection {
    return { title, reports: lines }
  }

  const generatePassengerReports = (sections: ReportSection[], callSign: string) => {
    const loco = selectedLocomotive!
    const locoLower = getLowercaseLocomotive(loco)
    const locoPlural = getLowercaseLocomotivePlural(loco)
    const aText = assistantName ? ` Помощник: ${assistantName}.` : ""
    const d = delays
    const delayStr = (mins: number) => mins > 0 ? ` Опоздание: ${mins} мин.` : ""

    if (selectedDirection === "Приволжск-Мирный") {
      if (selectedType === "Рейс с ДНЦ") {
        const name = selectedRole === "Машинист" ? dispatcherName : "Фамилия"
        sections.push(makeDNCSection("Рейс с ДНЦ — Приволжск — Мирный", [
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr Машинист ${name}, приняли ${locoLower}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
          `cr Заполнили документацию. Магистраль продули, башмаки убрали, состав готов к выезду на линию.`,
          `tr ${passNumber} Понятно, приняли ${locoLower}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
          `tr ${passNumber} Заполнили документацию. Магистраль продули, башмаки убрали, ожидайте отправления.`,
          `cr Принято.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Приволжск готов, ЧМ1 лунно-белый.`,
          `cr Принято, выполняю!`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} следует по перегону из депо ТЧЭ-1 до ст. Приволжск.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Приволожск, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Приволожск, ожидайте 1 минуту.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Приволожск, стоянка 1 минута.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Невский готов, Ч1 два жёлтых, верхний мигающий.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Приволжск на перегон до ст. Невский.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Невский, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Невский, ожидайте 1 минуту.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Невский, стоянка 1 минута.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Мирный готов, Ч1 зелёный.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Невский на перегон до ст. Мирный.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 2 путь ст. Мирный, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 2 путь ст. Мирный, ожидайте 1 минуту.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 2 путь ст. Мирный, стоянка 1 минута.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут в депо ТЧЭ-1 готов, ЧМ2 лунно-белый.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Мирный в депо ТЧЭ-1.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1. Рейс № ${flightNumber} окончен, локомотив сдан, машинист ${name}!`,
          `tr ${passNumber} Понятно! Прибыли в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
        ]))
      } else if (selectedType === "Автономный") {
        // Секция 1: Депо → Ст. Приволжск
        sections.push({ title: "Перегон 1: Депо ТЧЭ-1 — Ст. Приволжск", reports: [
          `r [${callSign}] Приняли ${locoLower}-${locomotiveNumber} №${flightNumber}, заполнили документацию.`,
          `r [${callSign}] Убираем башмаки, откручиваем ручной, продуваем тормозную магистраль.`,
          `r [${callSign}] Магистраль продули, башмаки убрали, состав готов к выезду на линию.${aText}`,
          `r [${callSign}] Вижу ЧМ1 лунно-белый, отправляемся из депо ТЧЭ-1 на перегон до ст. Приволжск…`,
          `r [${callSign}] ...пл. Жуковский без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Приволжск, вижу Ч жёлтый мигающий.`,
          `r [${callSign}] Прибываем под посадку на 1 путь ст. Приволжск.${aText}`,
          `r [${callSign}] Прибыли под посадку на 1 путь ст. Приволжск. Интервал: 1 минута.${delayStr(d.toFirstStation)}${aText}`,
        ]})
        // Секция 2: Ст. Приволжск → Ст. Невский
        sections.push({ title: "Перегон 2: Ст. Приволжск — Ст. Невский", reports: [
          `r [${callSign}] Вижу, Ч1 два жёлтых, верхний мигающий, отправляемся со ст. Приволжск на перегон до ст. Невский…`,
          `r [${callSign}] ...пл. Азино без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Невский, вижу Ч зелёный.`,
          `r [${callSign}] Прибываем на 1 путь ст. Невский.${aText}`,
          `r [${callSign}] Прибыли на 1 путь ст. Невский. Интервал: 1 минута.${delayStr(d.toMiddle)}${aText}`,
        ]})
        // Секция 3: Ст. Невский → Ст. Мирный
        sections.push({ title: "Перегон 3: Ст. Невский — Ст. Мирный", reports: [
          `r [${callSign}] Вижу Ч1 зелёный, отправляемся со ст. Невский на перегон до ст. Мирный…`,
          `r [${callSign}] ...пл. 47 км. без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Мирный, вижу, Ч жёлтый.`,
          `r [${callSign}] Прибываем на 2 путь ст. Мирный.${aText}`,
          `r [${callSign}] Прибыли на 2 путь ст. Мирный. Интервал: 1 минута.${delayStr(d.toLastStation)}${aText}`,
        ]})
        // Секция 4: Ст. Мирный → Депо
        sections.push({ title: "Перегон 4: Ст. Мирный — Депо ТЧЭ-1", reports: [
          `r [${callSign}] Вижу ЧМ2 лунно-белый, отправляемся со ст. Мирный на канаву №2 ТЧЭ-1.${aText}`,
          `r [${callSign}] Прибыли в депо на канаву №2. Закрепляем локомотив.${delayStr(d.toDepot)}`,
          `r [${callSign}] Состав закреплён двумя тормозными башмаками: один с чётной стороны, один с нечётной и одним ручным тормозом.${aText}`,
        ]})
      }
    } else if (selectedDirection === "Мирный-Приволжск") {
      if (selectedType === "Рейс с ДНЦ") {
        const name = selectedRole === "Машинист" ? dispatcherName : "Фамилия"
        sections.push(makeDNCSection("Рейс с ДНЦ — Мирный — Приволжск", [
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr Машинист ${name}, приняли ${locoLower}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
          `cr Заполнили документацию. Магистраль продули, башмаки убрали, состав готов к выезду на линию.`,
          `tr ${passNumber} Понятно, приняли ${locoLower}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
          `tr ${passNumber} Заполнили документацию. Магистраль продули, башмаки убрали, ожидайте отправления.`,
          `cr Принято.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Мирный готов, НМ1 лунно-белый.`,
          `cr Принято, выполняю!`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} следует по перегону из депо ТЧЭ-1 до ст. Мирный.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Мирный, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Мирный, ожидайте 1 минуту.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Мирный, стоянка 1 минута.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Невский готов, Н1 зелёный.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Мирный на перегон до ст. Невский.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 4 путь ст. Невский, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 4 путь ст. Невский, ожидайте 1 минуту.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 4 путь ст. Невский, стоянка 1 минута.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Приволжск готов, Н4 зелёный.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Невский на перегон до ст. Приволжск.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 2 путь ст. Приволжск. Машинист: ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 2 путь ст. Приволжск, ожидайте 1 минуту.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 2 путь ст. Приволжск, стоянка 1 минута.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут в депо ТЧЭ-1 готов, Н2 зелёный.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Приволжск в депо ТЧЭ-1.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1. Рейс № ${flightNumber} окончен, локомотив сдан, машинист ${name}!`,
          `tr ${passNumber} Понятно! Прибыли в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
        ]))
      } else if (selectedType === "Автономный") {
        sections.push({ title: "Перегон 1: Депо ТЧЭ-1 — Ст. Мирный", reports: [
          `r [${callSign}] Приняли ${locoLower}-${locomotiveNumber} №${flightNumber}, заполнили документацию.`,
          `r [${callSign}] Убираем башмаки, откручиваем ручной, продуваем тормозную магистраль.`,
          `r [${callSign}] Магистраль продули, башмаки убрали, состав готов к выезду на линию.${aText}`,
          `r [${callSign}] Вижу НМ1 лунно-белый, выезжаем под посадку на 1 путь ст. Мирный.${aText}`,
          `r [${callSign}] Прибыли под посадку на 1 путь ст. Мирный. Интервал: 1 минута.${delayStr(d.toFirstStation)}${aText}`,
        ]})
        sections.push({ title: "Перегон 2: Ст. Мирный — Ст. Невский", reports: [
          `r [${callSign}] Вижу Н1 зелёный, отправляемся со ст. Мирный на перегон до ст. Невский,..`,
          `r [${callSign}]...О.П. 47км без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Невский, вижу Н два жёлтых, верхний мигающий.`,
          `r [${callSign}] Прибываем на 4 путь ст. Невский.${aText}`,
          `r [${callSign}] Прибыли на 4 путь ст. Невский. Интервал: 1 минута.${delayStr(d.toMiddle)}${aText}`,
        ]})
        sections.push({ title: "Перегон 3: Ст. Невский — Ст. Приволжск", reports: [
          `r [${callSign}] Вижу Н4 зелёный, отправляемся со ст. Невский на перегон до ст. Приволжск,..`,
          `r [${callSign}]...пл. Азино без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Приволжск, вижу Н два жёлтых, верхний мигающий.`,
          `r [${callSign}] Прибываем на 2 путь ст. Приволжск.${aText}`,
          `r [${callSign}] Прибыли на 2 путь ст. Приволжск. Интервал: 1 минута.${delayStr(d.toLastStation)}${aText}`,
        ]})
        sections.push({ title: "Перегон 4: Ст. Приволжск — Депо ТЧЭ-1", reports: [
          `r [${callSign}] Вижу Н2 зелёный, отправляемся со ст. Приволжск на перегон до депо ТЧЭ-1,..`,
          `r [${callSign}]...пл. Жуковский без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к депо ТЧЭ-1, вижу НМ2 лунно-белый.`,
          `r [${callSign}] Прибываем на 1 канаву депо ТЧЭ-1.${aText}`,
          `r [${callSign}] Прибыли в депо на канаву №1. Закрепляем локомотив.${delayStr(d.toDepot)}`,
          `r [${callSign}] Состав закреплён двумя тормозными башмаками: один с чётной стороны, один с нечётной и одним ручным тормозом.${aText}`,
        ]})
      }
    }
  }

  const generateTouristReports = (sections: ReportSection[], callSign: string) => {
    const loco = selectedLocomotive!
    const locoLower = getLowercaseLocomotive(loco)
    const locoPlural = getLowercaseLocomotivePlural(loco)
    const aText = assistantName ? ` Помощник: ${assistantName}.` : ""
    const d = delays
    const delayStr = (mins: number) => mins > 0 ? ` Опоздание: ${mins} мин.` : ""

    if (selectedDirection === "Приволжск-Мирный") {
      if (selectedType === "Рейс с ДНЦ") {
        const name = selectedRole === "Машинист" ? dispatcherName : "Фамилия"
        sections.push(makeDNCSection("Рейс с ДНЦ — Приволжск — Мирный (Турист.)", [
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr Машинист ${name}, приняли ${locoLower}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
          `cr Заполнили документацию. Магистраль продули, башмаки убрали, состав готов к выезду на линию.`,
          `tr ${passNumber} Понятно, приняли ${locoLower}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
          `tr ${passNumber} Заполнили документацию. Магистраль продули, башмаки убрали, ожидайте отправления.`,
          `cr Принято.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Приволжск готов, ЧМ1 лунно-белый.`,
          `cr Принято, выполняю!`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} следует по перегону из депо ТЧЭ-1 до ст. Приволжск.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Приволожск, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Приволожск, ожидайте 3 минуты.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Приволожск, стоянка 3 минуты.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Невский готов, Ч1 два жёлтых, верхний мигающий.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Приволжск на перегон до ст. Невский.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Невский, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Невский, ожидайте 3 минуты.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Невский, стоянка 3 минуты.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Мирный готов, Ч1 зелёный.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Невский на перегон до ст. Мирный.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 2 путь ст. Мирный, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 2 путь ст. Мирный, ожидайте 3 минуты.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 2 путь ст. Мирный, стоянка 3 минуты.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут в депо ТЧЭ-1 готов, ЧМ2 лунно-белый.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Мирный в депо ТЧЭ-1.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1. Рейс № ${flightNumber} окончен, локомотив сдан, машинист ${name}!`,
          `tr ${passNumber} Понятно! Прибыли в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
        ]))
      } else if (selectedType === "Автономный") {
        sections.push({ title: "Перегон 1: Депо ТЧЭ-1 — Ст. Приволжск", reports: [
          `r [${callSign}] Приняли ${locoLower}-${locomotiveNumber} №${flightNumber}, заполнили документацию.`,
          `r [${callSign}] Убираем башмаки, откручиваем ручной, продуваем тормозную магистраль.`,
          `r [${callSign}] Магистраль продули, башмаки убрали, состав готов к выезду на линию.${aText}`,
          `r [${callSign}] Вижу ЧМ1 лунно-белый, отправляемся из депо ТЧЭ-1 на перегон до ст. Приволжск…`,
          `r [${callSign}] ...пл. Жуковский без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Приволжск, вижу Ч жёлтый мигающий.`,
          `r [${callSign}] Прибываем под посадку на 1 путь ст. Приволожск.${aText}`,
          `r [${callSign}] Прибыли под посадку на 1 путь ст. Приволожск. Интервал: 3 минуты.${delayStr(d.toFirstStation)}${aText}`,
        ]})
        sections.push({ title: "Перегон 2: Ст. Приволжск — Ст. Невский", reports: [
          `r [${callSign}] Вижу, Ч1 два жёлтых, верхний мигающий, отправляемся со ст. Приволжск на перегон до ст. Невский…`,
          `r [${callSign}] ...пл. Азино без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Невский, вижу Ч зелёный.`,
          `r [${callSign}] Прибываем на 1 путь ст. Невский.${aText}`,
          `r [${callSign}] Прибыли на 1 путь ст. Невский. Интервал: 3 минуты.${delayStr(d.toMiddle)}${aText}`,
        ]})
        sections.push({ title: "Перегон 3: Ст. Невский — Ст. Мирный", reports: [
          `r [${callSign}] Вижу Ч1 зелёный, отправляемся со ст. Невский на перегон до ст. Мирный…`,
          `r [${callSign}] ...пл. 47 км. без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Мирный, вижу, Ч жёлтый.`,
          `r [${callSign}] Прибываем на 2 путь ст. Мирный.${aText}`,
          `r [${callSign}] Прибыли на 2 путь ст. Мирный. Интервал: 3 минуты.${delayStr(d.toLastStation)}${aText}`,
        ]})
        sections.push({ title: "Перегон 4: Ст. Мирный — Депо ТЧЭ-1", reports: [
          `r [${callSign}] Вижу ЧМ2 лунно-белый, отправляемся со ст. Мирный на канаву №2 ТЧЭ-1.${aText}`,
          `r [${callSign}] Прибыли в депо на канаву №2. Закрепляем локомотив.${delayStr(d.toDepot)}`,
          `r [${callSign}] Состав закреплён двумя тормозными башмаками: один с чётной стороны, один с нечётной и одним ручным тормозом.${aText}`,
        ]})
      }
    } else if (selectedDirection === "Мирный-Приволжск") {
      if (selectedType === "Рейс с ДНЦ") {
        const name = selectedRole === "Машинист" ? dispatcherName : "Фамилия"
        sections.push(makeDNCSection("Рейс с ДНЦ — Мирный — Приволжск (Турист.)", [
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr Машинист ${name}, приняли ${locoLower}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
          `cr Заполнили документацию. Магистраль продули, башмаки убрали, состав готов к выезду на линию.`,
          `tr ${passNumber} Понятно, приняли ${locoLower}-${locomotiveNumber}, Присвоен позывной ${callSign}.`,
          `tr ${passNumber} Заполнили документацию. Магистраль продули, башмаки убрали, ожидайте отправления.`,
          `cr Принято.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Мирный готов, НМ1 лунно-белый.`,
          `cr Принято, выполняю!`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} следует по перегону из депо ТЧЭ-1 до ст. Мирный.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 1 путь ст. Мирный, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 1 путь ст. Мирный, ожидайте 3 минуты.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 1 путь ст. Мирный, стоянка 3 минуты.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Невский готов, Н1 зелёный.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Мирный на перегон до ст. Невский.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 4 путь ст. Невский, машинист ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 4 путь ст. Невский, ожидайте 3 минуты.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 4 путь ст. Невский, стоянка 3 минуты.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут до ст. Приволжск готов, Н4 зелёный.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Невский на перегон до ст. Приволжск.`,
          `cr Диспетчер!`,
          `tr ${passNumber} ДНЦ ${dispatcherName}, слушаю.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл под посадку на 2 путь ст. Приволжск. Машинист: ${name}.`,
          `tr ${passNumber} Понятно, прибыли под посадку на 2 путь ст. Приволжск, ожидайте 3 минуты.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл на 2 путь ст. Приволожск, стоянка 3 минуты.`,
          `tr ${passNumber} ${loco}-${locomotiveNumber} ${callSign}, маршрут в депо ТЧЭ-1 готов, Н2 зелёный.`,
          `cr Принято! Выполняю.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} отправляется со ст. Приволжск в депо ТЧЭ-1.`,
          `cr ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1. Рейс № ${flightNumber} окончен, локомотив сдан, машинист ${name}!`,
          `tr ${passNumber} Понятно! Прибыли в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
          `r [ДНЦ] ${loco}-${locomotiveNumber} ${callSign} прибыл в ТЧЭ-1, рейс ${flightNumber} окончен, локомотив сдан.`,
        ]))
      } else if (selectedType === "Автономный") {
        sections.push({ title: "Перегон 1: Депо ТЧЭ-1 — Ст. Мирный", reports: [
          `r [${callSign}] Приняли ${locoLower}-${locomotiveNumber} №${flightNumber}, заполнили документацию.`,
          `r [${callSign}] Убираем башмаки, откручиваем ручной, продуваем тормозную магистраль.`,
          `r [${callSign}] Магистраль продули, башмаки убрали, состав готов к выезду на линию.${aText}`,
          `r [${callSign}] Вижу НМ1 лунно-белый, выезжаем под посадку на 1 путь ст. Мирный.${aText}`,
          `r [${callSign}] Прибыли под посадку на 1 путь ст. Мирный. Интервал: 3 минуты.${delayStr(d.toFirstStation)}${aText}`,
        ]})
        sections.push({ title: "Перегон 2: Ст. Мирный — Ст. Невский", reports: [
          `r [${callSign}] Вижу Н1 зелёный, отправляемся со ст. Мирный на перегон до ст. Невский,..`,
          `r [${callSign}]...О.П. 47км без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Невский, вижу Н два жёлтых, верхний мигающий.`,
          `r [${callSign}] Прибываем на 4 путь ст. Невский.${aText}`,
          `r [${callSign}] Прибыли на 4 путь ст. Невский. Интервал: 3 минуты.${delayStr(d.toMiddle)}${aText}`,
        ]})
        sections.push({ title: "Перегон 3: Ст. Невский — Ст. Приволжск", reports: [
          `r [${callSign}] Вижу Н4 зелёный, отправляемся со ст. Невский на перегон до ст. Приволжск,..`,
          `r [${callSign}]...пл. Азино без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к ст. Приволжск, вижу Н два жёлтых, верхний мигающий.`,
          `r [${callSign}] Прибываем на 2 путь ст. Приволжск.${aText}`,
          `r [${callSign}] Прибыли на 2 путь ст. Приволжск. Интервал: 3 минуты.${delayStr(d.toLastStation)}${aText}`,
        ]})
        sections.push({ title: "Перегон 4: Ст. Приволжск — Депо ТЧЭ-1", reports: [
          `r [${callSign}] Вижу Н2 зелёный, отправляемся со ст. Приволжск на перегон до депо ТЧЭ-1,..`,
          `r [${callSign}]...пл. Жуковский без остановки.${aText}`,
          `r [${callSign}] Машинист ${locoPlural}-${locomotiveNumber} на приближении к депо ТЧЭ-1, вижу НМ2 лунно-белый.`,
          `r [${callSign}] Прибываем на 1 канаву депо ТЧЭ-1.${aText}`,
          `r [${callSign}] Прибыли в депо на канаву №1. Закрепляем локомотив.${delayStr(d.toDepot)}`,
          `r [${callSign}] Состав закреплён двумя тормозными башмаками: один с чётной стороны, один с нечётной и одним ручным тормозом.${aText}`,
        ]})
      }
    }
  }

  const copyReport = (text: string, sIdx: number, lIdx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex({ section: sIdx, line: lIdx })
  }

  const isOppositeRole = (report: string) => {
    if (generatedWithType !== "Рейс с ДНЦ" || !generatedWithRole) return false
    if (generatedWithRole === "Машинист") return report.startsWith("tr ") || report.startsWith("r ")
    return report.startsWith("cr ")
  }

  const renderReportLine = (report: string, sIdx: number, lIdx: number) => {
    const key = `${sIdx}-${lIdx}`
    const isOpposite = isOppositeRole(report)
    const isCopied = copiedIndex?.section === sIdx && copiedIndex?.line === lIdx
    const isNext = copiedIndex !== null && sIdx === copiedIndex.section && lIdx === copiedIndex.line + 1

    if (isOpposite) {
      return (
        <div
          key={key}
          className={`w-full p-3 rounded-xl border-2 text-left mb-2 opacity-40 ${
            theme.mode === "dark"
              ? "bg-[#0f1419]/40 border-white/5"
              : "bg-gray-100/60 border-gray-200/50"
          }`}
          style={{ borderLeftWidth: "4px", borderLeftColor: getTieColor() + "25" }}
        >
          <code className="block font-mono text-sm text-white/50">{report}</code>
        </div>
      )
    }

    return (
      <button
        key={key}
        onClick={() => copyReport(report, sIdx, lIdx)}
        className={`w-full p-3 rounded-xl border-2 text-left transition-all duration-200 group mb-2 ${
          isCopied
            ? theme.mode === "dark"
              ? "bg-green-900/40 border-green-500/60"
              : "bg-green-50 border-green-400"
            : isNext
              ? theme.mode === "dark"
                ? "bg-[#0f1419]/80 border-white/40 shadow-md"
                : "bg-white border-gray-400 shadow-md"
              : theme.mode === "dark"
                ? "bg-[#0f1419]/80 border-white/10 hover:border-white/30"
                : "bg-white/80 border-gray-200 hover:border-gray-300"
        }`}
        style={{
          borderLeftWidth: "4px",
          borderLeftColor: isCopied ? "#22c55e" : getTieColor(),
          boxShadow: isNext ? `0 0 0 2px ${getTieColor()}40` : undefined,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <code className={`block font-mono text-sm flex-1 ${isCopied ? "text-green-500" : theme.mode === "dark" ? "text-white/90" : "text-gray-800"}`}>
            {report}
          </code>
          <div
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: isCopied ? "#22c55e20" : getTieColor() + "20" }}
          >
            {isCopied
              ? <Check className="w-4 h-4 text-green-500" />
              : <Copy className="w-4 h-4 opacity-60 group-hover:opacity-100" style={{ color: getTieColor() }} />
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
        className={`group relative w-full flex items-center gap-3 p-4 rounded-xl transition-all duration-200 ${
          isSelected
            ? theme.mode === "dark" ? "bg-white/10 shadow-lg" : "bg-black/10 shadow-lg"
            : theme.mode === "dark" ? "hover:bg-white/5" : "hover:bg-black/5"
        }`}
        style={isSelected ? { borderLeft: `4px solid ${getTieColor()}`, paddingLeft: "calc(1rem - 4px)" } : {}}
      >
        <div
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
            isSelected ? "border-transparent scale-110" : theme.mode === "dark" ? "border-white/30" : "border-gray-300"
          }`}
          style={isSelected ? { backgroundColor: getTieColor() } : {}}
        >
          {isSelected && (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <span className={`text-base font-medium transition-colors ${
          isSelected
            ? theme.mode === "dark" ? "text-white" : "text-black"
            : theme.mode === "dark" ? "text-white/70 group-hover:text-white" : "text-black/70 group-hover:text-black"
        }`}>
          {label}
        </span>
      </button>
    )
  }

  const isAutonomous = selectedType === "Автономный"
  // Метки перегонов для полей опоздания в зависимости от направления
  const delayLabels = selectedDirection === "Приволжск-Мирный"
    ? ["Депо → Приволжск", "Приволжск → Невский", "Невский → Мирный", "Мирный → Депо"]
    : ["Депо → Мирный", "Мирный → Невский", "Невский → Приволжск", "Приволжск → Депо"]
  const delayKeys: (keyof SegmentDelays)[] = ["toFirstStation", "toMiddle", "toLastStation", "toDepot"]

  return (
    <div className="space-y-6 opacity-95">
      <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: getTieColor() + "40" }}>
        <div className="p-3 rounded-xl" style={{ background: `linear-gradient(135deg, ${getTieColor()}20, ${getTieColor()}10)` }}>
          <Train className="w-6 h-6" style={{ color: getTieColor() }} />
        </div>
        <div>
          <h2 className="text-3xl font-bold" style={{ color: getTieColor() }}>Составитель докладов</h2>
          <p className={`text-sm ${theme.mode === "dark" ? "text-white/70" : "text-gray-600"}`}>
            Генерация рейсовых докладов по перегонам
          </p>
        </div>
      </div>

      <Card className={`border-2 rounded-2xl overflow-hidden ${theme.mode === "dark" ? "bg-[#0f1419]/50 border-white/10" : "bg-white border-gray-200"}`}>
        <CardHeader className="border-b pb-6" style={{ borderColor: getTieColor() }}>
          <CardTitle className="text-2xl flex items-center gap-3" style={{ color: getTieColor() }}>
            <Train className="w-6 h-6" />
            Параметры рейса
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 pt-8">

          {/* Направление */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5" style={{ color: getTieColor() }} />
              <Label className={`text-lg font-semibold ${theme.mode === "dark" ? "text-white" : "text-black"}`}>Направление маршрута</Label>
            </div>
            <div className={`space-y-3 p-4 rounded-xl ${theme.mode === "dark" ? "bg-white/5" : "bg-gray-50"}`}>
              {["Мирный-Приволжск", "Приволжск-Мирный"].map((dir) =>
                renderOptionButton(dir, selectedDirection, dir, "direction")
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Тип рейса */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Settings className="w-5 h-5" style={{ color: getTieColor() }} />
                <Label className={`text-lg font-semibold ${theme.mode === "dark" ? "text-white" : "text-black"}`}>Тип рейса</Label>
              </div>
              <div className={`space-y-3 p-4 rounded-xl ${theme.mode === "dark" ? "bg-white/5" : "bg-gray-50"}`}>
                {["Автономный", "Рейс с ДНЦ"].map((type) => renderOptionButton(type, selectedType, type, "type"))}
              </div>
            </div>

            {/* Категория */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Train className="w-5 h-5" style={{ color: getTieColor() }} />
                <Label className={`text-lg font-semibold ${theme.mode === "dark" ? "text-white" : "text-black"}`}>Категория</Label>
              </div>
              <div className={`space-y-3 p-4 rounded-xl ${theme.mode === "dark" ? "bg-white/5" : "bg-gray-50"}`}>
                {["Пассажирский", "Туристический"].map((cat) => renderOptionButton(cat, selectedCategory, cat, "category"))}
              </div>
            </div>
          </div>

          {/* Тип локомотива */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Train className="w-5 h-5" style={{ color: getTieColor() }} />
              <Label className={`text-lg font-semibold ${theme.mode === "dark" ? "text-white" : "text-black"}`}>Тип локомотива</Label>
            </div>
            <div className={`space-y-3 p-4 rounded-xl ${theme.mode === "dark" ? "bg-white/5" : "bg-gray-50"}`}>
              {["Тепловоз ТЭП70БС", "Электровоз ЭП1", "Паровоз ЛВ"].map((loco) =>
                renderOptionButton(loco, selectedLocomotive, loco, "locomotive")
              )}
            </div>
          </div>

          <Alert className={`border-l-4 rounded-xl ${theme.mode === "dark" ? "bg-blue-500/10 border-blue-500 backdrop-blur-sm" : "bg-blue-50 border-blue-400"}`}>
            <AlertCircle className="h-5 w-5 text-blue-400" />
            <AlertDescription className={`text-base ${theme.mode === "dark" ? "text-blue-200" : "text-blue-700"}`}>
              <strong>Важно:</strong> Локомотив &quot;Паровоз ЛВ&quot; используется только для туристических рейсов, мероприятий или тестов.
            </AlertDescription>
          </Alert>

          {/* Числовые поля */}
          <div className="space-y-5">
            {[
              { label: "Номер локомотива", value: locomotiveNumber, onChange: setLocomotiveNumber, placeholder: "Введите номер локомотива..." },
              { label: "Номер ПАССа", value: passNumber, onChange: setPassNumber, placeholder: "Введите номер ПАССа..." },
              { label: "Номер рейса", value: flightNumber, onChange: setFlightNumber, placeholder: "Введите номер рейса..." },
            ].map(({ label, value, onChange, placeholder }) => (
              <div key={label} className="space-y-2">
                <Label className={`text-base font-medium flex items-center gap-2 ${theme.mode === "dark" ? "text-white" : "text-black"}`}>
                  <Hash className="w-4 h-4" style={{ color: getTieColor() }} />
                  {label}
                </Label>
                <Input
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={placeholder}
                  className={`h-12 text-base ${theme.mode === "dark" ? "bg-white/5 border-white/10 text-white placeholder:text-white/40" : "bg-white border-gray-300 text-black placeholder:text-gray-400"}`}
                />
              </div>
            ))}

            {selectedType === "Рейс с ДНЦ" && (
              <>
                <div className="space-y-2">
                  <Label className={`text-base font-medium flex items-center gap-2 ${theme.mode === "dark" ? "text-white" : "text-black"}`}>
                    <User className="w-4 h-4" style={{ color: getTieColor() }} />
                    Фамилия
                  </Label>
                  <Input
                    value={dispatcherName}
                    onChange={(e) => setDispatcherName(e.target.value)}
                    placeholder="Введите фамилию..."
                    className={`h-12 text-base ${theme.mode === "dark" ? "bg-white/5 border-white/10 text-white placeholder:text-white/40" : "bg-white border-gray-300 text-black placeholder:text-gray-400"}`}
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-5 h-5" style={{ color: getTieColor() }} />
                    <Label className={`text-lg font-semibold ${theme.mode === "dark" ? "text-white" : "text-black"}`}>Ваша роль</Label>
                  </div>
                  <div className={`space-y-3 p-4 rounded-xl ${theme.mode === "dark" ? "bg-white/5" : "bg-gray-50"}`}>
                    {["Машинист", "Диспетчер"].map((role) => renderOptionButton(role, selectedRole, role, "role"))}
                  </div>
                </div>
              </>
            )}

            {selectedType === "Автономный" && (
              <div className="space-y-2">
                <Label className={`text-base font-medium flex items-center gap-2 ${theme.mode === "dark" ? "text-white" : "text-black"}`}>
                  <User className="w-4 h-4" style={{ color: getTieColor() }} />
                  Имя и фамилия помощника <span className="text-sm opacity-60">(необязательно)</span>
                </Label>
                <Input
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  placeholder="Введите имя и фамилию помощника..."
                  className={`h-12 text-base ${theme.mode === "dark" ? "bg-white/5 border-white/10 text-white placeholder:text-white/40" : "bg-white border-gray-300 text-black placeholder:text-gray-400"}`}
                />
              </div>
            )}
          </div>

          {/* Опоздание по перегонам — только для автономного */}
          {isAutonomous && selectedDirection && (
            <div className={`space-y-4 p-4 rounded-xl border ${theme.mode === "dark" ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" style={{ color: getTieColor() }} />
                <Label className={`text-base font-semibold ${theme.mode === "dark" ? "text-white" : "text-black"}`}>
                  Опоздание по перегонам (мин.)
                </Label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {delayKeys.map((key, i) => (
                  <div key={key} className="space-y-1.5">
                    <Label className={`text-xs ${theme.mode === "dark" ? "text-white/50" : "text-gray-500"}`}>{delayLabels[i]}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={delays[key]}
                      onChange={(e) => setDelays((prev) => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                      className={`h-9 text-sm ${theme.mode === "dark" ? "bg-white/5 border-white/10 text-white [color-scheme:dark]" : "bg-white border-gray-300 text-black"}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={generateReport}
            className="w-full text-white text-lg font-bold h-14 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02]"
            size="lg"
            style={{ backgroundColor: getTieColor(), boxShadow: `0 4px 20px ${getTieColor()}40` }}
          >
            Сгенерировать доклад
          </Button>

          {showNotification && (
            <Alert className={`border-l-4 rounded-xl animate-in slide-in-from-top-2 ${theme.mode === "dark" ? "bg-red-500/10 border-red-500" : "bg-red-50 border-red-400"}`}>
              <AlertCircle className="h-5 w-5 text-red-400" />
              <AlertDescription className={`text-base font-semibold ${theme.mode === "dark" ? "text-red-200" : "text-red-700"}`}>
                Не всё заполнено! Проверьте все обязательные поля.
              </AlertDescription>
            </Alert>
          )}

          {/* Сгенерированные доклады по перегонам */}
          {generatedSections.length > 0 && (
            <div className="space-y-6 mt-8 pt-8 border-t-2" style={{ borderColor: getTieColor() + "30" }}>
              <h3 className={`font-bold text-2xl mb-4 flex items-center gap-2 ${theme.mode === "dark" ? "text-white" : "text-gray-900"}`}>
                <Train className="w-7 h-7" />
                Сгенерированные доклады
              </h3>
              {generatedSections.map((section, sIdx) => (
                <div key={sIdx} className="space-y-2">
                  {/* Заголовок перегона */}
                  <div
                    className="flex items-center gap-2 px-4 py-2 rounded-lg"
                    style={{ background: getTieColor() + "20", borderLeft: `3px solid ${getTieColor()}` }}
                  >
                    <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: getTieColor() }} />
                    <span className="text-sm font-bold uppercase tracking-wide" style={{ color: getTieColor() }}>
                      {section.title}
                    </span>
                  </div>
                  {/* Строки докладов */}
                  <div className="space-y-0 pl-1">
                    {section.reports.map((report, lIdx) => renderReportLine(report, sIdx, lIdx))}
                  </div>
                </div>
              ))}
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  )
}
