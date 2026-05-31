import { NextResponse } from "next/server"
import { Pool } from "pg"

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

function getPool(): Pool {
  const connectionString = process.env.POSTGRES_URL_NON_POOLING
  if (!connectionString) throw new Error("Не задана переменная POSTGRES_URL_NON_POOLING")
  return new Pool({ connectionString })
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
