import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.POSTGRES_URL_NON_POOLING })
  }
  return pool
}

async function ensureTables() {
  const db = getPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS train_shifts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      train_id UUID NOT NULL,
      train_number INTEGER NOT NULL,
      claimed_by_nickname TEXT NOT NULL,
      claimed_by_role TEXT NOT NULL,
      shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(train_number, shift_date)
    );
    -- ТЕХ-слоты: старший состав+ занимает время отправления в направлении
    CREATE TABLE IF NOT EXISTS teh_slots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      direction TEXT NOT NULL,           -- 'mirny-privolzhsk' | 'privolzhsk-mirny'
      slot_time TEXT NOT NULL,           -- 'HH:MM'
      claimed_by_nickname TEXT NOT NULL,
      claimed_by_role TEXT NOT NULL,
      shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(direction, slot_time, shift_date)
    );
  `)
}

// Роли, имеющие право занимать ТЕХ-слоты
const TEH_ALLOWED_ROLES = ["Руководство", "Заместитель", "Старший Состав", "Тех. Администратор"]

// Слоты для пассажирских: через 30 мин, туристических: через 45 мин
function nextAllowedMinute(departMin: number, trainClass: string): number {
  // Пассажирский (ПАСС): следующий слот +30 мин
  // Туристический (ТУР): следующий слот +45 мин
  if (trainClass === "Туристический") return departMin + 45
  return departMin + 30
}

// GET /api/train-shifts?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    await ensureTables()
    const db = getPool()
    const { searchParams } = new URL(req.url)
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10)
    const withTrains = searchParams.get("with_trains") === "1"
    const tehSlots = searchParams.get("teh_slots") === "1"

    // Вернуть ТЕХ-слоты
    if (tehSlots) {
      const res = await db.query(
        "SELECT * FROM teh_slots WHERE shift_date = $1 ORDER BY direction, slot_time ASC",
        [date]
      )
      return NextResponse.json({ data: res.rows }, { headers: corsHeaders() })
    }

    if (withTrains) {
      const res = await db.query(
        `SELECT ts.*, t.direction, t.class, t.depart_start, t.arrive_middle,
                t.depart_middle, t.arrive_end, t.platform_start, t.platform_middle, t.platform_end
         FROM train_shifts ts
         JOIN trains t ON t.id = ts.train_id
         WHERE ts.shift_date = $1
         ORDER BY ts.train_number ASC`,
        [date]
      )
      return NextResponse.json({ data: res.rows }, { headers: corsHeaders() })
    }

    const res = await db.query(
      "SELECT * FROM train_shifts WHERE shift_date = $1 ORDER BY train_number ASC",
      [date]
    )
    return NextResponse.json({ data: res.rows }, { headers: corsHeaders() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders() })
  }
}

// POST /api/train-shifts — занять обычный рейс или ТЕХ-слот
export async function POST(req: NextRequest) {
  try {
    await ensureTables()
    const db = getPool()
    const body = await req.json()

    // ── ТЕХ-слот ──────────────────────────────────────────────────────────
    if (body.teh_slot) {
      const { direction, slot_time, claimed_by_nickname, claimed_by_role, shift_date } = body
      const date = shift_date || new Date().toISOString().slice(0, 10)

      // Только старший состав и выше
      if (!TEH_ALLOWED_ROLES.includes(claimed_by_role)) {
        return NextResponse.json({ error: "Недостаточно прав для занятия ТЕХ-рейса" }, { status: 403 })
      }

      // Проверка: нет ли уже занятого обычного рейса в этом направлении в это время
      const conflicts = await db.query(
        `SELECT ts.id FROM train_shifts ts
         JOIN trains t ON t.id = ts.train_id
         WHERE ts.shift_date = $1
           AND t.direction = $2
           AND t.depart_start = $3`,
        [date, direction, slot_time]
      )
      if (conflicts.rows.length > 0) {
        return NextResponse.json({ error: "На это время в данном направлении уже занят обычный рейс" }, { status: 409 })
      }

      const res = await db.query(
        `INSERT INTO teh_slots (direction, slot_time, claimed_by_nickname, claimed_by_role, shift_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (direction, slot_time, shift_date) DO NOTHING
         RETURNING *`,
        [direction, slot_time, claimed_by_nickname, claimed_by_role, date]
      )
      return NextResponse.json({ data: res.rows[0] ?? null })
    }

    // ── Обычный рейс ──────────────────────────────────────────────────────
    const { train_id, train_number, claimed_by_nickname, claimed_by_role, shift_date, train_class, train_direction, depart_start } = body
    const date = shift_date || new Date().toISOString().slice(0, 10)

    if (!train_id || !train_number || !claimed_by_nickname) {
      return NextResponse.json({ error: "train_id, train_number, claimed_by_nickname обязательны" }, { status: 400 })
    }

    // 1. Нельзя занять рейс в то же направление и то же время отправления если ТЕХ-слот уже занят
    if (train_direction && depart_start) {
      const tehConflict = await db.query(
        `SELECT id FROM teh_slots
         WHERE shift_date = $1 AND direction = $2 AND slot_time = $3`,
        [date, train_direction, depart_start]
      )
      if (tehConflict.rows.length > 0) {
        return NextResponse.json({ error: "На это время в данном направлении занят ТЕХ-рейс" }, { status: 409 })
      }
    }

    // 2. Нельзя занять два рейса в одном направлении в одно время отправления
    if (train_direction && depart_start) {
      const sameDirTime = await db.query(
        `SELECT ts.id FROM train_shifts ts
         JOIN trains t ON t.id = ts.train_id
         WHERE ts.shift_date = $1
           AND ts.claimed_by_nickname = $2
           AND t.direction = $3
           AND t.depart_start = $4`,
        [date, claimed_by_nickname, train_direction, depart_start]
      )
      if (sameDirTime.rows.length > 0) {
        return NextResponse.json({ error: "Нельзя занять два рейса в одном направлении на одно время отправления" }, { status: 409 })
      }
    }

    // 3. Правило слотов: пассажирский +30 мин, туристический +45 мин (для текущего пользователя)
    if (train_direction && depart_start && train_class) {
      const userShifts = await db.query(
        `SELECT t.depart_start, t.class FROM train_shifts ts
         JOIN trains t ON t.id = ts.train_id
         WHERE ts.shift_date = $1
           AND ts.claimed_by_nickname = $2
           AND t.direction = $3`,
        [date, claimed_by_nickname, train_direction]
      )

      const newMins = timeToMins(depart_start)
      for (const row of userShifts.rows) {
        const existMins = timeToMins(row.depart_start)
        if (existMins < 0 || newMins < 0) continue
        const minGap = nextAllowedMinute(existMins, row.class) - existMins
        if (Math.abs(newMins - existMins) < minGap) {
          return NextResponse.json({
            error: `После ${row.class === "Туристический" ? "туристического" : "пассажирского"} рейса следующий можно занять не раньше чем через ${minGap} мин`,
          }, { status: 409 })
        }
      }
    }

    const res = await db.query(
      `INSERT INTO train_shifts (train_id, train_number, claimed_by_nickname, claimed_by_role, shift_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (train_number, shift_date) DO NOTHING
       RETURNING *`,
      [train_id, train_number, claimed_by_nickname, claimed_by_role, date]
    )
    return NextResponse.json({ data: res.rows[0] ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/train-shifts — освободить рейс или ТЕХ-слот
export async function DELETE(req: NextRequest) {
  try {
    await ensureTables()
    const db = getPool()
    const body = await req.json()

    if (body.teh_slot_id) {
      await db.query("DELETE FROM teh_slots WHERE id = $1", [body.teh_slot_id])
      return NextResponse.json({ success: true }, { headers: corsHeaders() })
    }

    if (body.id) {
      await db.query("DELETE FROM train_shifts WHERE id = $1", [body.id])
    } else if (body.train_number && body.shift_date) {
      await db.query(
        "DELETE FROM train_shifts WHERE train_number = $1 AND shift_date = $2",
        [body.train_number, body.shift_date]
      )
    } else {
      return NextResponse.json({ error: "id or (train_number + shift_date) required" }, { status: 400 })
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders() })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

function timeToMins(t: string | null | undefined): number {
  if (!t) return -1
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}
