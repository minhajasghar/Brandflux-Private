/**
 * Shared media resolution utility for local preview, public R2, and production reverse-proxy routing.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url

  // Extract relative /api/media/... or /static/... path so Next.js rewrites serve it on the same origin & protocol
  if (url.includes('/api/media/')) {
    return url.substring(url.indexOf('/api/media/'))
  }
  if (url.includes('/media/posts/')) {
    return '/api' + url.substring(url.indexOf('/media/posts/'))
  }
  if (url.includes('/media/references/')) {
    return '/api' + url.substring(url.indexOf('/media/references/'))
  }
  if (url.includes('/static/')) {
    return url.substring(url.indexOf('/static/'))
  }

  if (url.startsWith('/')) {
    return url
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  return `/api/media/posts/${url.replace(/^\/+/, '')}`
}

