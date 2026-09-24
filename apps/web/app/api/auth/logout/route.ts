import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE } from '@/lib/server/auth';

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.delete(AUTH_COOKIE);
  return response;
}
