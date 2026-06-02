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
    if (stationKey === "mirny")      return { arrival: "—", departure: formatTime(train.depart_start) || "—", platform: train.platform_start || 1 }
    if (stationKey === "nevsky")     return { arrival: formatTime(train.arrive_middle) || "—", departure: formatTime(train.depart_middle) || "—", platform: train.platform_middle || 1 }
    if (stationKey === "privolzhsk") return { arrival: formatTime(train.arrive_end) || "—", departure: "—", platform: train.platform_end || 1 }
  }

  if (dir === "privolzhsk-mirny") {
    if (stationKey === "privolzhsk") return { arrival: "—", departure: formatTime(train.depart_start) || "—", platform: train.platform_start || 1 }
    if (stationKey === "nevsky")     return { arrival: formatTime(train.arrive_middle) || "—", departure: formatTime(train.depart_middle) || "—", platform: train.platform_middle || 1 }
    if (stationKey === "mirny")      return { arrival: formatTime(train.arrive_end) || "—", departure: "—", platform: train.platform_end || 1 }
  }

  return { arrival: "—", departure: "—", platform: 1 }
}

function directionLabel(direction: string): string {
  if (direction === "mirny-privolzhsk") return "Мирный — Приволжск"
  if (direction === "privolzhsk-mirny") return "Приволжск — Мирный"
  return direction
}

// Postgres может вернуть время как строку "HH:MM:SS", Date-объект или число.
// Всегда приводим к "HH:MM" для чистого текстового вывода в ячейке.
function formatTime(val: any): string {
  if (!val || val === "—") return "—"
  if (typeof val === "string") {
    // "HH:MM:SS" или "HH:MM" — берём первые 5 символов
    const trimmed = val.trim()
    if (/^\d{2}:\d{2}/.test(trimmed)) return trimmed.slice(0, 5)
    return trimmed
  }
  if (val instanceof Date) {
    const h = String(val.getUTCHours()).padStart(2, "0")
    const m = String(val.getUTCMinutes()).padStart(2, "0")
    return `${h}:${m}`
  }
  return String(val)
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
    // Не очищаем через clear — данные перезапишутся через values.update,
    // а лишние строки удалятся через deleteRowsRequests ниже.
    return found.properties!.sheetId!
  }
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
  })
  return res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
}

// Строим форматирование для строк данных.
// Строки 1-4 (индексы 0-3), столбец A (индекс 0), ширины столбцов и заморозка — НЕ трогаем.
// Данные начинаются с B5 (rowIndex=4, colIndex=1).
// dataColCount = 7: № Поезда (B), Категория (C), Назначение (D), Прибытие (E), Отправление (F), Путь (G), Опоздание (H)
function buildFormatRequests(
  sheetId: number,
  _headerRow: number,
  dataRows: number,
  dataColCount: number,
  isEmpty: boolean,
  delays: number[]
) {
  const requests: any[] = []

  if (isEmpty) {
    // Одна объединённая строка «Рейсов нет»
    requests.push({
      mergeCells: {
        range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 1 + dataColCount },
        mergeType: "MERGE_ALL",
      },
    })
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 + dataColCount },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLORS.dark2,
            textFormat: { bold: true, fontSize: 13, foregroundColor: COLORS.lightGray, italic: true },
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat",
      },
    })
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 50 },
        fields: "pixelSize",
      },
    })
    return requests
  }

  // ── Строки данных (B5+, rowIndex 4+, colIndex 1+) ───────────────────────
  for (let i = 0; i < dataRows; i++) {
    const rowIdx = 4 + i
    const isEven = i % 2 === 0
    const colEnd   = 1 + dataColCount    // столбец I (не включительно)
    const delay = delays[i] ?? 0
    const isDelayed = delay > 0

    const rowBg = isEven ? COLORS.dark2 : COLORS.dark3

    // Фон строки + базовый шрифт (A–H включительно, столбец 0–colEnd)
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: colEnd },
        cell: {
          userEnteredFormat: {
            backgroundColor: rowBg,
            textFormat: { bold: true, fontSize: 12, foregroundColor: COLORS.lightGray },
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat",
      },
    })

    // Столбец B (colIndex 1) — № Поезда, жёлтый крупный
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 1, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              fontSize: 14,
              foregroundColor: COLORS.yellow,
            },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment",
      },
    })

    // Столбец D (colIndex 3) — Назначение, жёлтый, выравнивание по левому краю
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 3, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              fontSize: 12,
              foregroundColor: COLORS.yellow,
            },
            horizontalAlignment: "LEFT",
          },
        },
        fields: "userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment",
      },
    })

    // Столбец H (colIndex 7) — Опоздание: только цвет текста меняется на жёлтый если есть задержка
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 7, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
              fontSize: 12,
              foregroundColor: isDelayed ? COLORS.yellow : { red: 0.4, green: 0.4, blue: 0.4 },
            },
            horizontalAlignment: "CENTER",
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
        range: { sheetId, dimension: "ROWS", startIndex: 4, endIndex: 4 + dataRows },
        properties: { pixelSize: 40 },
        fields: "pixelSize",
      },
    })
  }

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
              t.arrive_end, t.platform_start, t.platform_middle, t.platform_end,
              COALESCE(ts.delay_minutes, 0) AS delay_minutes
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

      // Строки 1-4 в таблице (индексы 0-3) — шапка, сделана вручную, НЕ перезаписываем.
      // Данные пишем начиная с A5 (индекс 4).
      // headerRow = 3 — не используется для записи, только передаётся в buildFormatRequests.
      const headerRow = 3
      const colCount = 7  // B–H: № Поезда, Категория, Назначение, Прибытие, Отправление, Путь, Опоздание

      // Строим строки данных начиная с A5 (без строки заголовков — она уже есть в таблице)
      const rows: (string | number)[][] = []

      // Строки данных (только занятые рейсы), начиная с B5 (столбец A — декоративный)
      if (stationShifts.length === 0) {
        // Нет рейсов — добавляем одну строку с объединёнными ячейками
        rows.push(["Рейсов на данный период не запланировано", "", "", "", "", "", ""])
      } else {
        for (const s of stationShifts) {
          const { arrival, departure, platform } = getStationTimes(s, station.key)
          const abbr = (s.class as string) === "Пассажирский" ? "ПАСС"
            : (s.class as string) === "Скоростной" ? "СКОР"
            : (s.class as string) === "Туристический" ? "ТУР"
            : (s.class as string) === "Пригородный" ? "ПРИГ"
            : "ПАСС"
          rows.push([
            s.train_number,           // B — № Поезда
            abbr,                     // C — Категория
            directionLabel(s.direction), // D — Назначение
            arrival,                  // E — Прибытие (строка "HH:MM" или "—")
            departure,                // F — Отправление
            platform,                 // G — Путь
            (s.delay_minutes ?? 0) > 0 ? s.delay_minutes : "—", // H — Опоздание
          ])
        }
      }

      // Получаем текущий rowCount листа чтобы понять нужно ли расширять
      const currentSheet = existingSheets.find((sh: any) => sh.properties?.sheetId === sheetId)
      const currentRowCount = currentSheet?.properties?.gridProperties?.rowCount ?? 0
      // шапка 4 строки + строки данных (минимум 1 для строки "нет рейсов")
      const neededRows = 4 + Math.max(rows.length, 1)

      // Расширяем лист если строк не хватает
      if (currentRowCount < neededRows) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              appendDimension: {
                sheetId,
                dimension: "ROWS",
                length: neededRows - currentRowCount,
              },
            }],
          },
        })
      }

      // Сначала снимаем все объединения в зоне данных (строки 5+),
      // чтобы предыдущее "Рейсов нет" не ломало запись новых строк.
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            unmergeCells: {
              range: { sheetId, startRowIndex: 4, endRowIndex: 4 + Math.max(rows.length, 1) + 1, startColumnIndex: 1, endColumnIndex: 1 + colCount },
            },
          }],
        },
      })

      // Записываем данные с B5. RAW — чтобы строки "18:22" не превращались в числа
      // rows уже содержит либо строки данных, либо одну строку "нет рейсов"
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${station.name}'!B5`,
        valueInputOption: "RAW",
        requestBody: { values: rows },
      })

      // Удаляем лишние строки ниже данных
      const actualRowCount = Math.max(currentRowCount, neededRows)
      // When empty: 1 "no trains" row; when data: stationShifts.length rows
      const usedRows = 4 + (stationShifts.length === 0 ? 1 : stationShifts.length)

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
      const delays = stationShifts.map((s) => s.delay_minutes ?? 0)
      const fmtRequests = buildFormatRequests(sheetId, headerRow, stationShifts.length, colCount, stationShifts.length === 0, delays)
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
