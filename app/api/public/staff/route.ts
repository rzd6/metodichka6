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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// GET /api/public/staff
// Returns leadership & senior staff list (no auth required).
// Each entry: { username, position_title, role, rank }
export async function GET(_req: NextRequest) {
  try {
    const db = getPool()
    const res = await db.query(`
      SELECT
        username,
        position        AS role,
        position_title,
        rank
      FROM users
      WHERE position IN (
        'Руководство',
        'Заместитель',
        'Старший Состав',
        'Тех. Администратор'
      )
        AND position_title IS NOT NULL
      ORDER BY rank DESC, created_at ASC
    `)

    const staff = res.rows.map((r) => ({
      username: r.username as string,
      role: r.role as string,
      positionTitle: r.position_title as string,
      rank: Number(r.rank),
    }))

    return NextResponse.json({ ok: true, data: staff }, { headers: CORS_HEADERS })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, data: [] }, { status: 500, headers: CORS_HEADERS })
  }
}
