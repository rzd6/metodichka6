import { google } from "googleapis"
import { PassThrough } from "node:stream"

const ROOT_FOLDER_ID = "1LJrFBjo9h5uDJaOjAJW3S3Q5Kx6GP87Q"

export const DRIVE_CATEGORIES = {
  weekly: "Еженедельный Отчёт",
  pto: "ПТО",
  cdud: "ЦдУД",
  leader: "Лидерский Отчёт",
  warning: "Снятие выговора",
} as const

export type DriveCategory = keyof typeof DRIVE_CATEGORIES

function getDrive() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (refreshToken && clientId && clientSecret) {
    const auth = new google.auth.OAuth2(clientId, clientSecret)
    auth.setCredentials({ refresh_token: refreshToken })
    return google.drive({ version: "v3", auth })
  }

  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_2
  if (!privateKey) {
    throw new Error("Google OAuth is not configured: set GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET")
  }

  let normalizedKey = privateKey.replace(/\\n/g, "\n").trim()
  let clientEmail = ""
  try {
    const parsed = JSON.parse(normalizedKey)
    if (typeof parsed.private_key === "string") normalizedKey = parsed.private_key.replace(/\\n/g, "\n")
    if (typeof parsed.client_email === "string") clientEmail = parsed.client_email
  } catch {
    // The project variable may contain either the raw PEM key or the service-account JSON.
  }

  if (!clientEmail) clientEmail = "rzdmtaprov6@generatsia-otchetov.iam.gserviceaccount.com"

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: normalizedKey,
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  })

  return google.drive({ version: "v3", auth })
}

async function findOrCreateFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string) {
  const escapedName = name.replace(/'/g, "\\'")
  const result = await drive.files.list({
    q: `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name,webViewLink)",
    pageSize: 1,
    supportsAllDrives: true,
  })
  const existing = result.data.files?.[0]
  if (existing?.id) return existing

  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  })
  return created.data
}

export async function uploadReportFiles(input: {
  category: DriveCategory
  nickname: string
  activityTitle: string
  files: Array<{ name: string; type: string; buffer: Buffer }>
}) {
  const drive = getDrive()
  const categoryFolders = new Map<DriveCategory, { id?: string | null }>()
  for (const [key, name] of Object.entries(DRIVE_CATEGORIES) as Array<[DriveCategory, string]>) {
    categoryFolders.set(key, await findOrCreateFolder(drive, name, ROOT_FOLDER_ID))
  }
  const categoryFolder = categoryFolders.get(input.category)
  if (!categoryFolder?.id) throw new Error("Could not create category folder")
  const userFolder = await findOrCreateFolder(drive, input.nickname.trim(), categoryFolder.id)
  if (!userFolder.id) throw new Error("Could not create user folder")
  const activityFolder = await findOrCreateFolder(drive, input.activityTitle.trim(), userFolder.id)
  if (!activityFolder.id) throw new Error("Could not create activity folder")

  const uploaded = []
  for (const file of input.files) {
    let created
    let lastError: unknown
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        created = await drive.files.create({
          requestBody: { name: file.name, parents: [activityFolder.id] },
          media: {
            mimeType: file.type || "application/octet-stream",
            body: (() => {
              const stream = new PassThrough()
              stream.end(file.buffer)
              return stream
            })(),
          },
          fields: "id,name,mimeType,size,webViewLink,webContentLink",
          supportsAllDrives: true,
        })
        break
      } catch (error) {
        lastError = error
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 700))
      }
    }
    if (!created?.data.id) {
      const message = lastError instanceof Error ? lastError.message : "unknown upload error"
      throw new Error(`Не удалось загрузить файл ${file.name}: ${message}`)
    }
    try {
      await drive.permissions.create({
        fileId: created.data.id,
        requestBody: { type: "anyone", role: "reader" },
        supportsAllDrives: true,
      })
    } catch (error) {
      console.error("[v0] Drive file uploaded but public permission failed", { file: file.name, error })
    }
    uploaded.push({ ...created.data, webViewLink: `https://drive.google.com/file/d/${created.data.id}/view` })
  }

  return {
    folderId: activityFolder.id,
    folderUrl: `https://drive.google.com/drive/folders/${activityFolder.id}`,
    files: uploaded,
  }
}

export function isDriveCategory(value: string): value is DriveCategory {
  return value in DRIVE_CATEGORIES
}

export { ROOT_FOLDER_ID }
