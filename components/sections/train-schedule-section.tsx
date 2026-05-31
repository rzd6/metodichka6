"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Trash2, UserX, Database, Train, CalendarClock, TableIcon, Pencil, Check, X, RefreshCw } from "lucide-react"
import { useTheme } from "@/contexts/theme-context"
import { getThemeColor } from "@/lib/theme-utils"
import type { UserRole } from "@/data/users"
import { canClaimShift, canDeleteOwnShift, canDeleteAnyShift, canManageTrainDB } from "@/data/users"
import { useToast } from "@/hooks/use-toast"

interface TrainRecord {
  id: string
  train_number: number
  direction: string
  class: string
  depart_start: string | null
  arrive_middle: string | null
  depart_middle: string | null
  arrive_end: string | null
  platform_start: number
  platform_middle: number
  platform_end: number
  created_at: string
}

interface TrainShift {
  id: string
  train_id: string
  train_number: number
  claimed_by_nickname: string
  claimed_by_role: string
  shift_date: string
  created_at: string
  direction?: string
  class?: string
  depart_start?: string | null
  arrive_middle?: string | null
  depart_middle?: string | null
  arrive_end?: string | null
  platform_start?: number
  platform_middle?: number
  platform_end?: number
}

interface TrainScheduleSectionProps {
  userRole: UserRole
  userNickname?: string
}

const TRAIN_CLASSES = ["Пассажирский"] as const
const CLASS_ABBR: Record<string, string> = {
  Скоростной: "СКОР",
  Пассажирский: "ПАСС",
  Пригородный: "ПРИГ",
  Туристический: "ТУР",
}

// Directions: only two (no Nevsky)
const DIRECTIONS = [
  { value: "mirny-privolzhsk", label: "Мирный — Приволжск", short: "1/3" },
  { value: "privolzhsk-mirny", label: "Приволжск — Мирный", short: "2/4" },
] as const

// Two station tabs: only start/end of direction
const DIRECTION_TABS = [
  { id: "mirny-privolzhsk", label: "Мирный — Приволжск" },
  { id: "privolzhsk-mirny", label: "Приволжск — Мирный" },
] as const

type DirectionTab = "mirny-privolzhsk" | "privolzhsk-mirny"

// Valid departure minute values
const VALID_DEPARTURE_MINUTES = [0, 15, 30, 45]

function addMinutes(time: string | null | undefined, mins: number): string {
  if (!time) return "—"
  const [h, m] = time.split(":").map(Number)
  const total = h * 60 + m + mins
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60).toString().padStart(2, "0")
  const mm = (((total % 1440) + 1440) % 1440 % 60).toString().padStart(2, "0")
  return `${hh}:${mm}`
}

function getMoscowTime(): string {
  return new Date().toLocaleTimeString("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getMoscowDateISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" })
}

function formatDateRu(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  })
  return res.json()
}

// Get trains for the given direction tab (only those with claimed shifts)
function getTrainsForDirection(trains: TrainRecord[], shifts: TrainShift[], direction: DirectionTab) {
  return trains
    .filter((t) => t.direction === direction)
    .map((train) => {
      const shift = shifts.find((sh) => sh.train_number === train.train_number)
      if (!shift) return null

      let arrival: string | null = null
      let departure: string | null = null
      let platform: number = 1

      if (direction === "mirny-privolzhsk") {
        // From Mirny: departure is shown, no arrival at start
        // At Mirny station: depart_start. At Privolzhsk: arrive_end
        departure = train.depart_start
        platform = train.platform_start
        arrival = null
      } else {
        // From Privolzhsk: departure is shown, no arrival at start
        departure = train.depart_start
        platform = train.platform_start
        arrival = null
      }

      return { train, shift, arrival, departure, platform }
    })
    .filter(Boolean) as Array<{
      train: TrainRecord
      shift: TrainShift
      arrival: string | null
      departure: string | null
      platform: number
    }>
}

function validateDepartureTime(time: string): boolean {
  if (!time) return true // empty is ok
  const parts = time.split(":")
  if (parts.length !== 2) return false
  const minutes = parseInt(parts[1])
  return VALID_DEPARTURE_MINUTES.includes(minutes)
}

export function TrainScheduleSection({ userRole, userNickname }: TrainScheduleSectionProps) {
  const { theme } = useTheme()
  const { toast } = useToast()

  const [trains, setTrains] = useState<TrainRecord[]>([])
  const [shifts, setShifts] = useState<TrainShift[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncUrl, setSyncUrl] = useState<string | null>(null)

  const [activeDirection, setActiveDirection] = useState<DirectionTab>("mirny-privolzhsk")
  const [claimTrainNumber, setClaimTrainNumber] = useState("")
  const [shiftDate, setShiftDate] = useState(getMoscowDateISO())
  const [deleteShiftTarget, setDeleteShiftTarget] = useState<TrainShift | null>(null)

  // Language toggle: RU / EN, fade every 20s
  const [lang, setLang] = useState<"ru" | "en">("ru")
  const [langVisible, setLangVisible] = useState(true)
  useEffect(() => {
    const toggle = () => {
      setLangVisible(false)
      setTimeout(() => {
        setLang((l) => (l === "ru" ? "en" : "ru"))
        setLangVisible(true)
      }, 600)
    }
    const id = setInterval(toggle, 20_000)
    return () => clearInterval(id)
  }, [])

  // Moscow clock
  const [moscowTime, setMoscowTime] = useState(getMoscowTime())
  useEffect(() => {
    const id = setInterval(() => setMoscowTime(getMoscowTime()), 10_000)
    return () => clearInterval(id)
  }, [])

  // Admin panel
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showTrainForm, setShowTrainForm] = useState(false)
  const [trainForm, setTrainForm] = useState({
    train_number: "",
    direction: "mirny-privolzhsk",
    class: "Пассажирский",
    depart_start: "",
    arrive_middle: "",
    depart_middle: "",
    arrive_end: "",
    platform_start: "1",
    platform_middle: "1",
    platform_end: "1",
  })
  const [deleteTrainTarget, setDeleteTrainTarget] = useState<TrainRecord | null>(null)

  // Edit mode
  const [editingTrainId, setEditingTrainId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<typeof trainForm>>({})

  const getTieColor = () => getThemeColor(theme.colorTheme)
  const isDark = theme.mode === "dark"

  const loadTrains = useCallback(async () => {
    const { data } = await apiFetch("/api/trains")
    if (Array.isArray(data)) setTrains(data)
  }, [])

  const loadShifts = useCallback(async () => {
    const { data } = await apiFetch(`/api/train-shifts?date=${shiftDate}&with_trains=1`)
    if (Array.isArray(data)) setShifts(data)
  }, [shiftDate])

  useEffect(() => { loadTrains() }, [loadTrains])
  useEffect(() => { loadShifts() }, [loadShifts])

  // ---- Language strings ----
  const T = {
    ru: {
      scheduleTitle: (date: string) => `РАСПИСАНИЕ ДВИЖЕНИЯ ПОЕЗДОВ НА ${formatDateRu(date).toUpperCase()}`,
      arrivalsTitle: "Прибытие и отправление поездов",
      stationLabel: (dir: DirectionTab) => dir === "mirny-privolzhsk" ? "Станция Мирный" : "Станция Приволжск",
      trainNum: "Номер поезда",
      category: "Категория",
      destination: "Назначение",
      arrival: "Прибытие",
      departure: "Отправление",
      track: "Путь",
      driver: "Машинист",
      moscowTime: "Московское\nвремя",
      claimShift: "ЗАНЯТЬ РЕЙС",
    },
    en: {
      scheduleTitle: (date: string) => {
        const d = new Date(date + "T12:00:00")
        return `SCHEDULE FOR ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".")}`
      },
      arrivalsTitle: "Arrivals & Departures",
      stationLabel: (dir: DirectionTab) => dir === "mirny-privolzhsk" ? "Station Mirny" : "Station Privolzhsk",
      trainNum: "Train",
      category: "Class",
      destination: "Destination",
      arrival: "Arrival",
      departure: "Departure",
      track: "Track",
      driver: "Driver",
      moscowTime: "Moscow\ntime",
      claimShift: "CLAIM SHIFT",
    },
  }[lang]

  // ---- Shift actions ----
  const handleClaimShift = async () => {
    const num = parseInt(claimTrainNumber)
    if (!num) { toast({ title: "Введите номер рейса", variant: "destructive" }); return }
    const train = trains.find((t) => t.train_number === num)
    if (!train) {
      toast({ title: "Рейс не найден", description: `Рейс №${num} отсутствует в базе данных`, variant: "destructive" })
      return
    }
    const alreadyClaimed = shifts.find((s) => s.train_number === num)
    if (alreadyClaimed) {
      toast({ title: "Рейс занят", description: `Рейс №${num} уже занял ${alreadyClaimed.claimed_by_nickname}`, variant: "destructive" })
      return
    }
    setIsLoading(true)
    try {
      const { data, error } = await apiFetch("/api/train-shifts", {
        method: "POST",
        body: JSON.stringify({
          train_id: train.id,
          train_number: train.train_number,
          claimed_by_nickname: userNickname || "Неизвестный",
          claimed_by_role: userRole,
          shift_date: shiftDate,
        }),
      })
      if (error) throw new Error(error)
      if (data) {
        await loadShifts()
        setClaimTrainNumber("")
        toast({ title: "Рейс занят", description: `Рейс №${num} закреплён за вами` })
      }
    } catch (err: any) {
      toast({ title: "Ошибка", description: err?.message || "Не удалось занять рейс", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteShift = async () => {
    if (!deleteShiftTarget) return
    setIsLoading(true)
    const targetId = deleteShiftTarget.id
    setShifts((prev) => prev.filter((s) => s.id !== targetId))
    setDeleteShiftTarget(null)
    try {
      const { error } = await apiFetch("/api/train-shifts", {
        method: "DELETE",
        body: JSON.stringify({ id: targetId }),
      })
      if (error) throw new Error(error)
      await loadShifts()
      toast({ title: "Рейс освобождён" })
    } catch (err: any) {
      await loadShifts()
      toast({ title: "Ошибка", description: err?.message || "Не удалось освободить рейс", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  // ---- Train DB actions ----
  const handleAddTrain = async (e: React.FormEvent) => {
    e.preventDefault()

    if (trainForm.depart_start && !validateDepartureTime(trainForm.depart_start)) {
      toast({ title: "Неверное время отправления", description: "Отправление должно быть в 00, 15, 30 или 45 минут", variant: "destructive" })
      return
    }

    setIsLoading(true)
    try {
      const { data, error } = await apiFetch("/api/trains", {
        method: "POST",
        body: JSON.stringify({
          train_number: parseInt(trainForm.train_number),
          direction: trainForm.direction,
          class: trainForm.class,
          depart_start: trainForm.depart_start || null,
          arrive_middle: trainForm.arrive_middle || null,
          depart_middle: trainForm.depart_middle || null,
          arrive_end: trainForm.arrive_end || null,
          platform_start: parseInt(trainForm.platform_start) || 1,
          platform_middle: parseInt(trainForm.platform_middle) || 1,
          platform_end: parseInt(trainForm.platform_end) || 1,
        }),
      })
      if (error) throw new Error(error)
      if (!data) {
        toast({ title: "Рейс с таким номером уже существует", variant: "destructive" })
      } else {
        const addedNum = trainForm.train_number
        await loadTrains()
        setShowTrainForm(false)
        setTrainForm({
          train_number: "", direction: "mirny-privolzhsk", class: "Пассажирский",
          depart_start: "", arrive_middle: "", depart_middle: "", arrive_end: "",
          platform_start: "1", platform_middle: "1", platform_end: "1",
        })
        toast({ title: "Рейс добавлен", description: `Рейс №${addedNum} добавлен в базу` })
      }
    } catch (err: any) {
      toast({ title: "Ошибка", description: err?.message || "Не удалось добавить рейс", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteTrain = async () => {
    if (!deleteTrainTarget) return
    setIsLoading(true)
    try {
      const { error } = await apiFetch("/api/trains", {
        method: "DELETE",
        body: JSON.stringify({ id: deleteTrainTarget.id }),
      })
      if (error) throw new Error(error)
      await loadTrains()
      await loadShifts()
      toast({ title: "Рейс удалён из базы" })
      setDeleteTrainTarget(null)
    } catch (err: any) {
      toast({ title: "Ошибка", description: err?.message, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditSave = async (train: TrainRecord) => {
    if (editForm.depart_start && !validateDepartureTime(editForm.depart_start)) {
      toast({ title: "Неверное время отправления", description: "Отправление должно быть в 00, 15, 30 или 45 минут", variant: "destructive" })
      return
    }

    setIsLoading(true)
    try {
      const updates: Record<string, any> = {}
      if ("train_number" in editForm) updates.train_number = parseInt(editForm.train_number || "0")
      if ("direction" in editForm) updates.direction = editForm.direction
      if ("class" in editForm) updates.class = editForm.class
      if ("depart_start" in editForm) updates.depart_start = editForm.depart_start || null
      if ("arrive_middle" in editForm) updates.arrive_middle = editForm.arrive_middle || null
      if ("depart_middle" in editForm) updates.depart_middle = editForm.depart_middle || null
      if ("arrive_end" in editForm) updates.arrive_end = editForm.arrive_end || null
      if ("platform_start" in editForm) updates.platform_start = parseInt(editForm.platform_start || "1")
      if ("platform_middle" in editForm) updates.platform_middle = parseInt(editForm.platform_middle || "1")
      if ("platform_end" in editForm) updates.platform_end = parseInt(editForm.platform_end || "1")

      const { error } = await apiFetch("/api/trains", {
        method: "PATCH",
        body: JSON.stringify({ id: train.id, ...updates }),
      })
      if (error) throw new Error(error)
      await loadTrains()
      setEditingTrainId(null)
      setEditForm({})
      toast({ title: "Рейс обновлён" })
    } catch (err: any) {
      toast({ title: "Ошибка", description: err?.message, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const startEdit = (train: TrainRecord) => {
    setEditingTrainId(train.id)
    setEditForm({
      train_number: String(train.train_number),
      direction: train.direction,
      class: train.class,
      depart_start: train.depart_start || "",
      arrive_middle: train.arrive_middle || "",
      depart_middle: train.depart_middle || "",
      arrive_end: train.arrive_end || "",
      platform_start: String(train.platform_start),
      platform_middle: String(train.platform_middle),
      platform_end: String(train.platform_end),
    })
  }

  // ---- Sync to Google Sheets ----
  const handleSyncToSheets = async () => {
    setIsSyncing(true)
    try {
      const { sheetUrl, error } = await apiFetch("/api/sync-to-sheets", {
        method: "POST",
        body: JSON.stringify({ date: shiftDate }),
      })
      if (error) throw new Error(error)
      setSyncUrl(sheetUrl)
      toast({ title: "Расписание выгружено в Google Sheets" })
    } catch (err: any) {
      toast({ title: "Ошибка синхронизации", description: err?.message, variant: "destructive" })
    } finally {
      setIsSyncing(false)
    }
  }

  const canRemoveShift = (shift: TrainShift) => {
    if (canDeleteAnyShift(userRole)) return true
    if (canDeleteOwnShift(userRole) && shift.claimed_by_nickname === userNickname) return true
    return false
  }

  const directionRows = getTrainsForDirection(trains, shifts, activeDirection)

  // ---- Colours: RZD board aesthetic ----
  const boardBg = "#1a1f2e"
  const headerBg = "#c0392b"
  const rowEvenBg = "#141820"
  const rowOddBg = "#1a1f2e"
  const borderClr = "#2a3040"

  // All unclaimed trains for the claim bar
  const unclaimedTrains = trains.filter((t) => !shifts.some((s) => s.train_number === t.train_number))
  // Unclaimed for active direction
  const unclaimedForDir = unclaimedTrains.filter((t) => t.direction === activeDirection)
  // All unclaimed for the other direction too
  const allUnclaimed = unclaimedTrains

  return (
    <div className="space-y-6 opacity-95">
      {/* Section header */}
      <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: getTieColor() + "40" }}>
        <div
          className="p-3 rounded-xl"
          style={{ background: `linear-gradient(135deg, ${getTieColor()}20, ${getTieColor()}10)` }}
        >
          <CalendarClock className="w-6 h-6" style={{ color: getTieColor() }} />
        </div>
        <div>
          <h2 className="text-3xl font-bold" style={{ color: getTieColor() }}>
            Расписание рейсов
          </h2>
          <p className={`text-sm ${isDark ? "text-white/70" : "text-gray-600"}`}>
            Движение поездов по станциям РЖД
          </p>
        </div>
      </div>

      {/* BOARD */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: boardBg, border: `1px solid ${borderClr}` }}
      >
        {/* Top bar */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-3" style={{ borderBottom: `1px solid ${borderClr}` }}>
          <div className="flex items-center gap-2 mr-auto">
            <Train className="w-5 h-5 text-white/70" />
            <span
              className="text-white font-bold text-base tracking-wide uppercase transition-opacity duration-500"
              style={{ opacity: langVisible ? 1 : 0 }}
            >
              {T.scheduleTitle(shiftDate)}
            </span>
          </div>

          {/* Date picker */}
          <Input
            type="date"
            value={shiftDate}
            onChange={(e) => setShiftDate(e.target.value)}
            className="h-8 w-40 text-sm bg-white/5 border-white/20 text-white [color-scheme:dark]"
          />

          {/* Sync to Sheets button */}
          {canManageTrainDB(userRole) && (
            <button
              onClick={handleSyncToSheets}
              disabled={isSyncing}
              className="flex items-center gap-1.5 h-8 px-3 rounded text-sm font-medium text-white/70 hover:text-white border border-white/20 hover:border-white/40 transition-colors disabled:opacity-50"
            >
              {isSyncing
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <TableIcon className="w-4 h-4" />}
              Google Sheets
            </button>
          )}

          {/* Manage DB button */}
          {canManageTrainDB(userRole) && (
            <button
              onClick={() => setShowAdminPanel((v) => !v)}
              className="flex items-center gap-1.5 h-8 px-3 rounded text-sm font-medium text-white/70 hover:text-white border border-white/20 hover:border-white/40 transition-colors"
            >
              <Database className="w-4 h-4" />
              База рейсов
            </button>
          )}
        </div>

        {/* Sync URL link */}
        {syncUrl && (
          <div className="px-5 py-2 flex items-center gap-2" style={{ background: "#1d2635", borderBottom: `1px solid ${borderClr}` }}>
            <TableIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-white/60 text-xs">Таблица:</span>
            <a
              href={syncUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 text-xs hover:text-green-300 underline truncate"
            >
              {syncUrl}
            </a>
          </div>
        )}

        {/* Direction tabs — two only */}
        <div className="flex gap-0" style={{ borderBottom: `1px solid ${borderClr}` }}>
          {DIRECTION_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveDirection(tab.id)}
              className="flex-1 py-2.5 text-sm font-semibold tracking-wide transition-all"
              style={
                activeDirection === tab.id
                  ? { background: getTieColor(), color: "#fff" }
                  : { background: "#252b3b", color: "rgba(255,255,255,0.55)" }
              }
            >
              <span
                className="transition-opacity duration-500"
                style={{ opacity: langVisible ? 1 : 0 }}
              >
                {lang === "ru" ? tab.label : (tab.id === "mirny-privolzhsk" ? "Mirny — Privolzhsk" : "Privolzhsk — Mirny")}
              </span>
            </button>
          ))}
        </div>

        {/* Inner board header */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${borderClr}` }}>
          <div>
            <p
              className="text-white font-bold text-base transition-opacity duration-500"
              style={{ opacity: langVisible ? 1 : 0 }}
            >
              {T.arrivalsTitle}
            </p>
            <p
              className="text-white/50 text-xs mt-0.5 transition-opacity duration-500"
              style={{ opacity: langVisible ? 1 : 0 }}
            >
              {T.stationLabel(activeDirection)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-white/50 text-xs text-right leading-tight whitespace-pre-line transition-opacity duration-500"
              style={{ opacity: langVisible ? 1 : 0 }}
            >
              {T.moscowTime}
            </span>
            <div
              className="text-white font-bold text-xl px-3 py-1 rounded"
              style={{ background: "#252b3b", border: `1px solid ${borderClr}`, fontVariantNumeric: "tabular-nums" }}
            >
              {moscowTime}
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div
          className="grid text-white text-sm font-semibold px-5 py-2.5"
          style={{
            gridTemplateColumns: "72px 90px 1fr 110px 120px 64px 180px 48px",
            background: headerBg,
          }}
        >
          <span
            className="transition-opacity duration-500"
            style={{ opacity: langVisible ? 1 : 0 }}
          >
            {T.trainNum}
          </span>
          <span
            className="transition-opacity duration-500"
            style={{ opacity: langVisible ? 1 : 0 }}
          >
            {T.category}
          </span>
          <span
            className="transition-opacity duration-500"
            style={{ opacity: langVisible ? 1 : 0 }}
          >
            {T.destination}
          </span>
          <span
            className="transition-opacity duration-500"
            style={{ opacity: langVisible ? 1 : 0 }}
          >
            {T.arrival}
          </span>
          <span
            className="transition-opacity duration-500"
            style={{ opacity: langVisible ? 1 : 0 }}
          >
            {T.departure}
          </span>
          <span
            className="transition-opacity duration-500"
            style={{ opacity: langVisible ? 1 : 0 }}
          >
            {T.track}
          </span>
          <span
            className="transition-opacity duration-500"
            style={{ opacity: langVisible ? 1 : 0 }}
          >
            {T.driver}
          </span>
          <span />
        </div>

        {/* Rows */}
        {directionRows.length === 0 ? (
          <div className="py-10 text-center text-white/40 text-sm" style={{ background: boardBg }}>
            {trains.filter((t) => t.direction === activeDirection).length === 0
              ? "База рейсов пуста. Обратитесь к Старшему Составу."
              : "На выбранную дату нет занятых рейсов в этом направлении."}
          </div>
        ) : (
          directionRows.map(({ train, shift, arrival, departure, platform }, idx) => {
            const dirLabel = activeDirection === "mirny-privolzhsk" ? "Мирный — Приволжск" : "Приволжск — Мирный"
            const dirLabelEn = activeDirection === "mirny-privolzhsk" ? "Mirny — Privolzhsk" : "Privolzhsk — Mirny"
            const shortCode = activeDirection === "mirny-privolzhsk" ? "1/3" : "2/4"
            const rowBg = idx % 2 === 0 ? rowEvenBg : rowOddBg
            return (
              <div
                key={train.id}
                className="grid items-center px-5 py-3 text-sm"
                style={{
                  gridTemplateColumns: "72px 90px 1fr 110px 120px 64px 180px 48px",
                  background: rowBg,
                  borderBottom: `1px solid ${borderClr}`,
                }}
              >
                {/* Train number */}
                <span className="text-xl font-extrabold" style={{ color: "#f5c518" }}>
                  {train.train_number}
                </span>

                {/* Category — always ПАСС / PASS */}
                <span
                  className="font-bold text-white/90 uppercase text-xs tracking-wide transition-opacity duration-500"
                  style={{ opacity: langVisible ? 1 : 0 }}
                >
                  {lang === "ru" ? "ПАСС" : "PASS"}
                </span>

                {/* Route — centered, with direction code */}
                <span
                  className="font-semibold text-center transition-opacity duration-500"
                  style={{ color: "#f5c518", opacity: langVisible ? 1 : 0 }}
                >
                  {lang === "ru" ? dirLabel : dirLabelEn}
                </span>

                {/* Arrival */}
                <span
                  className="font-bold text-white text-base text-center"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {arrival ? arrival : <span className="text-white/30 text-lg font-bold">—</span>}
                </span>

                {/* Departure */}
                <span
                  className="font-bold text-white text-base text-center"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {departure ? departure : <span className="text-white/30 text-lg font-bold">—</span>}
                </span>

                {/* Platform */}
                <span className="font-bold text-white/80 text-base text-center">{platform}</span>

                {/* Driver */}
                <div className="text-center">
                  <span className="text-white/90 text-sm font-medium">{shift.claimed_by_nickname}</span>
                </div>

                {/* Delete */}
                <div className="flex justify-end">
                  {canRemoveShift(shift) && (
                    <button
                      onClick={() => setDeleteShiftTarget(shift)}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                      title="Освободить рейс"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}

        {/* Claim bar */}
        {canClaimShift(userRole) && (
          <div
            className="px-5 py-4 space-y-3"
            style={{ background: "#252b3b", borderTop: `1px solid ${borderClr}` }}
          >
            <p
              className="text-white/50 text-xs uppercase tracking-wide font-semibold transition-opacity duration-500"
              style={{ opacity: langVisible ? 1 : 0 }}
            >
              {T.claimShift}
            </p>

            {/* Available trains — split by direction */}
            {allUnclaimed.length === 0 ? (
              <p className="text-white/30 text-sm italic">
                Нет доступных рейсов на {formatDateRu(shiftDate)} — все рейсы заняты или база пуста.
              </p>
            ) : (
              <div className="space-y-2">
                {/* Мирный → Приволжск unclaimed */}
                {(() => {
                  const mp = allUnclaimed.filter((t) => t.direction === "mirny-privolzhsk")
                  const pm = allUnclaimed.filter((t) => t.direction === "privolzhsk-mirny")
                  return (
                    <>
                      {mp.length > 0 && (
                        <div>
                          <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Мирный — Приволжск</p>
                          <div className="flex flex-wrap gap-2">
                            {mp.map((t) => {
                              const isSelected = claimTrainNumber === String(t.train_number)
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => setClaimTrainNumber(isSelected ? "" : String(t.train_number))}
                                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all"
                                  style={
                                    isSelected
                                      ? { background: getTieColor(), borderColor: getTieColor(), color: "#fff" }
                                      : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }
                                  }
                                >
                                  <span className="font-bold" style={{ color: isSelected ? "#fff" : "#f5c518" }}>
                                    #{t.train_number}
                                  </span>
                                  <span className="text-xs opacity-70">Мирный — Приволжск</span>
                                  <span className="text-xs opacity-50 uppercase">ПАСС</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {pm.length > 0 && (
                        <div>
                          <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Приволжск — Мирный</p>
                          <div className="flex flex-wrap gap-2">
                            {pm.map((t) => {
                              const isSelected = claimTrainNumber === String(t.train_number)
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => setClaimTrainNumber(isSelected ? "" : String(t.train_number))}
                                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all"
                                  style={
                                    isSelected
                                      ? { background: getTieColor(), borderColor: getTieColor(), color: "#fff" }
                                      : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }
                                  }
                                >
                                  <span className="font-bold" style={{ color: isSelected ? "#fff" : "#f5c518" }}>
                                    #{t.train_number}
                                  </span>
                                  <span className="text-xs opacity-70">Приволжск — Мирный</span>
                                  <span className="text-xs opacity-50 uppercase">ПАСС</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}

            {/* Confirm claim */}
            {claimTrainNumber && (
              <div className="flex items-center gap-3">
                <span className="text-white/60 text-sm">
                  Занять рейс <span className="font-bold text-white">№{claimTrainNumber}</span>?
                </span>
                <Button
                  onClick={handleClaimShift}
                  disabled={isLoading}
                  size="sm"
                  className="h-8 text-white font-semibold"
                  style={{ background: getTieColor() }}
                >
                  Подтвердить
                </Button>
                <button
                  onClick={() => setClaimTrainNumber("")}
                  className="text-white/40 hover:text-white/70 text-sm"
                >
                  Отмена
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ADMIN PANEL */}
      {canManageTrainDB(userRole) && showAdminPanel && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: boardBg, border: `1px solid ${borderClr}` }}
        >
          {/* Header */}
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ background: headerBg }}
          >
            <span className="text-white font-bold text-sm uppercase tracking-wide">База рейсов</span>
            <button
              onClick={() => { setShowTrainForm((v) => !v); setEditingTrainId(null) }}
              className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-semibold text-white bg-white/20 hover:bg-white/30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить
            </button>
          </div>

          {/* Add form */}
          {showTrainForm && (
            <form
              onSubmit={handleAddTrain}
              className="px-5 py-4 space-y-4"
              style={{ borderBottom: `1px solid ${borderClr}`, background: "#0f1419" }}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/60">Номер рейса *</Label>
                  <Input
                    type="number" min={1} required
                    placeholder="301"
                    value={trainForm.train_number}
                    onChange={(e) => setTrainForm((f) => ({ ...f, train_number: e.target.value }))}
                    className="h-8 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs text-white/60">Направление *</Label>
                  <Select value={trainForm.direction} onValueChange={(v) => setTrainForm((f) => ({ ...f, direction: v }))}>
                    <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label} ({d.short})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/60">Класс</Label>
                  <Input
                    value="ПАСС"
                    disabled
                    className="h-8 text-sm bg-white/5 border-white/10 text-white/50 [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Times — for Mirny→Privolzhsk: depart from Mirny, arrive Privolzhsk */}
              {/* For Privolzhsk→Mirny: depart from Privolzhsk, arrive Mirny */}
              <div className="space-y-1">
                <p className="text-xs text-white/40 uppercase tracking-wide">Время (время пассажирское — для пассажиров)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {trainForm.direction === "mirny-privolzhsk" ? (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60">
                          Отпр. Мирный
                          <span className="ml-1 text-white/30">(00/15/30/45)</span>
                        </Label>
                        <Input
                          type="time"
                          value={trainForm.depart_start}
                          onChange={(e) => setTrainForm((f) => ({ ...f, depart_start: e.target.value }))}
                          className={`h-8 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark] ${trainForm.depart_start && !validateDepartureTime(trainForm.depart_start) ? "border-red-500" : ""}`}
                        />
                        {trainForm.depart_start && !validateDepartureTime(trainForm.depart_start) && (
                          <p className="text-red-400 text-[10px]">Только 00, 15, 30, 45 мин</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60">Приб. Приволжск</Label>
                        <Input
                          type="time"
                          value={trainForm.arrive_end}
                          onChange={(e) => setTrainForm((f) => ({ ...f, arrive_end: e.target.value }))}
                          className="h-8 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60">Путь в Мирном (ПАСС)</Label>
                        <Input
                          type="number" min={1}
                          value={trainForm.platform_start}
                          onChange={(e) => setTrainForm((f) => ({ ...f, platform_start: e.target.value }))}
                          className="h-8 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark]"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60">
                          Отпр. Приволжск
                          <span className="ml-1 text-white/30">(00/15/30/45)</span>
                        </Label>
                        <Input
                          type="time"
                          value={trainForm.depart_start}
                          onChange={(e) => setTrainForm((f) => ({ ...f, depart_start: e.target.value }))}
                          className={`h-8 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark] ${trainForm.depart_start && !validateDepartureTime(trainForm.depart_start) ? "border-red-500" : ""}`}
                        />
                        {trainForm.depart_start && !validateDepartureTime(trainForm.depart_start) && (
                          <p className="text-red-400 text-[10px]">Только 00, 15, 30, 45 мин</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60">Приб. Мирный</Label>
                        <Input
                          type="time"
                          value={trainForm.arrive_end}
                          onChange={(e) => setTrainForm((f) => ({ ...f, arrive_end: e.target.value }))}
                          className="h-8 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-white/60">Путь в Приволжске (ПАСС)</Label>
                        <Input
                          type="number" min={1}
                          value={trainForm.platform_start}
                          onChange={(e) => setTrainForm((f) => ({ ...f, platform_start: e.target.value }))}
                          className="h-8 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark]"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isLoading} size="sm" className="text-white font-semibold h-8" style={{ background: getTieColor() }}>
                  Добавить рейс
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 bg-transparent border-white/20 text-white/70 hover:bg-white/10" onClick={() => setShowTrainForm(false)}>
                  Отмена
                </Button>
              </div>
            </form>
          )}

          {/* All trains list */}
          {trains.length === 0 ? (
            <p className="text-center py-8 text-white/40 text-sm">База рейсов пуста</p>
          ) : (
            <div className="divide-y divide-[#2a3040]">
              {/* Мирный → Приволжск group */}
              {[
                { dir: "mirny-privolzhsk" as const, label: "МИРНЫЙ — ПРИВОЛЖСК (1/3)" },
                { dir: "privolzhsk-mirny" as const, label: "ПРИВОЛЖСК — МИРНЫЙ (2/4)" },
              ].map(({ dir, label }) => {
                const group = [...trains]
                  .filter((t) => t.direction === dir)
                  .sort((a, b) => (a.depart_start || "99:99").localeCompare(b.depart_start || "99:99"))

                if (group.length === 0) return null

                return (
                  <div key={dir}>
                    <div
                      className="px-5 py-2"
                      style={{ background: "#252b3b" }}
                    >
                      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#f5c518" }}>
                        {label}
                      </span>
                    </div>
                    {group.map((train, idx) => {
                      const shift = shifts.find((sh) => sh.train_number === train.train_number)
                      const isEditing = editingTrainId === train.id
                      const ef = editForm
                      // Compute depot times
                      const departDepotOffset = dir === "mirny-privolzhsk" ? -3 : -5
                      const depoDepart = addMinutes(train.depart_start, departDepotOffset)
                      const rowBg = idx % 2 === 0 ? rowEvenBg : rowOddBg
                      const startStation = dir === "mirny-privolzhsk" ? "Мирный" : "Приволжск"
                      const endStation = dir === "mirny-privolzhsk" ? "Приволжск" : "Мирный"

                      return (
                        <div
                          key={train.id}
                          className="px-5 py-3"
                          style={{ background: rowBg }}
                        >
                          {isEditing ? (
                            // Edit mode
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-white/60">Номер рейса</Label>
                                  <Input
                                    type="number" min={1}
                                    value={ef.train_number ?? ""}
                                    onChange={(e) => setEditForm((f) => ({ ...f, train_number: e.target.value }))}
                                    className="h-7 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark]"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-white/60">
                                    Отпр. {startStation}
                                    <span className="ml-1 text-white/30">(00/15/30/45)</span>
                                  </Label>
                                  <Input
                                    type="time"
                                    value={ef.depart_start ?? ""}
                                    onChange={(e) => setEditForm((f) => ({ ...f, depart_start: e.target.value }))}
                                    className={`h-7 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark] ${ef.depart_start && !validateDepartureTime(ef.depart_start) ? "border-red-500" : ""}`}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-white/60">Приб. {endStation}</Label>
                                  <Input
                                    type="time"
                                    value={ef.arrive_end ?? ""}
                                    onChange={(e) => setEditForm((f) => ({ ...f, arrive_end: e.target.value }))}
                                    className="h-7 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark]"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-white/60">Путь (ПАСС)</Label>
                                  <Input
                                    type="number" min={1}
                                    value={ef.platform_start ?? ""}
                                    onChange={(e) => setEditForm((f) => ({ ...f, platform_start: e.target.value }))}
                                    className="h-7 text-sm bg-white/5 border-white/10 text-white [color-scheme:dark]"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditSave(train)}
                                  disabled={isLoading}
                                  className="flex items-center gap-1.5 px-3 h-7 rounded text-xs font-semibold text-white bg-green-600 hover:bg-green-500 transition-colors disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Сохранить
                                </button>
                                <button
                                  onClick={() => { setEditingTrainId(null); setEditForm({}) }}
                                  className="flex items-center gap-1.5 px-3 h-7 rounded text-xs font-semibold text-white/60 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Отмена
                                </button>
                              </div>
                            </div>
                          ) : (
                            // View mode
                            <>
                              <div className="flex items-center gap-3 mb-2">
                                <span className="text-xl font-extrabold w-9 flex-shrink-0" style={{ color: "#f5c518" }}>
                                  {train.train_number}
                                </span>
                                <span className="text-xs font-bold uppercase text-white/50 tracking-wide w-12 flex-shrink-0">
                                  ПАСС
                                </span>
                                <span className="text-white/80 text-xs flex-1">
                                  {startStation} — {endStation}
                                </span>
                                {shift ? (
                                  <span className="text-green-400 text-xs font-semibold">{shift.claimed_by_nickname}</span>
                                ) : (
                                  <span className="text-white/25 text-xs italic">Свободен</span>
                                )}
                                <div className="flex items-center gap-1">
                                  {canManageTrainDB(userRole) && (
                                    <button
                                      onClick={() => startEdit(train)}
                                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                                      title="Редактировать рейс"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {canManageTrainDB(userRole) && (
                                    <button
                                      onClick={() => setDeleteTrainTarget(train)}
                                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-red-500/50 hover:text-red-400 transition-colors"
                                      title="Удалить рейс из базы"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-start gap-4 flex-wrap text-xs">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-white/35 uppercase tracking-wide mb-0.5">Отпр. депо</span>
                                  <span className="font-mono font-semibold" style={{ color: "#f5c518" }}>{depoDepart}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-white/35 uppercase tracking-wide mb-0.5">Отпр. {startStation}</span>
                                  <span className="font-mono font-semibold text-white">{train.depart_start || "—"}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-white/35 uppercase tracking-wide mb-0.5">Приб. {endStation}</span>
                                  <span className="font-mono font-semibold text-white">{train.arrive_end || "—"}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-white/35 uppercase tracking-wide mb-0.5">Путь (ПАСС)</span>
                                  <span className="font-mono font-semibold text-white">{train.platform_start}</span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* CONFIRM DIALOGS */}
      <AlertDialog open={!!deleteShiftTarget} onOpenChange={(o) => !o && setDeleteShiftTarget(null)}>
        <AlertDialogContent className="bg-[#1a1f2e] border border-[#2a3040] text-white rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить рейс?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Рейс №{deleteShiftTarget?.train_number} ({deleteShiftTarget?.claimed_by_nickname}) будет освобождён.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteShift} className="bg-red-600 hover:bg-red-700 text-white border-0">
              <UserX className="w-4 h-4 mr-2" /> Освободить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTrainTarget} onOpenChange={(o) => !o && setDeleteTrainTarget(null)}>
        <AlertDialogContent className="bg-[#1a1f2e] border border-[#2a3040] text-white rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить рейс из базы?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Рейс №{deleteTrainTarget?.train_number} будет удалён. Все записи на него также будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTrain} className="bg-red-600 hover:bg-red-700 text-white border-0">
              <Trash2 className="w-4 h-4 mr-2" /> Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
