import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Fast, optimistic gate: no session cookie means not signed in. The real check
 * (session validity and workspace membership) happens on the server in
 * `getViewer()` for every page and API call.
 */
export function middleware(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/agents/:path*'],
};
