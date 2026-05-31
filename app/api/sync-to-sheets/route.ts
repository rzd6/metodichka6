import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { GoogleAuth } from "google-auth-library"
import { Pool } from "pg"

function getPool(): Pool {
  const connectionString = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING
  if (!connectionString) throw new Error("Не задана переменная POSTGRES_URL или POSTGRES_URL_NON_POOLING")
  return new Pool({ connectionString, max: 3 })
}

const SERVICE_ACCOUNT_EMAIL = "rzd6-metodichka@rzd-metodichka.iam.gserviceaccount.com"

function getAuth() {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!privateKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY не задан")
  return new GoogleAuth({
    credentials: {
      client_email: SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  })
}

function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}

// Цвета в формате Google Sheets (0-1)
const COLORS = {
  dark1: { red: 0.078, green: 0.094, blue: 0.125 },   // #141830 — самый тёмный
  dark2: { red: 0.102, green: 0.122, blue: 0.176 },   // #1A1F2D — тёмный
  dark3: { red: 0.133, green: 0.157, blue: 0.22 },    // #222838 — светлее
  red:   { red: 0.753, green: 0.224, blue: 0.169 },   // #C03929 — красный заголовок
  yellow: { red: 0.961, green: 0.773, blue: 0.094 },  // #F5C518 — жёлтый
  white: { red: 1, green: 1, blue: 1 },
  lightGray: { red: 0.88, green: 0.88, blue: 0.88 },
}

// Три фиксированных листа по станциям
const STATION_SHEETS = [
  { name: "Мирный",     key: "mirny" },
  { name: "Невский",    key: "nevsky" },
  { name: "Приволжск",  key: "privolzhsk" },
]

/**
 * Для каждой станции формируем строки расписания:
 * показываем только прибытие и отправление для этой станции.
 *
 * Логика по направлениям:
 *  mirny-privolzhsk:
 *    Мирный    → depart_start (только отправление, прибытие нет)
 *    Невский   → arrive_middle / depart_middle
 *    Приволжск → arrive_end (только прибытие, отправления нет)
 *
 *  privolzhsk-mirny:
 *    Приволжск → depart_start (только отправление)
 *    Невский   → arrive_middle / depart_middle
 *    Мирный    → arrive_end (только прибытие)
 */
function getStationTimes(
  train: any,
  stationKey: string
): { arrival: string; departure: string; platform: number } {
  const dir = train.direction as string

  if (dir === "mirny-privolzhsk") {
    if (stationKey === "mirny")     return { arrival: "—", departure: train.depart_start || "—", platform: train.platform_start || 1 }
    if (stationKey === "nevsky")    return { arrival: train.arrive_middle || "—", departure: train.depart_middle || "—", platform: train.platform_middle || 1 }
    if (stationKey === "privolzhsk") return { arrival: train.arrive_end || "—", departure: "—", platform: train.platform_end || 1 }
  }

  if (dir === "privolzhsk-mirny") {
    if (stationKey === "privolzhsk") return { arrival: "—", departure: train.depart_start || "—", platform: train.platform_start || 1 }
    if (stationKey === "nevsky")    return { arrival: train.arrive_middle || "—", departure: train.depart_middle || "—", platform: train.platform_middle || 1 }
    if (stationKey === "mirny")    return { arrival: train.arrive_end || "—", departure: "—", platform: train.platform_end || 1 }
  }

  return { arrival: "—", departure: "—", platform: 1 }
}

function directionLabel(direction: string): string {
  if (direction === "mirny-privolzhsk") return "Мирный — Приволжск"
  if (direction === "privolzhsk-mirny") return "Приволжск — Мирный"
  return direction
}

// Гарантируем что лист с нужным именем существует, возвращаем его sheetId
async function ensureSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string,
  existingSheets: any[]
): Promise<number> {
  const found = existingSheets.find((s: any) => s.properties?.title === sheetName)
  if (found) {
    // Очищаем содержимое
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${sheetName}'` })
    return found.properties!.sheetId!
  }
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  })
  return res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
}

// Строим форматирование для одного листа
function buildFormatRequests(sheetId: number, headerRow: number, dataRows: number, colCount: number) {
  const requests: any[] = []

  // Заголовок (строка 0): слияние + тёмный + белый жирный
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      mergeType: "MERGE_ALL",
    },
  })
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.dark1,
          textFormat: { bold: true, fontSize: 13, foregroundColor: COLORS.white },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat",
    },
  })

  // Строка с названием станции (строка 1): слияние + жёлтый текст
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: colCount },
      mergeType: "MERGE_ALL",
    },
  })
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 2 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.dark2,
          textFormat: { bold: true, fontSize: 11, foregroundColor: COLORS.yellow },
          horizontalAlignment: "LEFT",
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat",
    },
  })

  // Строка заголовка колонок (headerRow): красный фон + белый жирный
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: headerRow, endRowIndex: headerRow + 1 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.red,
          textFormat: { bold: true, fontSize: 10, foregroundColor: COLORS.white },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat",
    },
  })

  // Строки данных: чередующийся фон + номер поезда жёлтый + направление жёлтое
  for (let i = 0; i < dataRows; i++) {
    const rowIdx = headerRow + 1 + i
    const isEven = i % 2 === 0

    // Фон строки
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: isEven ? COLORS.dark2 : COLORS.dark3,
            textFormat: { fontSize: 11, foregroundColor: COLORS.lightGray },
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat",
      },
    })

    // Колонка 0 (Поезд) — жёлтый жирный
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 12, foregroundColor: COLORS.yellow },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment",
      },
    })

    // Колонка 2 (Направление) — жёлтый жирный
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 2, endColumnIndex: 3 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, foregroundColor: COLORS.yellow },
            horizontalAlignment: "LEFT",
          },
        },
        fields: "userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment",
      },
    })
  }

  // Ширины колонок: Поезд, Класс, Направление, Прибытие, Отправление, Путь
  const colWidths = [80, 80, 220, 100, 110, 80]
  colWidths.forEach((px, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: "pixelSize",
      },
    })
  })

  // Высота строки заголовка колонок
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: headerRow, endIndex: headerRow + 1 },
      properties: { pixelSize: 32 },
      fields: "pixelSize",
    },
  })

  // Высота строк данных
  if (dataRows > 0) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: headerRow + 1, endIndex: headerRow + 1 + dataRows },
        properties: { pixelSize: 36 },
        fields: "pixelSize",
      },
    })
  }

  // Заморозить первые 3 строки (заголовок + станция + колонки)
  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: headerRow + 1 } },
      fields: "gridProperties.frozenRowCount",
    },
  })

  return requests
}

// POST /api/sync-to-sheets  { date: "YYYY-MM-DD" }
export async function POST(req: NextRequest) {
  try {
    const { date } = await req.json()
    const shiftDate = date || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" })
    const dateLabel = formatDateRu(shiftDate)

    const db = getPool()

    // Все поезда
    const trainRes = await db.query("SELECT * FROM trains ORDER BY train_number ASC")
    const trains: any[] = trainRes.rows

    await db.end()

    const auth = getAuth()
    const sheets = google.sheets({ version: "v4", auth })

    const spreadsheetId = process.env.GOOGLE_SHEET_ID
    if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID не задан")

    // Получаем список существующих листов
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const existingSheets = meta.data.sheets ?? []

    const sheetUrls: string[] = []
    const allFormatRequests: any[] = []

    for (const station of STATION_SHEETS) {
      const sheetId = await ensureSheet(sheets, spreadsheetId, station.name, existingSheets)

      // Поезда которые проходят через эту станцию
      const stationTrains = trains.filter((t) => {
        const dir = t.direction
        if (station.key === "mirny")     return dir === "mirny-privolzhsk" || dir === "privolzhsk-mirny"
        if (station.key === "nevsky")    return dir === "mirny-privolzhsk" || dir === "privolzhsk-mirny"
        if (station.key === "privolzhsk") return dir === "mirny-privolzhsk" || dir === "privolzhsk-mirny"
        return false
      })

      // Строим строки
      const rows: (string | number)[][] = []

      // Строка 0: заголовок
      rows.push([`РАСПИСАНИЕ ДВИЖЕНИЯ ПОЕЗДОВ — ${dateLabel}`])

      // Строка 1: название станции
      rows.push([`Станция ${station.name}`])

      // Строка 2: пустая разделитель
      rows.push([""])

      // Строка 3: заголовки колонок (headerRow = 3)
      const headerRow = 3
      rows.push(["Поезд", "Класс", "Направление", "Прибытие", "Отправление", "Путь"])

      // Строки данных
      for (const t of stationTrains) {
        const { arrival, departure, platform } = getStationTimes(t, station.key)
        rows.push([
          t.train_number,
          "ПАСС",
          directionLabel(t.direction),
          arrival,
          departure,
          platform,
        ])
      }

      // Записываем данные
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${station.name}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: rows },
      })

      // Собираем запросы форматирования
      const fmtRequests = buildFormatRequests(sheetId, headerRow, stationTrains.length, 6)
      allFormatRequests.push(...fmtRequests)

      sheetUrls.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`)
    }

    // Применяем всё форматирование одним батчем
    if (allFormatRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: allFormatRequests },
      })
    }

    return NextResponse.json({
      success: true,
      spreadsheetId,
      sheetUrls,
      message: `Обновлены листы: Мирный, Невский, Приволжск`,
    })
  } catch (err: any) {
    console.error("[sync-to-sheets]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
