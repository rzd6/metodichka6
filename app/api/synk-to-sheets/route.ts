import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { GoogleAuth } from "google-auth-library"
import { Pool } from "pg"

function getPool(): Pool {
  const connectionString = process.env.POSTGRES_URL_NON_POOLING
  if (!connectionString) throw new Error("Не задана переменная POSTGRES_URL_NON_POOLING")
  return new Pool({ connectionString })
}
  return pool
}

const SERVICE_ACCOUNT_EMAIL = "rzd6-metodichka@rzd-metodichka.iam.gserviceaccount.com"

function getAuth() {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!privateKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY не задан")

  // Normalize escaped newlines that come from env var storage
  const normalizedKey = privateKey.replace(/\\n/g, "\n")

  const auth = new GoogleAuth({
    credentials: {
      client_email: SERVICE_ACCOUNT_EMAIL,
      // google-auth-library converts PKCS#1 → PKCS#8 internally, avoiding ERR_OSSL_UNSUPPORTED
      private_key: normalizedKey,
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  })
  return auth
}

// Ensure spreadsheet exists and is shared (or create new)
async function ensureSpreadsheet(sheets: ReturnType<typeof google.sheets>, drive: ReturnType<typeof google.drive>, date: string): Promise<string> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID
  if (spreadsheetId) return spreadsheetId

  // Create new spreadsheet
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `Расписание поездов РЖД6` },
    },
  })
  const newId = created.data.spreadsheetId!

  // Make it accessible for anyone with link (viewer)
  await drive.permissions.create({
    fileId: newId,
    requestBody: { role: "reader", type: "anyone" },
  })

  return newId
}

function addMinutes(time: string | null | undefined, mins: number): string {
  if (!time) return "—"
  const [h, m] = time.split(":").map(Number)
  const total = h * 60 + m + mins
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60).toString().padStart(2, "0")
  const mm = (((total % 1440) + 1440) % 1440 % 60).toString().padStart(2, "0")
  return `${hh}:${mm}`
}

function formatDateSheet(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}

// POST /api/sync-to-sheets  { date: "YYYY-MM-DD" }
export async function POST(req: NextRequest) {
  try {
    const { date } = await req.json()
    const shiftDate = date || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" })

    const db = getPool()

    // Load all trains
    const trainRes = await db.query("SELECT * FROM trains ORDER BY train_number ASC")
    const trains: any[] = trainRes.rows

    // Load shifts for date
    const shiftRes = await db.query(
      `SELECT ts.*, t.direction, t.class, t.depart_start, t.arrive_middle,
              t.depart_middle, t.arrive_end, t.platform_start, t.platform_middle, t.platform_end
       FROM train_shifts ts
       JOIN trains t ON t.id = ts.train_id
       WHERE ts.shift_date = $1
       ORDER BY ts.train_number ASC`,
      [shiftDate]
    )
    const shifts: any[] = shiftRes.rows

    const auth = getAuth()
    const sheets = google.sheets({ version: "v4", auth })
    const drive = google.drive({ version: "v3", auth })

    const spreadsheetId = await ensureSpreadsheet(sheets, drive, shiftDate)

    const dateLabel = formatDateSheet(shiftDate)
    const sheetTitle = `Расписание ${dateLabel}`

    // Get existing sheets
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const existingSheets = meta.data.sheets ?? []
    const existing = existingSheets.find((s: any) => s.properties?.title === sheetTitle)

    let sheetId: number

    if (existing) {
      sheetId = existing.properties!.sheetId!
      // Clear the sheet
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${sheetTitle}'`,
      })
    } else {
      // Add new sheet
      const addReq = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetTitle } } }],
        },
      })
      sheetId = (addReq.data.replies?.[0]?.addSheet?.properties?.sheetId) ?? 0
    }

    // Build rows
    // Section 1: Мирный → Приволжск (1/3)
    const mp = trains.filter((t) => t.direction === "mirny-privolzhsk")
    // Section 2: Приволжск → Мирный (2/4)
    const pm = trains.filter((t) => t.direction === "privolzhsk-mirny")

    const rows: (string | number)[][] = []

    rows.push([`РАСПИСАНИЕ ДВИЖЕНИЯ ПОЕЗДОВ НА ${dateLabel}`])
    rows.push([])

    // --- МИРНЫЙ → ПРИВОЛЖСК ---
    rows.push(["МИРНЫЙ — ПРИВОЛЖСК (1/3)"])
    rows.push([
      "Номер поезда",
      "Категория",
      "Направление",
      "Прибытие",
      "Отправление",
      "Путь (ПАСС)",
      "Отпр. из депо",
      "Прибытие на конечную",
      "Машинист",
    ])

    if (mp.length === 0) {
      rows.push(["Рейсы отсутствуют"])
    } else {
      for (const t of mp) {
        const shift = shifts.find((s) => s.train_number === t.train_number)
        const departDepot = addMinutes(t.depart_start, -3) // -3 мин от отправления Мирный
        const arriveEnd = t.arrive_end || "—"
        rows.push([
          t.train_number,
          "ПАСС",
          "Мирный — Приволжск",
          "—",
          t.depart_start || "—",
          t.platform_start || 1,
          departDepot,
          arriveEnd,
          shift ? shift.claimed_by_nickname : "—",
        ])
      }
    }

    rows.push([])

    // --- ПРИВОЛЖСК → МИРНЫЙ ---
    rows.push(["ПРИВОЛЖСК — МИРНЫЙ (2/4)"])
    rows.push([
      "Номер поезда",
      "Категория",
      "Направление",
      "Прибытие",
      "Отправление",
      "Путь (ПАСС)",
      "Отпр. из депо",
      "Прибытие на конечную",
      "Машинист",
    ])

    if (pm.length === 0) {
      rows.push(["Рейсы отсутствуют"])
    } else {
      for (const t of pm) {
        const shift = shifts.find((s) => s.train_number === t.train_number)
        const departDepot = addMinutes(t.depart_start, -5) // -5 мин от отправления Приволжск
        const arriveEnd = t.arrive_end || "—"
        rows.push([
          t.train_number,
          "ПАСС",
          "Приволжск — Мирный",
          "—",
          t.depart_start || "—",
          t.platform_start || 2,
          departDepot,
          arriveEnd,
          shift ? shift.claimed_by_nickname : "—",
        ])
      }
    }

    rows.push([])
    rows.push([`Обновлено: ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (МСК)`])

    // Write rows
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetTitle}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    })

    // Format: header row merge + bold + colors
    const formatRequests: any[] = []

    // Title row: merge A1:I1 + bold + dark background
    formatRequests.push({
      mergeCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
        mergeType: "MERGE_ALL",
      },
    })
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.102, green: 0.122, blue: 0.176 },
            textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat",
      },
    })

    // Section headers + column headers
    const sectionRows = [2, mp.length + 5] // 0-indexed row indices for section title rows
    // Мирный→Приволжск section header at row 2 (0-indexed)
    const mpSectionRow = 2
    const mpHeaderRow = 3
    const pmSectionRow = mp.length + 5
    const pmHeaderRow = mp.length + 6

    for (const sr of [mpSectionRow, pmSectionRow]) {
      formatRequests.push({
        mergeCells: {
          range: { sheetId, startRowIndex: sr, endRowIndex: sr + 1, startColumnIndex: 0, endColumnIndex: 9 },
          mergeType: "MERGE_ALL",
        },
      })
      formatRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: sr, endRowIndex: sr + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.149, green: 0.122, blue: 0.173 },
              textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.961, green: 0.773, blue: 0.094 } },
              horizontalAlignment: "LEFT",
            },
          },
          fields: "userEnteredFormat",
        },
      })
    }

    // Column header rows: red background
    for (const hr of [mpHeaderRow, pmHeaderRow]) {
      formatRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: hr, endRowIndex: hr + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.753, green: 0.224, blue: 0.169 },
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            },
          },
          fields: "userEnteredFormat",
        },
      })
    }

    // Train number cells: yellow text
    const mpDataStart = mpHeaderRow + 1
    const mpDataEnd = mpDataStart + mp.length
    const pmDataStart = pmHeaderRow + 1
    const pmDataEnd = pmDataStart + pm.length

    for (const [start, end] of [[mpDataStart, mpDataEnd], [pmDataStart, pmDataEnd]]) {
      // Train number col (A) yellow
      formatRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: start, endRowIndex: end, startColumnIndex: 0, endColumnIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 0.961, green: 0.773, blue: 0.094 } },
            },
          },
          fields: "userEnteredFormat",
        },
      })
      // Direction col (C) yellow
      formatRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: start, endRowIndex: end, startColumnIndex: 2, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, foregroundColor: { red: 0.961, green: 0.773, blue: 0.094 } },
            },
          },
          fields: "userEnteredFormat",
        },
      })
      // Odd/even row alternating backgrounds
      for (let r = start; r < end; r++) {
        const isEven = (r - start) % 2 === 0
        formatRequests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: r, endRowIndex: r + 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: isEven
                  ? { red: 0.078, green: 0.094, blue: 0.125 }
                  : { red: 0.102, green: 0.122, blue: 0.176 },
                textFormat: { foregroundColor: { red: 0.9, green: 0.9, blue: 0.9 } },
              },
            },
            fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
          },
        })
      }
    }

    // Set column widths
    const colWidths = [80, 80, 200, 100, 110, 100, 110, 150, 180]
    colWidths.forEach((px, i) => {
      formatRequests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: px },
          fields: "pixelSize",
        },
      })
    })

    // Freeze header row
    formatRequests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    })

    if (formatRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: formatRequests },
      })
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`
    return NextResponse.json({ success: true, spreadsheetId, sheetUrl })
  } catch (err: any) {
    console.error("[sync-to-sheets]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
