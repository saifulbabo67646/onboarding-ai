import 'server-only';
import { headers } from 'next/headers';

/** Public origin for share links (PUBLIC_BASE_URL, else the request's host). */
export async function publicOrigin(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Origin for links in emails, where there is no request to read it from. */
export function appOrigin(): string {
  return (
    process.env.PUBLIC_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}
