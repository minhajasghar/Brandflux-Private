import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('brandflux_token')?.value
  const onboardingComplete = request.cookies.get('brandflux_onboarding_complete')?.value === 'true'
  const { pathname } = request.nextUrl

  // Define public routes
  const isPublicRoute = pathname === '/' || pathname === '/login' || pathname === '/signup'

  // 1. If no token and trying to access a protected route -> redirect to login
  if (!token && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 2. If token exists and user tries to access login/signup -> redirect appropriately
  if (token && (pathname === '/login' || pathname === '/signup')) {
    if (!onboardingComplete) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // 3. If token exists but onboarding is not complete -> force onboarding
  if (token && !onboardingComplete && pathname !== '/onboarding') {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  // 4. If token exists and onboarding is complete, but user tries to access onboarding -> redirect to dashboard
  if (token && onboardingComplete && pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/signup',
    '/dashboard/:path*',
    '/session/:path*',
    '/onboarding/:path*',
    '/settings/:path*',
    '/calendar/:path*',
    '/ideas/:path*'
  ],
}
