import { NextResponse } from "next/server"
import { google } from "googleapis"
import { GoogleAuth } from "google-auth-library"
import { Pool } from "pg"

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

const SPREADSHEET_ID = "1CnTpA7Xj7T5Tsofw_oq9S9FldU_AnOd_oiGMLPigEEg"
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

// ─── Position normalisation ───────────────────────────────────────────────────

const POSITION_MAP: Record<string, string> = {
  "Начальник Депо": "Начальник Депо",
  "Первый Заместитель Начальника Депо": "Первый Заместитель Начальника Депо",
  "Зам. Начальника Депо по кадровой работе": "Заместитель Начальника Депо по кадровой работе",
  "Заместитель Начальника Депо по кадровой работе": "Заместитель Начальника Депо по кадровой работе",
  "Зам. Начальника Депо по эксплуатации": "Заместитель Начальника Депо по эксплуатации",
  "Заместитель Начальника Депо по эксплуатации": "Заместитель Начальника Депо по эксплуатации",
  "Начальник ЭО": "Начальник ЭО",
  "Начальник ЦдУД": "Начальник ЦдУД",
  "Начальник ПТО": "Начальник ПТО",
  "Машинист-инструктор / Зам.Нач.ЭО": "Машинист-инструктор/Зам.Нач.ЭО",
  "Машинист-инструктор / Зам.Нач.ЦдУД": "Машинист-инструктор/Зам.Нач.ЦдУД",
  "Машинист-инструктор / Зам.Нач.ПТО": "Машинист-инструктор/Зам.Нач.ПТО",
  "Машинист-инструктор/Зам.Нач.ЭО": "Машинист-инструктор/Зам.Нач.ЭО",
  "Машинист-инструктор/Зам.Нач.ЦдУД": "Машинист-инструктор/Зам.Нач.ЦдУД",
  "Машинист-инструктор/Зам.Нач.ПТО": "Машинист-инструктор/Зам.Нач.ПТО",
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
  "Слесарь-электрик": "Слесарь-электрик",
  "Монтёр пути": "Монтёр пути",
  "Монтер пути": "Монтёр пути",
}

const POSITION_TO_ROLE: Record<string, string> = {
  "Начальник Депо": "Руководство",
  "Первый Заместитель Начальника Депо": "Заместитель",
  "Заместитель Начальника Депо по кадровой работе": "Заместитель",
  "Заместитель Начальника Депо по эксплуатации": "Заместитель",
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
  "Руководство": 9,
  "Заместитель": 8,
  "Старший Состав": 7,
  "ЦдУД": 5,
  "ПТО": 3,
}

// ─── VK extraction ────────────────────────────────────────────────────────────

/** Extract numeric VK user ID from any URL or raw string */
function extractVkIdFromUrl(url: string): string | null {
  if (!url) return null
  // vk.com/idXXXXX
  const idMatch = url.match(/vk\.com\/id(\d+)/i)
  if (idMatch) return idMatch[1]
  // bare number
  const numMatch = url.trim().match(/^\d+$/)
  if (numMatch) return url.trim()
  return null
}

// ─── Sheet parsing ────────────────────────────────────────────────────────────

interface SheetEmployee {
  nickname: string
  position: string   // normalised job title
  role: string       // derived UserRole string
  rank: number
  bankAccount: string
  /** Already-extracted numeric VK id, or null if not present */
  vkId: string | null
}

/** Returns true if the row looks like a section header / totals / empty row */
function isSectionRow(nickname: string, positionRaw: string): boolean {
  if (!nickname) return true
  if (/общее количество/i.test(nickname)) return true
  if (/дирекция|руководящий|отдел|^ЦдУД$|^ПТО$/i.test(nickname)) return true
  if (/никнейм|ранг|должность/i.test(nickname)) return true
  if (!positionRaw || /должность|ранг|никнейм/i.test(positionRaw)) return true
  return false
}

/**
 * Build the employee list from Sheets API `spreadsheets.get` with includeGridData:true.
 * This lets us read actual hyperlink URLs from cells (col I = VK link).
 *
 * Layout (0-indexed columns):
 *   A=0  Никнейм
 *   C=2  Должность
 *   H=7  Банковский счёт (default password)
 *   I=8  ВКонтакте (hyperlink cell — display text is person's name, URL is vk.com/idXXX)
 */
function parseEmployeesFromGridData(sheetData: any): SheetEmployee[] {
  const employees: SheetEmployee[] = []

  // sheetData.data[0] is the first (and only) GridRange
  const rowData: any[] = sheetData?.data?.[0]?.rowData ?? []

  for (const row of rowData) {
    const cells: any[] = row?.values ?? []

    const getCellText = (idx: number) =>
      String(cells[idx]?.formattedValue ?? cells[idx]?.userEnteredValue?.stringValue ?? "").trim()

    const getCellHyperlink = (idx: number): string | null => {
      const cell = cells[idx]
      if (!cell) return null
      // Preferred: explicit hyperlink field set by Google Sheets UI
      if (cell.hyperlink) return cell.hyperlink
      // Fallback: HYPERLINK formula in userEnteredValue
      const formula = cell.userEnteredValue?.formulaValue ?? ""
      const m = formula.match(/HYPERLINK\("([^"]+)"/)
      if (m) return m[1]
      // Fallback: plain URL text
      const text = getCellText(idx)
      if (/https?:\/\//i.test(text)) return text
      return null
    }

    const nickname = getCellText(0)
    const positionRaw = getCellText(2)
    const bankAccount = getCellText(7)
    const vkUrl = getCellHyperlink(8)
    const vkId = vkUrl ? extractVkIdFromUrl(vkUrl) : null

    if (isSectionRow(nickname, positionRaw)) continue

    const normalizedPosition = POSITION_MAP[positionRaw] ?? positionRaw
    const role = POSITION_TO_ROLE[normalizedPosition] ?? "ЦдУД"
    const rank = ROLE_RANK[role] ?? 1

    employees.push({ nickname, position: normalizedPosition, role, rank, bankAccount, vkId })
  }

  return employees
}

// ─── Database helpers ─────────────────────────────────────────────────────────

async function ensureColumns(db: Pool): Promise<void> {
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS position_title TEXT DEFAULT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_default_password BOOLEAN DEFAULT false;
  `)
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const db = getPool()
  try {
    const auth = getAuth()
    const sheetsApi = google.sheets({ version: "v4", auth })

    // Use spreadsheets.get with includeGridData so we can read hyperlink URLs from cells
    const response = await sheetsApi.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      includeGridData: true,
      // Request only the first sheet, columns A-P, all rows
      ranges: ["A:P"],
      fields: "sheets(data(rowData(values(formattedValue,userEnteredValue,hyperlink))))",
    })

    const firstSheet = response.data.sheets?.[0]
    if (!firstSheet) {
      return NextResponse.json({ error: "Лист не найден" }, { status: 404 })
    }

    const sheetEmployees = parseEmployeesFromGridData(firstSheet)

    await ensureColumns(db)

    // Fetch all existing users (columns we need)
    const { rows: dbUsers } = await db.query(`
      SELECT id, username, secondary_role, position_title
      FROM users
    `)

    // Index by nickname (username column in DB)
    const dbByNickname = new Map<string, { id: string; secondary_role: string | null; position_title: string | null }>()
    for (const u of dbUsers) dbByNickname.set(u.username, u)

    const sheetNicknames = new Set(sheetEmployees.map((e) => e.nickname))
    const stats = { created: 0, updated: 0, deleted: 0, skipped: 0 }

    for (const emp of sheetEmployees) {
      const existing = dbByNickname.get(emp.nickname)

      if (!existing) {
        // ── New account ──────────────────────────────────────────────────────
        // Password = bank account number from col H; flag it as default
        const password = emp.bankAccount.trim() || "password123"
        await db.query(
          `INSERT INTO users
             (username, password, full_name, position, rank, avatar, vk_id, position_title, is_default_password)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
           ON CONFLICT (username) DO NOTHING`,
          [
            emp.nickname,
            password,
            emp.nickname,
            emp.role,
            emp.rank,
            "/avatars/cdud.png",
            emp.vkId,
            emp.position,
          ]
        )
        stats.created++
      } else {
        // ── Existing account ─────────────────────────────────────────────────
        // Skip Тех. Администратор — never overwrite their data from the sheet
        if (existing.secondary_role === "Тех. Администратор" || existing.position_title === "Тех. Администратор") {
          stats.skipped++
          continue
        }

        // Update role, rank, position_title.
        // VK: only set if the sheet has a value AND the DB currently has none.
        // Password is NEVER touched for existing accounts.
        await db.query(
          `UPDATE users SET
             position      = $2,
             rank          = $3,
             position_title = $4,
             vk_id         = CASE WHEN $5::text IS NOT NULL AND (vk_id IS NULL OR vk_id = '') THEN $5::text ELSE vk_id END,
             updated_at    = NOW()
           WHERE id = $1`,
          [existing.id, emp.role, emp.rank, emp.position, emp.vkId]
        )
        stats.updated++
      }
    }

    // Delete accounts absent from the sheet (except dev & Тех. Администратор)
    for (const [nickname, dbUser] of dbByNickname.entries()) {
      if (nickname === DEV_NICKNAME) continue
      if (dbUser.secondary_role === "Тех. Администратор" || dbUser.position_title === "Тех. Администратор") continue
      if (!sheetNicknames.has(nickname)) {
        await db.query("DELETE FROM users WHERE id = $1", [dbUser.id])
        stats.deleted++
      }
    }

    await db.end()
    return NextResponse.json({ success: true, stats, total: sheetEmployees.length })
  } catch (err: any) {
    console.error("[sync-from-sheets]", err)
    try { await db.end() } catch {}
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
