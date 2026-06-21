/**
 * Copies text to clipboard with execCommand fallback for iframe environments
 * where navigator.clipboard is blocked by Permissions Policy.
 */
export function clipboardCopy(text: string): void {
  const fallback = () => {
    const el = document.createElement("textarea")
    el.value = text
    el.style.position = "fixed"
    el.style.opacity = "0"
    document.body.appendChild(el)
    el.focus()
    el.select()
    document.execCommand("copy")
    document.body.removeChild(el)
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(fallback)
  } else {
    fallback()
  }
}
