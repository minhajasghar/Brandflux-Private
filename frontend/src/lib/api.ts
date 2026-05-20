import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor for tokens
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('brandflux_token') || sessionStorage.getItem('brandflux_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Handle 401 Unauthorized globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('brandflux_token')
        sessionStorage.removeItem('brandflux_token')
        document.cookie = 'brandflux_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;'
        document.cookie = 'brandflux_onboarding_complete=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;'
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export async function signup(data: any) {
  const response = await api.post('/auth/signup', data)
  const { token, onboarding_complete } = response.data
  if (typeof window !== 'undefined') {
    localStorage.setItem('brandflux_token', token)
    // Default signup behavior is persistent login
    document.cookie = `brandflux_token=${token}; path=/; max-age=604800;`
    document.cookie = `brandflux_onboarding_complete=${onboarding_complete ? 'true' : 'false'}; path=/; max-age=604800;`
  }
  return response.data
}

export async function login(data: any, rememberMe: boolean = false) {
  const response = await api.post('/auth/login', data)
  const { token, onboarding_complete } = response.data
  if (typeof window !== 'undefined') {
    if (rememberMe) {
      localStorage.setItem('brandflux_token', token)
      sessionStorage.removeItem('brandflux_token')
      document.cookie = `brandflux_token=${token}; path=/; max-age=604800;`
      document.cookie = `brandflux_onboarding_complete=${onboarding_complete ? 'true' : 'false'}; path=/; max-age=604800;`
    } else {
      sessionStorage.setItem('brandflux_token', token)
      localStorage.removeItem('brandflux_token')
      // Session-only cookie (no max-age/expires)
      document.cookie = `brandflux_token=${token}; path=/;`
      document.cookie = `brandflux_onboarding_complete=${onboarding_complete ? 'true' : 'false'}; path=/;`
    }
  }
  return response.data
}

export async function getProfile() {
  const response = await api.get('/auth/me')
  return response.data
}

export async function scanWebsite(url: string) {
  const response = await api.post('/brand/scan-website', { website_url: url })
  return response.data
}

export async function getDailyQuestions() {
  const response = await api.post('/sessions/questions')
  return response.data
}

export async function generateContent(data: any) {
  const response = await api.post('/sessions/generate-content', data)
  return response.data
}

export default api
