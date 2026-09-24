import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, ownerToken } from '@/lib/server/auth';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/dashboard');
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const expected = process.env.DASHBOARD_PASSWORD;
  if (expected && password !== expected) {
    return NextResponse.redirect(
      new URL(`/login?error=1&next=${encodeURIComponent(target)}`, request.url),
      303,
    );
  }
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  if (expected) {
    response.cookies.set(AUTH_COOKIE, await ownerToken(expected), {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    });
  }
  return response;
}
