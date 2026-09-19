import { NextRequest, NextResponse } from "next/server"
import { isDriveCategory, uploadReportFiles } from "@/lib/google-drive"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const category = String(formData.get("category") ?? "")
    const nickname = String(formData.get("nickname") ?? "").trim()
    const activityTitle = String(formData.get("activityTitle") ?? "").trim()
    const entries = formData.getAll("file")

    if (!isDriveCategory(category) || !nickname || !activityTitle || entries.length === 0) {
      return NextResponse.json({ error: "category, nickname, activityTitle and at least one file are required" }, { status: 400 })
    }

    const files = []
    let totalSize = 0
    const maxTotalSize = 3.5 * 1024 * 1024
    for (const entry of entries) {
      if (!(entry instanceof File)) continue
      if (!entry.type.startsWith("image/") && !entry.type.startsWith("application/pdf")) {
        return NextResponse.json({ error: "Only images and PDF files are supported" }, { status: 400 })
      }
      if (entry.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "Each file must be smaller than 15 MB" }, { status: 413 })
      }
      totalSize += entry.size
      if (totalSize > maxTotalSize) {
        return NextResponse.json({ error: "The combined upload must be smaller than 3.5 MB" }, { status: 413 })
      }
      files.push({ name: entry.name, type: entry.type, buffer: Buffer.from(await entry.arrayBuffer()) })
    }

    const result = await uploadReportFiles({ category, nickname, activityTitle, files })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Google Drive upload failed", error)
    const message = error instanceof Error ? error.message : "Unknown upload error"
    return NextResponse.json({ error: "Google Drive upload failed", details: message }, { status: 500 })
  }
}
