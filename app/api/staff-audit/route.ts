import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

let pool: Pool | null = null
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.POSTGRES_URL_NON_POOLING })
  return pool
}

async function ensureTable() {
  const db = getPool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_audit_log (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action      TEXT NOT NULL,
      actor_id    TEXT NOT NULL,
      actor_nickname TEXT NOT NULL,
      actor_role  TEXT NOT NULL,
      target_id   TEXT,
      target_nickname TEXT,
      old_role    TEXT,
      new_role    TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_staff_audit_created ON staff_audit_log(created_at DESC);
  `)
}

// GET — fetch up to 300 latest entries
export async function GET() {
  try {
    await ensureTable()
    const db = getPool()
    const res = await db.query(
      "SELECT * FROM staff_audit_log ORDER BY created_at DESC LIMIT 300"
    )
    return NextResponse.json({ data: res.rows })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — insert one audit entry
export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const db = getPool()
    const body = await req.json()
    const {
      action,
      actor_id,
      actor_nickname,
      actor_role,
      target_id,
      target_nickname,
      old_role,
      new_role,
    } = body

    const res = await db.query(
      `INSERT INTO staff_audit_log
         (action, actor_id, actor_nickname, actor_role, target_id, target_nickname, old_role, new_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        action,
        actor_id,
        actor_nickname,
        actor_role,
        target_id ?? null,
        target_nickname ?? null,
        old_role ?? null,
        new_role ?? null,
      ]
    )
    return NextResponse.json({ data: res.rows[0] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
