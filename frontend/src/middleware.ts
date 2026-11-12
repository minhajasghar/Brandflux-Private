import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('brandflux_token')?.value
  const onboardingComplete = request.cookies.get('brandflux_onboarding_complete')?.value === 'true'
  const userRole = request.cookies.get('brandflux_user_role')?.value || 'user'
  const { pathname } = request.nextUrl

  // Define public routes that must never redirect unauthenticated visitors to /login
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/pricing' ||
    pathname === '/payment' ||
    pathname === '/verify' ||
    pathname === '/brand-preview' ||
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

  const isAdminRole = userRole === 'admin' || userRole === 'support_admin'
  const isAdminRoute = pathname.startsWith('/admin')

  // 3. Strict Portal Boundary Enforcement:
  // - Admin users CANNOT open user portal routes (redirect back to /admin)
  if (isAdminRole && !isAdminRoute) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  // - Non-admin users CANNOT open admin portal routes (redirect to /dashboard)
  if (!isAdminRole && isAdminRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  const brandRole = request.cookies.get('brandflux_brand_role')?.value || 'creator'
  const isApprover = brandRole === 'approver'

  // 3b. Approver Boundary: Approvers land on /approvals and cannot access onboarding or generator
  if (isApprover) {
    if (pathname === '/onboarding' || pathname === '/session' || pathname === '/pricing' || pathname === '/dashboard') {
      return NextResponse.redirect(new URL('/approvals', request.url))
    }
  }

  // 4. If token exists but onboarding is not complete -> force onboarding (exempt payment & verify & approvers)
  if (!isAdminRole && !isApprover && !onboardingComplete && pathname !== '/onboarding' && pathname !== '/payment' && pathname !== '/verify') {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  // 5. If token exists and onboarding is complete, but user tries to access onboarding -> redirect to dashboard
  if (!isAdminRole && onboardingComplete && pathname === '/onboarding') {
    return NextResponse.redirect(new URL(isApprover ? '/approvals' : '/dashboard', request.url))
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
    '/analytics/:path*',
    '/admin/:path*'
  ],
}
