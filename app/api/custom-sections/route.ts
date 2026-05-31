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
    CREATE TABLE IF NOT EXISTS custom_sections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'FileText',
      content JSONB NOT NULL DEFAULT '[]',
      hidden_from_roles TEXT[] NOT NULL DEFAULT '{}',
      is_hidden BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      section_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS section_audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id TEXT NOT NULL,
      section_title TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_nickname TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      changes JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS builtin_section_overrides (
      section_id TEXT PRIMARY KEY,
      title TEXT,
      icon TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by TEXT NOT NULL DEFAULT ''
    );
  `)
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable()
    const db = getPool()
    const { searchParams } = new URL(req.url)

    if (searchParams.get("type") === "builtin_overrides") {
      const res = await db.query("SELECT * FROM builtin_section_overrides")
      const map: Record<string, { title?: string; icon?: string }> = {}
      for (const row of res.rows) {
        map[row.section_id] = { title: row.title ?? undefined, icon: row.icon ?? undefined }
      }
      return NextResponse.json({ data: map })
    }

    const res = await db.query("SELECT * FROM custom_sections ORDER BY section_order ASC, created_at ASC")
    return NextResponse.json({ data: res.rows })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const db = getPool()
    const body = await req.json()
    const { action } = body

    if (action === "create") {
      const { section, actor } = body
      const res = await db.query(
        `INSERT INTO custom_sections (id, title, icon, content, hidden_from_roles, is_hidden, created_by, updated_by, section_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8) RETURNING *`,
        [
          section.id,
          section.title,
          section.icon,
          JSON.stringify(section.content),
          section.hidden_from_roles ?? [],
          true,
          actor?.nickname ?? "unknown",
          section.section_order ?? 0,
        ]
      )
      await db.query(
        `INSERT INTO section_audit_log (section_id, section_title, action, actor_nickname, actor_role, changes)
         VALUES ($1,$2,'create',$3,$4,$5)`,
        [section.id, section.title, actor?.nickname ?? "unknown", actor?.role ?? "unknown", JSON.stringify({ title: section.title })]
      )
      return NextResponse.json({ data: res.rows[0] })
    }

    if (action === "update") {
      const { id, updates, actor, oldSection } = body
      await db.query(
        `UPDATE custom_sections SET title=$1, icon=$2, content=$3, hidden_from_roles=$4, is_hidden=$5, updated_by=$6, updated_at=NOW(), section_order=$7
         WHERE id=$8`,
        [
          updates.title,
          updates.icon,
          JSON.stringify(updates.content),
          updates.hidden_from_roles ?? [],
          updates.is_hidden ?? false,
          actor?.nickname ?? "unknown",
          updates.section_order ?? 0,
          id,
        ]
      )
      const changes: Record<string, { old: any; new: any }> = {}
      if (oldSection) {
        if (oldSection.title !== updates.title) changes.title = { old: oldSection.title, new: updates.title }
        if (oldSection.icon !== updates.icon) changes.icon = { old: oldSection.icon, new: updates.icon }
        if (JSON.stringify(oldSection.content) !== JSON.stringify(updates.content)) changes.content = { old: oldSection.content, new: updates.content }
        if (JSON.stringify(oldSection.hidden_from_roles) !== JSON.stringify(updates.hidden_from_roles)) changes.hidden_from_roles = { old: oldSection.hidden_from_roles, new: updates.hidden_from_roles }
        if (oldSection.is_hidden !== updates.is_hidden) changes.is_hidden = { old: oldSection.is_hidden, new: updates.is_hidden }
      }
      await db.query(
        `INSERT INTO section_audit_log (section_id, section_title, action, actor_nickname, actor_role, changes)
         VALUES ($1,$2,'update',$3,$4,$5)`,
        [id, updates.title, actor?.nickname ?? "unknown", actor?.role ?? "unknown", JSON.stringify(changes)]
      )
      const res = await db.query("SELECT * FROM custom_sections WHERE id=$1", [id])
      return NextResponse.json({ data: res.rows[0] })
    }

    if (action === "delete") {
      const { id, actor, sectionTitle } = body
      await db.query("DELETE FROM custom_sections WHERE id=$1", [id])
      await db.query(
        `INSERT INTO section_audit_log (section_id, section_title, action, actor_nickname, actor_role, changes)
         VALUES ($1,$2,'delete',$3,$4,$5)`,
        [id, sectionTitle ?? id, actor?.nickname ?? "unknown", actor?.role ?? "unknown", JSON.stringify({})]
      )
      return NextResponse.json({ success: true })
    }

    if (action === "toggle_visibility") {
      const { id, is_hidden, actor, sectionTitle } = body
      await db.query("UPDATE custom_sections SET is_hidden=$1, updated_by=$2, updated_at=NOW() WHERE id=$3", [is_hidden, actor?.nickname ?? "unknown", id])
      await db.query(
        `INSERT INTO section_audit_log (section_id, section_title, action, actor_nickname, actor_role, changes)
         VALUES ($1,$2,'toggle_visibility',$3,$4,$5)`,
        [id, sectionTitle ?? id, actor?.nickname ?? "unknown", actor?.role ?? "unknown", JSON.stringify({ is_hidden: { new: is_hidden } })]
      )
      return NextResponse.json({ success: true })
    }

    if (action === "upsert_builtin_override") {
      const { sectionId, title, icon, actor } = body
      await db.query(
        `INSERT INTO builtin_section_overrides (section_id, title, icon, updated_at, updated_by)
         VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (section_id) DO UPDATE SET title=$2, icon=$3, updated_at=NOW(), updated_by=$4`,
        [sectionId, title ?? null, icon ?? null, actor?.nickname ?? "unknown"]
      )
      await db.query(
        `INSERT INTO section_audit_log (section_id, section_title, action, actor_nickname, actor_role, changes)
         VALUES ($1,$2,'builtin_override',$3,$4,$5)`,
        [sectionId, title ?? sectionId, actor?.nickname ?? "unknown", actor?.role ?? "unknown", JSON.stringify({ title, icon })]
      )
      return NextResponse.json({ success: true })
    }

    if (action === "reset_builtin_override") {
      const { sectionId, actor, originalTitle } = body
      await db.query("DELETE FROM builtin_section_overrides WHERE section_id=$1", [sectionId])
      await db.query(
        `INSERT INTO section_audit_log (section_id, section_title, action, actor_nickname, actor_role, changes)
         VALUES ($1,$2,'builtin_override_reset',$3,$4,$5)`,
        [sectionId, originalTitle ?? sectionId, actor?.nickname ?? "unknown", actor?.role ?? "unknown", JSON.stringify({ reset: true })]
      )
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
