import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, isOwnerToken } from './lib/server/auth';

export async function middleware(request: NextRequest) {
  if (await isOwnerToken(request.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/agents/:path*'],
};
