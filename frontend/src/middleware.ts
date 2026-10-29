import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('brandflux_token')?.value
  const onboardingComplete = request.cookies.get('brandflux_onboarding_complete')?.value === 'true'
  const { pathname } = request.nextUrl

  // Define public routes that must never redirect unauthenticated visitors to /login
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/pricing' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static')

  // 1. If accessing a public route, always allow access
  if (isPublicRoute) {
    return NextResponse.next()
  }

  // 2. If no token and trying to access a protected route -> redirect to login
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 3. If token exists but onboarding is not complete -> force onboarding
  if (!onboardingComplete && pathname !== '/onboarding') {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  // 4. If token exists and onboarding is complete, but user tries to access onboarding -> redirect to dashboard
  if (onboardingComplete && pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/signup',
    '/pricing',
    '/dashboard/:path*',
    '/session/:path*',
    '/onboarding/:path*',
    '/settings/:path*',
    '/calendar/:path*',
    '/ideas/:path*',
    '/analytics/:path*'
  ],
}
