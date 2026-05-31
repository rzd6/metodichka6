import type { UserRole } from "@/data/users"

// ─── Hidden test account ────────────────────────────────────────────────────
// Not stored in the database. Never shown in any user list.
// Only tech admins can see accounts panel — this account bypasses that entirely.
export const DEV_LOGIN = "v0_dev_rzd"
export const DEV_PASSWORD = "Xk9#mQ3$vR7!pL2@"

export interface DevUser {
  id: string
  nickname: string
  role: UserRole
  secondaryRole: "Тех. Администратор"
  vkAccessToken: string
  reportTag: string
  isDev: true
}

export const ALL_DEV_ROLES: UserRole[] = [
  "Тех. Администратор",
  "Руководство",
  "Заместитель",
  "Старший Состав",
  "ЦдУД",
  "ПТО",
]

export function makeDevUser(role: UserRole = "Тех. Администратор"): DevUser {
  return {
    id: "dev-test-account",
    nickname: DEV_LOGIN,
    role,
    secondaryRole: "Тех. Администратор",
    vkAccessToken: "",
    reportTag: "[DEV]",
    isDev: true,
  }
}

export function isDevAccount(user: { id?: string; isDev?: boolean } | null): boolean {
  if (!user) return false
  return user.id === "dev-test-account" || user.isDev === true
}
