import { NextResponse } from "next/server"
import { Pool } from "pg"

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

let pool: Pool | null = null
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.POSTGRES_URL_NON_POOLING })
  return pool
}

export async function GET() {
  try {
    const db = getPool()
    const res = await db.query(
      "SELECT * FROM section_audit_log ORDER BY created_at DESC LIMIT 200"
    )
    return NextResponse.json({ data: res.rows })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
