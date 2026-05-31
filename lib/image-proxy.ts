/**
 * Wraps an external image URL through the local /api/image-proxy endpoint.
 * This ensures images load regardless of whether the user has VPN or direct
 * access to external CDNs (Vercel Blob, imgbb, etc.), since the server
 * always has unblocked access to fetch those resources.
 *
 * Pass through local/relative URLs unchanged.
 */

const PROXIED_HOSTS = [
  "hebbkx1anhila5yf.public.blob.vercel-storage.com",
  "i.ibb.co",
  "ibb.co",
  "i.imgbb.com",
]

export function proxyImageUrl(url: string | null | undefined): string {
  if (!url) return ""
  // Already relative or data URI — no proxying needed
  if (url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) return url

  try {
    const parsed = new URL(url)
    if (PROXIED_HOSTS.includes(parsed.hostname)) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`
    }
  } catch {
    // Malformed URL — return as-is
  }
  return url
}
