/**
 * "Имя Фамилия" для постоянного блока [Должность | Имя Фамилия] в приказах.
 * Хранится только локально (не привязано к БД), редактируется в разделе
 * «Приказы» или в настройках (вкладка «Аккаунт»). Оба места синхронизируются
 * через localStorage + кастомное событие.
 */

export const ORDER_SIGNER_NAME_KEY = "rzd-order-signer-name"
export const ORDER_SIGNER_NAME_EVENT = "orderSignerNameUpdated"

export function getOrderSignerName(): string {
  if (typeof window === "undefined") return ""
  try {
    return localStorage.getItem(ORDER_SIGNER_NAME_KEY) ?? ""
  } catch {
    return ""
  }
}

export function setOrderSignerName(name: string) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(ORDER_SIGNER_NAME_KEY, name)
    window.dispatchEvent(new Event(ORDER_SIGNER_NAME_EVENT))
  } catch {
    // ignore
  }
}

/** Должность текущего пользователя для блока подписи приказа */
export function getSignerPosition(): string {
  if (typeof window === "undefined") return ""
  try {
    const u = JSON.parse(localStorage.getItem("currentUser") || "null")
    return u?.position || u?.role || ""
  } catch {
    return ""
  }
}
