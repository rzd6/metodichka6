import { NextResponse } from "next/server"
import { google } from "googleapis"
import { GoogleAuth } from "google-auth-library"
import { Pool } from "pg"

// Disable self-signed cert check for Supabase/PG direct connection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

const SPREADSHEET_ID = "1CnTpA7Xj7T5Tsofw_oq9S9FldU_AnOd_oiGMLPigEEg"
const SHEET_NAME = "Лист1" // first/only sheet
const DEV_NICKNAME = "v0_dev_rzd"
const SERVICE_ACCOUNT_EMAIL = "rzd6-metodichka@rzd-metodichka.iam.gserviceaccount.com"

function getPool(): Pool {
  const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
  if (!connectionString) throw new Error("Не задана переменная POSTGRES_URL_NON_POOLING")
  return new Pool({ connectionString, max: 3 })
}

function getAuth() {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!privateKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY не задан")
  return new GoogleAuth({
    credentials: {
      client_email: SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

/**
 * Normalize position from the Google Sheet to match our POSITIONS_BY_ROLE keys.
 * The sheet uses slightly different spelling (е.g. "Зам. Начальника Депо" vs "Заместитель Начальника Депо").
 */
const POSITION_MAP: Record<string, string> = {
  // Руководство
  "Начальник Депо": "Начальник Депо",

  // Заместитель
  "Первый Заместитель Начальника Депо": "Первый Заместитель Начальника Депо",
  "Зам. Начальника Депо по кадровой работе": "Заместитель Начальника Депо по кадровой работе",
  "Заместитель Начальника Депо по кадровой работе": "Заместитель Начальника Депо по кадровой работе",
  "Зам. Начальника Депо по эксплуатации": "Заместитель Начальника Депо по эксплуатации",
  "Заместитель Начальника Депо по эксплуатации": "Заместитель Начальника Депо по эксплуатации",
  "Зам. Начальника Депо по работе с составом": "Заместитель Начальника Депо по работе с составом",

  // Старший Состав
  "Начальник ЭО": "Начальник ЭО",
  "Начальник ЦдУД": "Начальник ЦдУД",
  "Начальник ПТО": "Начальник ПТО",
  "Машинист-инструктор / Зам.Нач.ЭО": "Машинист-инструктор/Зам.Нач.ЭО",
  "Машинист-инструктор / Зам.Нач.ЦдУД": "Машинист-инструктор/Зам.Нач.ЦдУД",
  "Машинист-инструктор / Зам.Нач.ПТО": "Машинист-инструктор/Зам.Нач.ПТО",
  "Машинист-инструктор/Зам.Нач.ЭО": "Машинист-инструктор/Зам.Нач.ЭО",
  "Машинист-инструктор/Зам.Нач.ЦдУД": "Машинист-инструктор/Зам.Нач.ЦдУД",
  "Машинист-инструктор/Зам.Нач.ПТО": "Машинист-инструктор/Зам.Нач.ПТО",

  // ЦдУД
  "Помощник машиниста": "Помощник машиниста",
  "Машинист 3-го класса": "Машинист третьего класса",
  "Машинист третьего класса": "Машинист третьего класса",
  "Машинист 2-го класса": "Машинист второго класса",
  "Машинист второго класса": "Машинист второго класса",
  "Машинист 1-го класса": "Машинист первого класса",
  "Машинист первого класса": "Машинист первого класса",
  "Оператор при ДНЦ": "Оператор при поездном диспетчере",
  "Оператор при поездном диспетчере": "Оператор при поездном диспетчере",
  "Поездной диспетчер": "Поездной диспетчер",
  "Старший диспетчер": "Старший поездной диспетчер",
  "Старший поездной диспетчер": "Старший поездной диспетчер",

  // ПТО
  "Слесарь-электрик": "Слесарь-электрик",
  "Монтёр пути": "Монтёр пути",
  "Монтер пути": "Монтёр пути",
}

/** Map normalized position to role */
const POSITION_TO_ROLE: Record<string, string> = {
  "Начальник Депо": "Руководство",
  "Первый Заместитель Начальника Депо": "Заместитель",
  "Заместитель Начальника Депо по кадровой работе": "Заместитель",
  "Заместитель Начальника Депо по эксплуатации": "Заместитель",
  "Заместитель Начальника Депо по работе с составом": "Заместитель",
  "Начальник ЭО": "Старший Состав",
  "Начальник ЦдУД": "Старший Состав",
  "Начальник ПТО": "Старший Состав",
  "Машинист-инструктор/Зам.Нач.ЭО": "Старший Состав",
  "Машинист-инструктор/Зам.Нач.ЦдУД": "Старший Состав",
  "Машинист-инструктор/Зам.Нач.ПТО": "Старший Состав",
  "Помощник машиниста": "ЦдУД",
  "Машинист третьего класса": "ЦдУД",
  "Машинист второго класса": "ЦдУД",
  "Машинист первого класса": "ЦдУД",
  "Оператор при поездном диспетчере": "ЦдУД",
  "Поездной диспетчер": "ЦдУД",
  "Старший поездной диспетчер": "ЦдУД",
  "Слесарь-электрик": "ПТО",
  "Монтёр пути": "ПТО",
}

const ROLE_RANK: Record<string, number> = {
  "Тех. Администратор": 10,
  "Руководство": 9,
  "Заместитель": 8,
  "Старший Состав": 7,
  "ЦдУД": 5,
  "ПТО": 3,
}

/** Extract VK numeric ID from text-with-hyperlink like "vk.com/id12345" or bare number */
function extractVkId(raw: string | undefined): string | null {
  if (!raw) return null
  // Matches numeric VK user ID patterns
  const idMatch = raw.match(/\bid(\d+)\b/)
  if (idMatch) return idMatch[1]
  // Bare number
  const numMatch = raw.match(/^\d+$/)
  if (numMatch) return raw.trim()
  return null
}

/** Parse the Google Sheets value.  Google Sheets Hyperlink cells often come as
 *  `=HYPERLINK("url","text")` in the raw value or just the plain URL string. */
function parseVkCellValue(cell: any): string | null {
  if (!cell) return null
  const str = String(cell).trim()
  // =HYPERLINK("https://vk.com/idXXX","Label") — grab the URL part
  const hyperlinkMatch = str.match(/HYPERLINK\("([^"]+)"/)
  if (hyperlinkMatch) return extractVkId(hyperlinkMatch[1])
  return extractVkId(str)
}

interface SheetEmployee {
  nickname: string
  position: string
  bankAccount: string
  vkId: string | null
}

/** Determine whether a row is a section-header row (nickname cell is empty or contains known headers) */
function isSectionRow(row: any[]): boolean {
  const a = String(row[0] ?? "").trim()
  if (!a) return true
  // Common header/title patterns
  if (/общее количество/i.test(a)) return true
  if (/состав/i.test(a) && !/инструктор/i.test(a)) return true
  if (/^ЦдУД$|^ПТО$|дирекция|отдел|руководящий/i.test(a)) return true
  if (/никнейм/i.test(a)) return true
  return false
}

/** Parse employees from raw sheet rows (any format / number of header rows). */
function parseEmployees(rows: any[][]): SheetEmployee[] {
  const employees: SheetEmployee[] = []

  for (const row of rows) {
    const nickname = String(row[0] ?? "").trim()
    const positionRaw = String(row[2] ?? "").trim() // col C (index 2)
    const bankAccount = String(row[7] ?? "").trim() // col H (index 7)
    const vkRaw = row[8] // col I (index 8)

    // Skip section headers / empty rows / rows with no nickname
    if (!nickname || isSectionRow(row)) continue
    // Skip rows where position is empty or looks like a header
    if (!positionRaw || /должность|ранг|никнейм/i.test(positionRaw)) continue

    const normalizedPosition = POSITION_MAP[positionRaw] ?? positionRaw

    employees.push({
      nickname,
      position: normalizedPosition,
      bankAccount,
      vkId: parseVkCellValue(vkRaw),
    })
  }

  return employees
}

async function ensureDefaultPasswordColumn(db: Pool): Promise<void> {
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_default_password BOOLEAN DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS position_title TEXT DEFAULT NULL;
  `)
}

// GET /api/sync-from-sheets — read sheet and sync users
export async function GET() {
  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: "v4", auth })

    // Read a wide range — A:P covers all needed columns
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `A:P`,
      valueRenderOption: "FORMULA", // preserve HYPERLINK formulas
    })

    const rows: any[][] = (response.data.values ?? []) as any[][]
    const sheetEmployees = parseEmployees(rows)

    const db = getPool()
    await ensureDefaultPasswordColumn(db)

    // Fetch all current users from DB
    const { rows: dbUsers } = await db.query(
      "SELECT id, username, password, position, secondary_role, is_default_password FROM users"
    )

    const dbByNickname = new Map<string, any>()
    for (const u of dbUsers) dbByNickname.set(u.username, u)

    const sheetNicknames = new Set(sheetEmployees.map((e) => e.nickname))

    const stats = { created: 0, updated: 0, deleted: 0, skipped: 0 }

    // Upsert employees from sheet
    for (const emp of sheetEmployees) {
      const role = POSITION_TO_ROLE[emp.position] ?? "ЦдУД"
      const rankMap: Record<string, number> = ROLE_RANK
      const rank = rankMap[role] ?? 1

      const existing = dbByNickname.get(emp.nickname)

      if (!existing) {
        // Create new account — password = bank account number
        const password = emp.bankAccount || "password"
        await db.query(
          `INSERT INTO users (username, password, full_name, position, rank, avatar, vk_id, position_title, is_default_password)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
           ON CONFLICT (username) DO NOTHING`,
          [
            emp.nickname,
            password,
            `[${role}] ${emp.nickname}`,
            role,
            rank,
            `/avatars/${role === "ПТО" ? "pto" : role === "ЦдУД" ? "cdud" : "management"}.png`,
            emp.vkId,
            emp.position,
          ]
        )
        stats.created++
      } else {
        // Skip Тех. Администратор accounts — never modify them from the sheet
        if (
          existing.secondary_role === "Тех. Администратор" ||
          existing.position === "Тех. Администратор"
        ) {
          stats.skipped++
          continue
        }

        // Update position_title, vk_id, and role if they changed. Never touch password.
        await db.query(
          `UPDATE users SET
            position_title = $2,
            position = $3,
            rank = $4,
            vk_id = COALESCE($5, vk_id),
            updated_at = NOW()
           WHERE id = $1`,
          [existing.id, emp.position, role, rank, emp.vkId]
        )
        stats.updated++
      }
    }

    // Delete accounts NOT in the sheet (except dev account and Тех. Администратор accounts)
    for (const [nickname, dbUser] of dbByNickname.entries()) {
      if (nickname === DEV_NICKNAME) continue
      if (
        dbUser.secondary_role === "Тех. Администратор" ||
        dbUser.position === "Тех. Администратор"
      ) continue
      if (!sheetNicknames.has(nickname)) {
        await db.query("DELETE FROM users WHERE id = $1", [dbUser.id])
        stats.deleted++
      }
    }

    await db.end()

    return NextResponse.json({
      success: true,
      stats,
      employees: sheetEmployees.length,
    })
  } catch (err: any) {
    console.error("[sync-from-sheets]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
