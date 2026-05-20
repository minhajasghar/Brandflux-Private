export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('brandflux_token')
  }
  return null
}

export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('brandflux_token', token)
    document.cookie = `brandflux_token=${token}; path=/; max-age=604800;`
  }
}

export function removeToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('brandflux_token')
    document.cookie = 'brandflux_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;'
  }
}

export function isLoggedIn(): boolean {
  return !!getToken()
}
