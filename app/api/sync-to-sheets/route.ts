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
// Структура: строка 0 = название вокзала + часы МСК, строка 1 (headerRow=1) = заголовки колонок, строки 2+ = данные
// colCount = 8: Поезд, Класс, Направление, Прибытие, Отправление, Путь, Опоздание, (Время МСК)
function buildFormatRequests(sheetId: number, headerRow: number, dataRows: number, colCount: number) {
  const requests: any[] = []

  // ── Строка 0: название вокзала (col 0..5) + "ВРЕМЯ МСК" (col 6) + формула (col 7) ──────
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
      mergeType: "MERGE_ALL",
    },
  })
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.dark1,
          textFormat: { bold: true, fontSize: 14, foregroundColor: COLORS.white },
          horizontalAlignment: "LEFT",
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat",
    },
  })
  // col 6: подпись "ВРЕМЯ МСК"
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.dark1,
          textFormat: { bold: true, fontSize: 10, foregroundColor: COLORS.lightGray },
          horizontalAlignment: "RIGHT",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
        },
      },
      fields: "userEnteredFormat",
    },
  })
  // col 7: само время МСК
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 7, endColumnIndex: 8 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.dark3,
          numberFormat: { type: "TIME", pattern: "hh:mm" },
          textFormat: { bold: true, fontSize: 18, foregroundColor: COLORS.yellow },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          borders: {
            top:    { style: "SOLID", width: 2, color: COLORS.lightGray },
            bottom: { style: "SOLID", width: 2, color: COLORS.lightGray },
            left:   { style: "SOLID", width: 2, color: COLORS.lightGray },
            right:  { style: "SOLID", width: 2, color: COLORS.lightGray },
          },
        },
      },
      fields: "userEnteredFormat",
    },
  })
  // Высота строки 0
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 52 },
      fields: "pixelSize",
    },
  })

  // ── Строка 1 (headerRow): заголовки колонок — красный фон ─────────────
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: headerRow, endRowIndex: headerRow + 1 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.red,
          textFormat: { bold: true, fontSize: 12, foregroundColor: COLORS.white },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat",
    },
  })
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: headerRow, endIndex: headerRow + 1 },
      properties: { pixelSize: 36 },
      fields: "pixelSize",
    },
  })

  // ── Строки данных ────────────────────────────────────────────────────────
  for (let i = 0; i < dataRows; i++) {
    const rowIdx = headerRow + 1 + i
    const isEven = i % 2 === 0

    // Фон строки + базовый шрифт
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: isEven ? COLORS.dark2 : COLORS.dark3,
            textFormat: { bold: true, fontSize: 12, foregroundColor: COLORS.lightGray },
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat",
      },
    })

    // Колонка 0 (Поезд) — жёлтый крупный жирный
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 14, foregroundColor: COLORS.yellow },
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
            textFormat: { bold: true, fontSize: 12, foregroundColor: COLORS.yellow },
            horizontalAlignment: "LEFT",
          },
        },
        fields: "userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment",
      },
    })
  }

  // Высота строк данных
  if (dataRows > 0) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: headerRow + 1, endIndex: headerRow + 1 + dataRows },
        properties: { pixelSize: 40 },
        fields: "pixelSize",
      },
    })
  }

  // ── Ширины колонок: Поезд, Класс, Направление, Прибытие, Отправление, Путь, Опоздание, Время МСК ──
  const colWidths = [90, 90, 250, 120, 130, 80, 100, 110]
  colWidths.slice(0, colCount).forEach((px, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: "pixelSize",
      },
    })
  })

  // ── Заморозить 2 строки (название вокзала + заголовки колонок) ──────────
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

    // Только занятые рейсы на выбранную дату + данные поезда
    const shiftRes = await db.query(
      `SELECT ts.*, t.direction, t.class, t.depart_start, t.arrive_middle, t.depart_middle,
              t.arrive_end, t.platform_start, t.platform_middle, t.platform_end
       FROM train_shifts ts
       JOIN trains t ON t.train_number = ts.train_number
       WHERE ts.shift_date = $1
       ORDER BY
         CASE t.direction
           WHEN 'mirny-privolzhsk' THEN 1
           WHEN 'privolzhsk-mirny' THEN 2
           ELSE 3
         END,
         COALESCE(t.depart_start, '99:99') ASC`,
      [shiftDate]
    )
    const claimedShifts: any[] = shiftRes.rows

    await db.end()

    const auth = getAuth()
    const sheets = google.sheets({ version: "v4", auth })

    const spreadsheetId = process.env.GOOGLE_SHEET_ID
    if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID не задан")

    // Получаем список существующих листов (включая кол-во строк)
    const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
    const existingSheets = meta.data.sheets ?? []

    const sheetUrls: string[] = []
    const allFormatRequests: any[] = []
    // Для удаления пустых строк — собираем после получения актуального rowCount
    const deleteRowsRequests: any[] = []

    for (const station of STATION_SHEETS) {
      const sheetId = await ensureSheet(sheets, spreadsheetId, station.name, existingSheets)

      // Только занятые рейсы, проходящие через эту станцию
      const stationShifts = claimedShifts.filter((s) => {
        const dir = s.direction as string
        if (station.key === "mirny")      return dir === "mirny-privolzhsk" || dir === "privolzhsk-mirny"
        if (station.key === "nevsky")     return dir === "mirny-privolzhsk" || dir === "privolzhsk-mirny"
        if (station.key === "privolzhsk") return dir === "mirny-privolzhsk" || dir === "privolzhsk-mirny"
        return false
      })

      const headerRow = 1
      const colCount = 8  // Поезд, Класс, Направление, Прибытие, Отправление, Путь, Опоздание, Время МСК

      // Строим строки
      const rows: (string | number)[][] = []

      // Строка 0: название вокзала (col 0..5) + "ВРЕМЯ МСК" (col 6) + формула времени (col 7)
      rows.push([
        `Вокзал ${station.name}`,
        "", "", "", "", "",
        "ВРЕМЯ\nМСК",
        `=ВРЕМЯ(ЧАС(ТДАТА());МИНУТЫ(ТДАТА());0)`,
      ])

      // Строка 1 (headerRow): заголовки колонок
      rows.push(["№ Поезда", "Категория", "Назначение", "Прибытие", "Отправление", "Путь", "Опоздание", ""])

      // Строки данных (только занятые рейсы)
      for (const s of stationShifts) {
        const { arrival, departure, platform } = getStationTimes(s, station.key)
        const abbr = (s.class as string) === "Пассажирский" ? "ПАСС"
          : (s.class as string) === "Скоростной" ? "СКОР"
          : (s.class as string) === "Туристический" ? "ТУР"
          : (s.class as string) === "Пригородный" ? "ПРИГ"
          : "ПАСС"
        rows.push([
          s.train_number,
          abbr,
          directionLabel(s.direction),
          arrival,
          departure,
          platform,
          0,   // Опоздание — по умолчанию 0
          "",
        ])
      }

      // Записываем данные (USER_ENTERED нужен для формулы)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${station.name}'!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rows },
      })

      // Получаем актуальный rowCount ПОСЛЕ записи данных (Google мог расширить лист)
      const metaAfter = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
      const sheetAfter = (metaAfter.data.sheets ?? []).find((sh: any) => sh.properties?.sheetId === sheetId)
      const actualRowCount = sheetAfter?.properties?.gridProperties?.rowCount ?? 1000
      const usedRows = headerRow + 1 + stationShifts.length

      if (actualRowCount > usedRows) {
        deleteRowsRequests.push({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: usedRows,
              endIndex: actualRowCount,
            },
          },
        })
      }

      // Собираем запросы форматирования
      const fmtRequests = buildFormatRequests(sheetId, headerRow, stationShifts.length, colCount)
      allFormatRequests.push(...fmtRequests)

      sheetUrls.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`)
    }

    // Применяем форматирование
    if (allFormatRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: allFormatRequests },
      })
    }

    // Удаляем пустые строки снизу (отдельным батчем после форматирования)
    if (deleteRowsRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: deleteRowsRequests },
      })
    }

    return NextResponse.json({
      success: true,
      spreadsheetId,
      sheetUrls,
      message: `Обновлены листы: Мирный, Невский, Приволжск (только занятые рейсы)`,
    })
  } catch (err: any) {
    console.error("[sync-to-sheets]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
