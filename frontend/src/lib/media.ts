/**
 * Shared media resolution utility for local preview, public R2, and multi-system LAN routing.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return ''
  
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    const currentHost = window.location.hostname
    url = url.replace(/http:\/\/localhost:8000/g, `http://${currentHost}:8000`)
             .replace(/http:\/\/127\.0\.0\.1:8000/g, `http://${currentHost}:8000`)
  }
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  const host = typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? window.location.hostname
    : 'localhost'
  const base = `http://${host}:8000`
  const path = url.startsWith('/') ? url : `/${url}`
  return `${base.replace(/\/+$/, '')}${path}`
}

